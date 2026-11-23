// Service worker do Scragbadum!
// - Guarda a "casca" do app e os arquivos estáticos para abrir rápido e funcionar como app instalado.
// - Sem internet, mostra a página /offline em vez da tela de erro do navegador.
// - NUNCA guarda respostas da API: o estado do jogo vem sempre do servidor.
const VERSION = "v1";
const SHELL = `scragbadum-shell-${VERSION}`;
const STATIC = `scragbadum-static-${VERSION}`;
const PRECACHE = ["/", "/offline", "/como-jogar", "/configuracoes", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Arquivos com hash no nome nunca mudam: cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Páginas: sempre tenta a rede (conteúdo novo); sem rede, usa a cópia ou a página offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(request)) ?? (await caches.match("/offline")) ?? Response.error()),
    );
  }
});
