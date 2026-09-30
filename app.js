/* Kartuli — Georgian words from the lessons. No backend: words.json + audio; progress in localStorage. */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
new MutationObserver(() => window.scrollTo(0, 0)).observe(app, { childList: true });  // every screen starts at the top
const STORE = "kartuli.v1";
const DAYS = [0, 1, 2, 4, 7, 14, 30];        // next review in N days for box 0..6
const KNOWN = 3;                              // box >= 3 → «знает»
const STICKERS = ["🐱", "🍇", "🏔️", "🦊", "🌻", "🐻", "🍑", "🦉", "🐎", "🎻", "🐢", "🌈", "🦋", "🍒", "🐼",
  "🚂", "⚽", "🍉", "🦁", "🎈", "🐬", "🍓", "🚀", "🥁", "🦅", "🌙", "🐿️", "🏰", "🎨", "⭐"];
const CATS = ["fx/cat-dance.mp4", "fx/great-day.mp4"];

let DB = null, S = null, L = null;
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
const fresh = () => ({ voice: "giorgi", words: {}, stars: 0, streak: { last: null, n: 0 }, lessons: 0, stickers: 0, seenVersion: null });
function load() { try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(STORE)) || {}); } catch { return fresh(); } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* private mode: progress lives for this visit */ } }
const st = w => S.words[w.id] || (S.words[w.id] = { box: 0, due: 0, seen: false, ok: 0, bad: 0 });
const known = w => (S.words[w.id]?.box || 0) >= KNOWN;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- audio
   Files are fetched into blob: URLs — plays the same online and offline (Safari can't stream media from a
   service-worker cache without range support). */
const blobs = {};
function blobURL(src) {
  return blobs[src] || (blobs[src] = fetch(src).then(r => r.ok ? r.blob() : Promise.reject(r.status))
    .then(b => URL.createObjectURL(b)).catch(() => { delete blobs[src]; return src; }));
}
let current = null, currentDone = null, chain = 0;
async function play(src) {
  const url = await blobURL(src);
  return new Promise(res => {
    try {
      if (current) { current.pause(); current.onended = current.onerror = null; }
      if (currentDone) currentDone();  // an interrupted sound counts as finished — nobody waits forever
      const a = new Audio(url);
      current = a; currentDone = res;
      a.onended = a.onerror = () => { if (currentDone === res) currentDone = null; res(); };
      const p = a.play(); if (p) p.catch(() => res());
    } catch { res(); }
  });
}
const kaSrc = w => `audio/${S.voice}/${w.id}.mp3`;
const ruSrc = w => `audio/ru/${w.id}.mp3`;
const pr = k => `audio/prompt/${k}.mp3`;
async function say(btn, ...srcs) {  // a new chain stops the previous one (e.g. the prompt when the child answers)
  const my = ++chain;
  btn && btn.classList.add("on");
  for (const s of srcs) { if (my !== chain) break; await play(s); }
  btn && btn.classList.remove("on");
}
const praise = () => pr("good" + (1 + (Math.random() * 4 | 0)));

/* ---------------- pictures */
function pic(w) {
  if (w.pic.startsWith("color:")) return `<span class="pic swatch" style="--c:${w.pic.slice(6)}"></span>`;
  if (w.pic.startsWith("svg:")) return `<img class="pic svg" src="pics/${w.pic.slice(4)}.svg" alt="">`;
  return `<span class="pic emoji">${w.pic || "❔"}</span>`;
}

/* ---------------- lesson builder (spaced repetition) */
function buildLesson() {
  const t = today(), order = DB.topics.map(x => x.id);
  const words = [...DB.words].sort((a, b) => order.indexOf(a.topic) - order.indexOf(b.topic));
  const due = shuffle(words.filter(w => st(w).seen && st(w).due <= t)).sort((a, b) => st(a).box - st(b).box);
  const news = words.filter(w => !st(w).seen).slice(0, due.length >= 6 ? 2 : 3);
  let reviews = due.slice(0, 10 - news.length * 2);
  if (!news.length && !reviews.length) reviews = shuffle(words.filter(w => st(w).seen)).slice(0, 8); // free practice
  const tasks = [];
  const pool = [...reviews];
  const addReview = n => { for (let i = 0; i < n && pool.length; i++) { const w = pool.shift(); tasks.push({ type: Math.random() < .5 ? "listen" : "sound", w }); } };
  news.forEach(w => { tasks.push({ type: "intro", w }, { type: "listen", w, fresh: true }); addReview(2); });
  addReview(pool.length);
  return tasks;
}
function options(w) {
  const ok = o => o.family !== w.family && o.pic !== w.pic;
  const seen = shuffle(DB.words.filter(o => ok(o) && st(o).seen && o.topic === w.topic));
  const same = shuffle(DB.words.filter(o => ok(o) && o.topic === w.topic && !seen.includes(o)));
  const other = shuffle(DB.words.filter(o => ok(o) && o.topic !== w.topic));
  const picks = [];
  for (const o of [...seen, ...same, ...other]) { if (picks.length < 2 && !picks.some(p => p.pic === o.pic)) picks.push(o); }
  return shuffle([w, ...picks]);
}

