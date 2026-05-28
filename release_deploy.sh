#!/usr/bin/env bash
set -euo pipefail

# release_deploy.sh
# 用途：调用 release.sh 生成发布包，打包为 tar.gz，并（可选）通过 scp 上传到远端并在远端解包、切换 current、以 pm2 启动。
# 默认为演示模式（dry-run）：只在本地打包并打印 scp/ssh 命令；使用 --upload 才会实际执行远端传输与启动。

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

UPLOAD=0
UPLOAD_ENV=1
REMOTE_USER="root"
REMOTE_HOST="t-fluid.com"
REMOTE_BASE="/yl0126"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --upload) UPLOAD=1; shift ;;
    --with-env) UPLOAD_ENV=1; shift ;;
    --no-with-env|--without-env) UPLOAD_ENV=0; shift ;;
    --host) REMOTE_HOST="$2"; shift 2 ;;
    --user) REMOTE_USER="$2"; shift 2 ;;
    --help) echo "Usage: $0 [--upload] [--with-env|--no-with-env] [--host host] [--user user]"; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "==> 生成发布（调用 ./release.sh）"
if [ ! -x ./release.sh ]; then
  echo "错误：缺少可执行的 release.sh" >&2
  exit 1
fi
./release.sh

latest=$(ls -1 releases | grep '^release-' | sort | tail -n1)
if [ -z "$latest" ]; then
  echo "错误：未找到 releases 下的发布目录" >&2
  exit 1
fi
release_dir="releases/$latest"

echo "==> 准备发布目录: $release_dir"

# 不再创建压缩包，改为直接将发布目录通过 scp -r 复制到远端 ${REMOTE_BASE}
# 使用 tar over ssh：在本地打包发布目录内容并在远端直接解到 ${REMOTE_BASE}，实现一次性无痕写入目标目录
scp_cmd="tar -C ${release_dir} -czf - . | ssh ${REMOTE_USER}@${REMOTE_HOST} 'mkdir -p ${REMOTE_BASE} && tar -C ${REMOTE_BASE} -xzf -'"
ssh_cmd="ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_BASE} && ./start.sh pm2'"

if [ "$UPLOAD" -eq 0 ]; then
  echo "==> 演示模式（未实际上传）。可使用 --upload 执行上传与远端启动。"
  echo "示例一次性写入命令（tar over ssh）："
  echo "  $scp_cmd"
  echo "示例远端启动命令:"
  echo "  $ssh_cmd"
  if [ "$UPLOAD_ENV" -eq 1 ]; then
    echo "注意：发布将上传本地 server/.env 到远端（默认开启）。如需禁用，请使用 --no-with-env。示例命令："
    echo "  scp server/.env ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_BASE}/${latest}/.env"
  else
    echo "注意：已禁用 .env 上传（使用 --with-env 可强制上传）。"
  fi
  exit 0
fi

echo "==> 开始上传到 ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_BASE}（使用 tar over ssh）" 
echo "运行: $scp_cmd"
if [ "$UPLOAD" -eq 1 ]; then
  # 执行流式打包并在远端解压到目标目录
  tar -C "$release_dir" -czf - . | ssh ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${REMOTE_BASE} && tar -C ${REMOTE_BASE} -xzf -"
  echo "上传完成。"
  if [ "$UPLOAD_ENV" -eq 1 ]; then
    echo "注意：发布目录内若包含 .env，则已随同上传。"
  fi
  # 上传并启用 nginx 配置（模板位于 deploy/nginx/yl0126.conf）
  if [ -f "deploy/nginx/yl0126.conf" ]; then
    echo "准备并上传 nginx 配置模板到远端 /etc/nginx/sites-available/"
    echo "上传 nginx 配置到远端 /tmp 并移动到 /etc/nginx/conf.d/（需要 sudo 权限时会使用 sudo）"
    # 直接将仓库中的配置文件上传到远端 /tmp，再在远端移动到 /etc/nginx/conf.d/
    scp deploy/nginx/yl0126.conf ${REMOTE_USER}@${REMOTE_HOST}:/tmp/yl0126.conf
    if [ "${REMOTE_USER}" = "root" ]; then
      ssh ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p /etc/nginx/conf.d && mv /tmp/yl0126.conf /etc/nginx/conf.d/yl0126.conf && nginx -t && systemctl reload nginx || echo 'nginx reload failed'"
    else
      ssh ${REMOTE_USER}@${REMOTE_HOST} "sudo mkdir -p /etc/nginx/conf.d && sudo mv /tmp/yl0126.conf /etc/nginx/conf.d/yl0126.conf && sudo nginx -t && sudo systemctl reload nginx || echo 'nginx reload failed'"
    fi
  else
    echo "警告：未在 repo 中找到 deploy/nginx/yl0126.conf，跳过 nginx 配置上传。"
  fi
  echo "在远端执行启动："
  echo "运行: $ssh_cmd"
  ssh ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_BASE} && ./start.sh pm2"
else
  echo "演示模式，未实际执行上传。"
fi

echo "部署完成。远端 pm2 状态建议手动检查： ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 status'"
