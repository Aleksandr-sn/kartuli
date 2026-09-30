/* Offline cache. VERSION is rewritten by scripts/build.py on every build → clients pick up new words/audio. */
const VERSION = "kartuli-20261001-012006";
const CORE = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  "icons/icon-512.png", "words.json", "fx/cat-dance.mp4", "fx/great-day.mp4"];
const PROMPTS = ["start", "new", "listen", "sound", "good1", "good2", "good3", "good4", "again", "done"];

self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await c.addAll(CORE);
  const db = await (await fetch("words.json", { cache: "no-cache" })).json();
  const files = PROMPTS.map(k => `audio/prompt/${k}.mp3`);
  for (const w of db.words) {
    files.push(`audio/giorgi/${w.id}.mp3`, `audio/eka/${w.id}.mp3`, `audio/ru/${w.id}.mp3`);
    if (w.pic.startsWith("svg:")) files.push(`pics/${w.pic.slice(4)}.svg`);
  }
  await Promise.allSettled([...new Set(files)].map(f => c.add(f)));
  await self.skipWaiting();
})()));

self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const put = r => { if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return r; };
  if (url.pathname.endsWith("words.json")) {  // network first: new words from the teacher
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(put)));
});