/* ---------------- screens */
function header() {
  const n = S.streak.last >= today() - 1 ? S.streak.n : 0;
  return `<div class="top">
    <div class="brand"><div class="logo">ქ</div><div><b>Kartuli</b><small>ქართული სიტყვები</small></div></div>
    <span class="chip" title="Дней подряд">🔥 ${n}</span><span class="chip" title="Звёзды">⭐ ${S.stars}</span>
    <button class="gear" id="gear" aria-label="Для родителей (удерживайте)">⚙︎</button></div>`;
}
function home() {
  L = null;
  const total = DB.words.length, k = DB.words.filter(known).length, seen = DB.words.filter(w => st(w).seen).length;
  const fresh = DB.words.filter(w => !st(w).seen).length;
  const isNew = S.seenVersion && S.seenVersion !== DB.version && fresh > 0;
  const topics = DB.topics.map(t => {
    const ws = DB.words.filter(w => w.topic === t.id), kn = ws.filter(known).length;
    return `<div class="topic"><span class="ti">${t.icon}</span><b>${esc(t.name)}</b>
      <div class="bar"><i style="width:${ws.length ? kn / ws.length * 100 : 0}%"></i></div><small>${kn} из ${ws.length}</small></div>`;
  }).join("");
  app.innerHTML = `<section class="screen">${header()}
    <div class="hero">${isNew ? `<span class="badge-new">✨ Новые слова от учителя: ${fresh}</span>` : ""}
      <span class="seed">🍇</span>
      <h1>${seen ? "Продолжим?" : "Первый урок!"}</h1>
      <p>${seen ? `Знаешь ${k} из ${total} слов` : `${total} слов ждут тебя`}</p>
      <div class="bar"><i style="width:${total ? k / total * 100 : 0}%"></i></div>
      <div class="meta"><span>Урок ${S.lessons + 1}</span><span>${fresh ? `новых: ${Math.min(fresh, 3)}` : "повторение"}</span></div>
      <button class="play" id="go">▶ Играть</button></div>
    <div class="section-title">Темы</div><div class="topics">${topics}</div>
    <div class="row"><button class="tile" id="album"><span>🏅</span>Наклейки ${S.stickers}/${STICKERS.length}</button></div>
  </section>`;
  $("#go").onclick = start;
  $("#album").onclick = album;
  parentGate($("#gear"));
}
function parentGate(el) {
  let t;
  const on = () => { t = setTimeout(parents, 900); };
  const off = () => clearTimeout(t);
  el.addEventListener("pointerdown", on); ["pointerup", "pointerleave", "pointercancel"].forEach(e => el.addEventListener(e, off));
  el.onclick = () => { el.animate([{ transform: "rotate(0)" }, { transform: "rotate(90deg)" }], { duration: 300 }); };
}

function start() {
  const tasks = buildLesson();
  L = { tasks, i: 0, stars: 0, tries: 0 };
  play(pr("start"));
  S.seenVersion = DB.version; save();
  setTimeout(task, 600);
}
function steps() {
  return `<div class="lesson-top"><button class="x" id="x" aria-label="Выйти">✕</button><div class="steps">${
    L.tasks.map((_, i) => `<i class="${i < L.i ? "done" : i === L.i ? "now" : ""}"></i>`).join("")}</div></div>`;
}
function task() {
  if (L.i >= L.tasks.length) return finish();
  const T = L.tasks[L.i];
  L.tries = 0;
  prefetch(L.i + 1);
  ({ intro, listen, sound })[T.type](T);
  $("#x").onclick = home;
}
function prefetch(i) {  // warm up the next tasks' audio so there is no pause between screens
  L.tasks.slice(i, i + 3).forEach(t => { blobURL(kaSrc(t.w)); blobURL(ruSrc(t.w)); });
}
function intro(T) {
  const w = T.w;
  app.innerHTML = `<section class="screen">${steps()}
    <div class="card big"><span class="badge-new">✨ Новое слово</span>${pic(w)}
      <div class="word">${esc(w.ka)}</div><div class="tr">${esc(w.tr)}</div><div class="ru">${esc(w.ru)}</div>
      <div class="pair"><button class="btn" id="k">🔊 Слово</button><button class="btn alt" id="r">💬 Перевод</button></div></div>
    <button class="next" id="n">Дальше →</button></section>`;
  $("#k").onclick = () => say($("#k"), kaSrc(w));
  $("#r").onclick = () => say($("#r"), ruSrc(w));
  $("#n").onclick = () => { st(w).seen = true; save(); L.i++; task(); };
  say(null, pr("new"), kaSrc(w), ruSrc(w), kaSrc(w));
}
function listen(T) {
  const w = T.w, opts = options(w);
  L.opts = opts;
  app.innerHTML = `<section class="screen">${steps()}
    <div class="card"><p class="ask">Послушай и найди картинку</p><button class="speak" id="s" aria-label="Послушать">🔊</button>
      <div class="opts">${opts.map((o, i) => `<button class="opt" data-i="${i}">${pic(o)}</button>`).join("")}</div></div></section>`;
  const sp = $("#s");
  sp.onclick = () => say(sp, kaSrc(w));
  app.querySelectorAll(".opt").forEach(b => b.onclick = () => answer(b, opts[+b.dataset.i] === w, w, () => app.querySelectorAll(".opt").forEach((x, i) => { if (opts[i] === w) x.classList.add("ok"); else x.classList.add("dim"); })));
  const first = !L.tasks.slice(0, L.i).some(t => t.type === "listen");
  first ? say(sp, pr("listen"), kaSrc(w)) : say(sp, kaSrc(w));
}
function sound(T) {
  const w = T.w, opts = options(w);
  L.opts = opts;
  app.innerHTML = `<section class="screen">${steps()}
    <div class="card big"><p class="ask">Какое слово подходит к картинке?</p>${pic(w)}
      <div class="opts">${opts.map((o, i) => `<div class="opt snd" data-i="${i}"><button class="wave" data-p="${i}" aria-label="Послушать">🔊</button>
        <button class="pick" data-a="${i}">Это оно</button></div>`).join("")}</div>
      <div class="hint">Нажми 🔊, послушай все слова и выбери</div></div></section>`;
  app.querySelectorAll("[data-p]").forEach(b => b.onclick = () => say(b.parentElement, kaSrc(opts[+b.dataset.p])));
  app.querySelectorAll("[data-a]").forEach(b => b.onclick = () => answer(b.parentElement, opts[+b.dataset.a] === w, w, () => app.querySelectorAll(".opt").forEach((x, i) => { if (opts[i] === w) x.classList.add("ok"); else x.classList.add("dim"); })));
  const first = !L.tasks.slice(0, L.i).some(t => t.type === "sound");
  if (first) say(null, pr("sound"));
}
let busy = false;
async function answer(el, right, w, reveal) {
  if (busy) return;
  const s = st(w);
  if (right) {
    busy = true;
    el.classList.add("ok");
    if (L.tries === 0) { L.stars++; S.stars++; s.ok++; s.box = Math.min(s.box + 1, DAYS.length - 1); }
    s.seen = true; s.due = today() + DAYS[s.box]; save();
    confetti(el);
    await say(null, praise(), kaSrc(w));
    busy = false; L.i++; task();
  } else {
    L.tries++; s.bad++; el.classList.add("bad"); setTimeout(() => el.classList.remove("bad"), 450);
    if (L.tries === 1) { s.box = Math.max(0, s.box - 1); L.tasks.push({ type: "listen", w }); } // comes back later in this lesson
    save();
    if (L.tries >= 2) { busy = true; reveal(); await say(null, kaSrc(w)); await new Promise(r => setTimeout(r, 900)); busy = false; L.i++; task(); }
    else say(null, pr("again"));
  }
}
function confetti(el) {
  const box = document.createElement("div"); box.className = "confetti";
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("i"); p.textContent = ["⭐", "✨", "🍇", "🎉"][i % 4];
    p.style.left = r.left + r.width / 2 + "px"; p.style.top = r.top + r.height / 2 + "px";
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 120;
    p.style.setProperty("--dx", Math.cos(a) * d + "px"); p.style.setProperty("--dy", Math.sin(a) * d + "px");
    p.style.setProperty("--rot", (Math.random() * 360 | 0) + "deg");
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 1100);
}
function finish() {
  const t = today();
  if (S.streak.last !== t) { S.streak.n = S.streak.last === t - 1 ? S.streak.n + 1 : 1; S.streak.last = t; }
  S.lessons++;
  const sticker = S.stickers < STICKERS.length ? STICKERS[S.stickers] : null;
  if (sticker) S.stickers++;
  save();
  const stars = Math.max(1, Math.round(L.stars / Math.max(1, L.tasks.filter(x => x.type !== "intro").length) * 3));
  app.innerHTML = `<section class="screen result">
    <video id="cat" autoplay loop muted playsinline></video>
    <h2>Урок пройден!</h2><div class="stars">${"⭐".repeat(stars)}${"☆".repeat(3 - stars)}</div>
    <p>+${L.stars} звёзд · 🔥 ${S.streak.n} ${S.streak.n === 1 ? "день" : "дня подряд"}</p>
    ${sticker ? `<div class="sticker-new">${sticker}</div><p>Новая наклейка в альбоме!</p>` : ""}
    <button class="play" id="again">▶ Ещё урок</button><button class="btn alt" id="home">Домой</button></section>`;
  play(pr("done"));
  blobURL(CATS[S.lessons % CATS.length]).then(u => { const v = $("#cat"); if (v) { v.src = u; v.play().catch(() => {}); } });
  $("#again").onclick = start; $("#home").onclick = home;
}
function album() {
  app.innerHTML = `<section class="screen">${header()}<div class="section-title">Наклейки ${S.stickers}/${STICKERS.length}</div>
    <div class="album">${STICKERS.map((s, i) => i < S.stickers ? `<div class="slot">${s}</div>` : `<div class="slot locked">🔒</div>`).join("")}</div>
    <p class="hint" style="color:#fff;opacity:.7">За каждый урок — новая наклейка</p><button class="next" id="home">← Домой</button></section>`;
  $("#home").onclick = home; parentGate($("#gear"));
}
function parents() {
  const rows = DB.words.map(w => {
    const s = S.words[w.id], k = known(w);
    const label = !s || !s.seen ? ["new", "ещё не было"] : k ? ["known", "знает"] : ["", "учит"];
    return `<div><span class="k">${esc(w.ka)}</span><span>${esc(w.ru)}</span><span class="s ${label[0]}">${label[1]}</span></div>`;
  }).join("");
  const kn = DB.words.filter(known).length;
  app.innerHTML = `<section class="screen">${header()}
    <div class="panel"><h3>Голос</h3><div class="seg"><button data-v="giorgi" class="${S.voice === "giorgi" ? "on" : ""}">🧔 Гиорги</button>
      <button data-v="eka" class="${S.voice === "eka" ? "on" : ""}">👩 Эка</button></div></div>
    <div class="panel"><h3>Слова: знает ${kn} из ${DB.words.length} · уроков ${S.lessons}</h3><div class="wl">${rows}</div>
      <button class="danger" id="reset">Сбросить прогресс</button></div>
    <button class="next" id="home">← Домой</button></section>`;
  app.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { S.voice = b.dataset.v; save(); parents(); play(`audio/${S.voice}/${DB.words[0].id}.mp3`); });
  $("#reset").onclick = () => { if (confirm("Стереть весь прогресс на этом устройстве?")) { const v = S.voice; S = fresh(); S.voice = v; save(); home(); } };
  $("#home").onclick = home;
}

/* ---------------- boot */
(async function boot() {
  S = load();
  if (/tgWebApp/.test(location.hash)) {  // opened from the Telegram bot as a Mini App
    const s = document.createElement("script"); s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = () => { try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch { /* not in Telegram */ } };
    document.head.appendChild(s);
  }
  try { DB = await (await fetch("words.json", { cache: "no-cache" })).json(); }
  catch { app.innerHTML = `<section class="screen"><div class="card"><p class="ask">Нет связи. Откройте игру один раз с интернетом.</p></div></section>`; return; }
  if (!S.seenVersion) S.seenVersion = DB.version;
  home();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
