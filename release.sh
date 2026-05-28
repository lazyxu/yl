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
  # 复制 server 目录下的所有内容（包括隐藏文件）到发布目录根
  cp -r server/. "$outdir/"
  # 删除可能存在的 node_modules
  rm -rf "$outdir/node_modules" || true
  echo "==> 将前端构建产物复制到 dist（后端将从 ./dist 提供静态文件）"
  cp -r "$build_dir" "$outdir/dist"
fi

echo "==> 复制项目配置文件"
for f in package.json yarn.lock package-lock.json README.md; do
  [ -f "$f" ] && cp "$f" "$outdir/"
done

echo "==> 完成：发布目录已生成 -> ${outdir}"

echo "使用示例： ./release.sh  （请确保脚本有执行权限：chmod +x release.sh）"
