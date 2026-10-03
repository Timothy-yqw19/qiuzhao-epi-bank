#!/usr/bin/env bash
# 一键在本地起服务（本机 + 局域网手机都能访问），并且不会因为端口冲突吐一堆 Python 堆栈。
#
#   bash serve.sh          # 默认 8788
#   bash serve.sh 9000     # 指定端口
#
# 三种情况都会被妥善处理：
#   1) 端口上已经跑着本站      → 直接告诉你去打开，不再重复起一个
#   2) 端口被别的程序占用      → 自动往后找空闲端口
#   3) 端口空闲                → 正常启动
set -u          # 注意：不要开 pipefail（grep -q 提前退出会让 curl 得到 SIGPIPE，导致判断恒为假）

cd "$(dirname "$0")" || exit 1          # ← 保证永远服务本站目录，而不是当前目录
PORT="${1:-8788}"

lan_ip() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
is_our_site() {
  local body
  body="$(curl -s --max-time 3 "http://127.0.0.1:$1/" 2>/dev/null)"
  case "$body" in *秋招行测题库*) return 0 ;; *) return 1 ;; esac
}

echo "项目目录: $PWD"

# ---- 情况 1：本站已经在跑 ----
if port_busy "$PORT" && is_our_site "$PORT"; then
  IP="$(lan_ip)"
  echo "✅ 端口 $PORT 上已经有本站服务在运行，不用再起一个。直接打开："
  echo "   电脑: http://127.0.0.1:$PORT/"
  if [ -n "$IP" ]; then echo "   手机: http://$IP:$PORT/"; fi
  echo
  echo "（想换端口就指定一个没被占用的，例如 bash serve.sh 9000）"
  exit 0
fi

# ---- 情况 2：端口被别的程序占用 → 自动往后找 ----
START="$PORT"
if port_busy "$PORT"; then
  echo "⚠️  端口 $PORT 被其他程序占用："
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print "     PID "$2"  "$1"  "$9}'
  while port_busy "$PORT" && [ "$PORT" -lt $((START + 20)) ]; do PORT=$((PORT + 1)); done
  if port_busy "$PORT"; then
    echo "❌ $START–$((START + 20)) 都被占用了，请手动指定一个，例如：bash serve.sh 9000"
    exit 1
  fi
  echo "   → 已自动改用空闲端口 $PORT"
fi

# ---- 情况 3：正常启动 ----
IP="$(lan_ip)"
echo "电脑访问: http://127.0.0.1:$PORT/"
if [ -n "$IP" ]; then
  echo "手机访问（需同一 Wi-Fi）: http://$IP:$PORT/"
else
  echo "手机访问: 未检测到 Wi-Fi 内网地址（en0/en1）"
fi

if [ -f data/zhenti.json ]; then
  N="$(python3 -c "import json;print(len(json.load(open('data/zhenti.json',encoding='utf-8'))['questions']))" 2>/dev/null)"
  echo "本机真题库: 已就绪（${N:-?} 题，仅本机，不会随公网发布）"
else
  echo "本机真题库: 未导入（可选，见 README「本机真题库」一节）"
fi

echo "按 Ctrl-C 停止。"
echo
exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory .
