#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把生成好的 index.html 变成一个「仓库根目录即网站」的静态站点（可直接上 GitHub Pages）。

产出（都落在项目根目录）：
  index.html              # 由 build_html.py 生成，本脚本不再动它
  manifest.webmanifest    # PWA：可「添加到主屏幕」
  sw.js                   # Service Worker：离线可用，缓存版本 = index.html 内容哈希
  icons/*.png             # 图标（Pillow 生成，纯几何图形，不依赖字体）
  .nojekyll               # GitHub Pages 用（避免下划线开头的目录被忽略）

用法：build_html.py → build_site.py
"""

import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, "index.html")
ICONS = os.path.join(HERE, "icons")

ACCENT = (47, 109, 246)      # #2f6df6
INK = (255, 255, 255)


def make_icon(path, size):
    """画一个圆角蓝底 + 白色对勾的图标（纯几何，不依赖系统字体）。"""
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = size * 0.06
    r = size * 0.22
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=ACCENT)

    lw = max(2, int(size * 0.085))
    p1 = (size * 0.28, size * 0.52)
    p2 = (size * 0.43, size * 0.68)
    p3 = (size * 0.73, size * 0.33)
    d.line([p1, p2], fill=INK, width=lw, joint="curve")
    d.line([p2, p3], fill=INK, width=lw, joint="curve")
    for p in (p1, p2, p3):
        d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=INK)

    img.save(path, "PNG")


def main():
    if not os.path.exists(INDEX):
        raise SystemExit("先跑 build_html.py 生成 index.html")
    html = open(INDEX, encoding="utf-8").read()
    version = hashlib.md5(html.encode()).hexdigest()[:10]

    os.makedirs(ICONS, exist_ok=True)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180), ("icon-maskable-512.png", 512)]:
        make_icon(os.path.join(ICONS, name), size)

    manifest = {
        "name": "秋招行测题库 · 银行 EPI 行测刷题",
        "short_name": "行测题库",
        "description": "银行 EPI 行测刷题库：手写真题/仿真题 + 按考点批量生成的练习题，每题带破题技巧与解析，支持思路笔记、错题本与 21 天刷题计划。",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#f5f6f8",
        "theme_color": "#2f6df6",
        "lang": "zh-CN",
        "icons": [
            {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    with open(os.path.join(HERE, "manifest.webmanifest"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    sw = """/* 秋招行测题库 Service Worker —— 版本随 index.html 内容变化，避免缓存陈旧 */
const V = "epi-bank-%s";
const SHELL = ["./", "./index.html", "./manifest.webmanifest",
               "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面走「网络优先」：更新立刻生效，断网时回退缓存
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(V).then((c) => c.put(req, res.clone())); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 其余资源走「缓存优先」
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => { caches.open(V).then((c) => c.put(req, res.clone())); return res; })
    )
  );
});
""" % version
    with open(os.path.join(HERE, "sw.js"), "w", encoding="utf-8") as f:
        f.write(sw)

    open(os.path.join(HERE, ".nojekyll"), "w").close()

    print("站点文件已就绪（缓存版本 %s）——仓库根目录即为网站：" % version)
    for p in ["index.html", "manifest.webmanifest", "sw.js", ".nojekyll",
              "icons/icon-192.png", "icons/icon-512.png",
              "icons/apple-touch-icon.png", "icons/icon-maskable-512.png"]:
        full = os.path.join(HERE, p)
        print("  %-32s %8.1f KB" % (p, os.path.getsize(full) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
