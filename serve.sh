#!/usr/bin/env bash
# 一键在本地起服务（本机 + 局域网手机都能访问）。
#   用法：bash serve.sh          # 默认 8788 端口
#         bash serve.sh 9000     # 指定端口
# 关键：脚本会自己切到项目目录，所以在任何位置执行都不会服务错文件夹。
set -uo pipefail

cd "$(dirname "$0")" || exit 1          # ← 这一行保证永远服务本站目录
PORT="${1:-8788}"

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
if [ -z "$LAN_IP" ]; then LAN_IP="$(ipconfig getifaddr en1 2>/dev/null)"; fi

echo "项目目录: $PWD"
echo "电脑访问: http://127.0.0.1:$PORT/"
if [ -n "$LAN_IP" ]; then
  echo "手机访问（需同一 Wi-Fi）: http://$LAN_IP:$PORT/"
else
  echo "手机访问: 未检测到 Wi-Fi 内网地址（en0/en1）"
fi

if [ -f data/zhenti.json ]; then
  N="$(python3 -c "import json;print(len(json.load(open('data/zhenti.json',encoding='utf-8'))['questions']))" 2>/dev/null)"
  echo "本机真题库: 已就绪（${N:-?} 题，仅本机，不会随公网发布）"
else
  echo "本机真题库: 未导入（可选，见 README「本机真题库」一节）"
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo
  echo "⚠️  端口 $PORT 已被占用，可能是你之前起的服务。先按 Ctrl-C 停掉旧的，或换个端口：bash serve.sh 8789"
fi

echo "按 Ctrl-C 停止。"
echo
exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory .
