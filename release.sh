#!/usr/bin/env bash
set -euo pipefail

# release.sh
# 用途：构建前端，收集后端，生成发布包 releases/release-<version>-<timestamp>.tar.gz

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

timestamp=$(date +%Y%m%d%H%M%S)
version=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version||'0.0.0')")
release_name="release-${version}-${timestamp}"

echo "==> 开始发布打包：${release_name}"

echo "==> 构建前端（vite build）"
if command -v yarn >/dev/null 2>&1; then
  yarn build
else
  npm run build
fi

build_dir="dist"
if [ ! -d "$build_dir" ]; then
  echo "错误：构建产物 ${build_dir} 未找到。请先确认 \\"yarn build\\" 或 \\\"npm run build\\\" 成功。"
  exit 1
fi

echo "==> 准备发布目录 releases/${release_name}/"
releases_dir="releases"
outdir="$releases_dir/$release_name"
rm -rf "$outdir"
mkdir -p "$outdir"

echo "==> 不再复制顶层 dist，前端构建产物将只放在 server/dist"

if [ -d "server" ]; then
  echo "==> 复制后端代码：将 server 内容展开为发布顶层，并移除 node_modules"
  # 复制 server 目录下的所有内容（包括隐藏文件）到发布目录根，但排除 server/dist
  # 使用 bash dotglob 来包含隐藏文件
  (shopt -s dotglob; for p in server/* server/.[!.]* server/..?*; do
    [ -e "$p" ] || continue
    base=$(basename "$p")
    # 跳过 server/dist 以及常见锁文件与 .envd（保留 server/.env 的复制）
    if [ "$base" = "dist" ] || [ "$base" = "yarn.lock" ] || [ "$base" = "package-lock.json" ] || [ "$base" = ".envd" ]; then
      continue
    fi
    cp -r "$p" "$outdir/"
  done)
  # 删除可能存在的 node_modules
  rm -rf "$outdir/node_modules" || true
  echo "==> 将前端构建产物复制到 dist（后端将从 ./dist 提供静态文件）"
  cp -r "$build_dir" "$outdir/dist"
fi

echo "==> 处理发布 package.json（仅从 server/package.json 复制）"
# 仅复制 server/package.json 到发布目录（不从根目录回退）
if [ -f "server/package.json" ]; then
  cp "server/package.json" "$outdir/package.json"
fi

echo "==> 在发布目录生成一键安装并启动脚本 (start.sh)"
cat > "$outdir/start.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

echo "==> 安装生产依赖 (npm install --production)"
npm install --production

if [ ! -f .env ]; then
  echo "警告：当前目录未发现 .env，建议先复制 .env.example 并填写真实配置："
  echo "  cp .env.example .env && vim .env"
fi

APP_NAME="yl"

if [ "${1-}" = "pm2" ]; then
  echo "==> 使用 pm2 启动（后台） -> 名称: ${APP_NAME}"
  # 先尝试删除已有同名进程，避免端口冲突（支持全局 pm2 或 npx）
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  else
    # 使用 npx 删除旧进程（若不存在或 npx 需安装，会被忽略）
    npx pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  fi

  if command -v pm2 >/dev/null 2>&1; then
    pm2 start index.js --name "$APP_NAME" --update-env
  else
    echo "pm2 未全局安装，尝试使用 npx pm2 来启动（会临时下载/使用本地 pm2）"
    npx pm2 start index.js --name "$APP_NAME" --update-env
  fi
  echo "pm2 已启动，运行 'pm2 status' 查看进程，'pm2 logs ${APP_NAME}' 查看日志。"
else
  echo "==> 启动服务"
  node index.js
fi
SH
chmod +x "$outdir/start.sh" || true

echo "==> 完成：发布目录已生成 -> ${outdir}"

echo "使用示例： ./release.sh  （请确保脚本有执行权限：chmod +x release.sh）"
