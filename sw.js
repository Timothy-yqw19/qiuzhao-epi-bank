/* 秋招行测题库 Service Worker —— 版本随 index.html 内容变化，避免缓存陈旧 */
const V = "epi-bank-6a1c6655b9";
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
        .then((res) => { if (res.ok) caches.open(V).then((c) => c.put(req, res.clone())); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 其余资源走「缓存优先」
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => { if (res.ok) caches.open(V).then((c) => c.put(req, res.clone())); return res; })
    )
  );
});
