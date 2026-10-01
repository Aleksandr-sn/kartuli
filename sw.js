/* Offline cache. VERSION is rewritten by scripts/build.py on every build → clients pick up new words/audio. */
const VERSION = "kartuli-20261001-122154";
const CORE = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  "icons/icon-512.png", "words.json", "letters.json", "pics/mascot.svg", "fx/cat-dance.mp4", "fx/great-day.mp4"];
const PROMPTS = ["hello", "letsgo", "new_letter", "find_letter", "first_letter", "trace", "letters_go", "start", "new", "listen", "sound", "good1", "good2", "good3", "good4", "again", "done"];

self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await c.addAll(CORE);
  const db = await (await fetch("words.json", { cache: "no-cache" })).json();
  const files = PROMPTS.map(k => `audio/prompt/${k}.mp3`);
  for (const w of db.words) {
    files.push(`audio/giorgi/${w.id}.mp3`, `audio/eka/${w.id}.mp3`, `audio/ru/${w.id}.mp3`);
    if (w.pic.startsWith("svg:")) files.push(`pics/${w.pic.slice(4)}.svg`);
  }
  const lt = await (await fetch("letters.json", { cache: "no-cache" })).json();
  for (const x of lt.letters) {
    for (const v of ["giorgi", "eka"]) files.push(`audio/letters/${v}/${x.id}.mp3`, `audio/letters/${v}/ex-${x.id}.mp3`);
    files.push(`audio/letters/ru/ex-${x.id}.mp3`);
    if (x.ex.pic.startsWith("svg:")) files.push(`pics/${x.ex.pic.slice(4)}.svg`);
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
