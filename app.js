/* Kartuli — Georgian words from the lessons. Static site: words.json + audio; progress on the device
   (localStorage; the name is also kept in a cookie). Phase 2 (accounts, leaderboard) — Cloudflare. */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");
new MutationObserver(() => window.scrollTo(0, 0)).observe(app, { childList: true });  // every screen starts at the top

const STORE = "kartuli.v1";
const DAYS = [0, 1, 2, 4, 7, 14, 30];        // next review in N days for box 0..6
const KNOWN = 3;                              // box >= 3 → «выучил»
const AVATARS = ["🐻", "🦊", "🐼", "🐯", "🐰", "🐸", "🦁", "🐨", "🐵", "🦄"];
const STICKERS = ["🐱", "🍇", "🏔️", "🦊", "🌻", "🐻", "🍑", "🦉", "🐎", "🎻", "🐢", "🌈", "🦋", "🍒", "🐼",
  "🚂", "⚽", "🍉", "🦁", "🎈", "🐬", "🍓", "🚀", "🥁", "🦅", "🌙", "🐿️", "🏰", "🎨", "⭐"];
const COLORS = { people: "#FF8FAB", colors: "#B197FC", bag: "#FFD43B", room: "#74C0FC", verbs: "#63E6BE", commands: "#FFA94D", new: "#F2B134" };
const CATS = ["fx/cat-dance.mp4", "fx/great-day.mp4"];

let DB = null, S = null, L = null, MASCOT = "";
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
const fresh = () => ({ name: "", avatar: "", voice: "giorgi", words: {}, stars: 0, streak: { last: null, n: 0 }, days: [],
  lessons: 0, stickers: 0, seenVersion: null });
function cookie(k) { const m = document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : ""; }
function load() {
  let s; try { s = Object.assign(fresh(), JSON.parse(localStorage.getItem(STORE)) || {}); } catch { s = fresh(); }
  if (!s.name && cookie("kartuli_name")) { s.name = cookie("kartuli_name"); s.avatar = cookie("kartuli_avatar") || AVATARS[0]; }
  return s;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* private mode: progress lives for this visit */ }
  if (S.name) {
    const y5 = "; max-age=" + 5 * 365 * 864e2 + "; path=/; SameSite=Lax";
    document.cookie = "kartuli_name=" + encodeURIComponent(S.name) + y5;
    document.cookie = "kartuli_avatar=" + encodeURIComponent(S.avatar) + y5;
  }
}
const st = w => S.words[w.id] || (S.words[w.id] = { box: 0, due: 0, seen: false, ok: 0, bad: 0 });
const known = w => (S.words[w.id]?.box || 0) >= KNOWN;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

/* ---------------- sound: files → blob URLs (same online/offline; Safari can't stream media from a SW cache) */
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
async function say(btn, ...srcs) {  // a new chain stops the previous one (e.g. the prompt when the child answers)
  const my = ++chain;
  btn && btn.classList.add("on");
  for (const s of srcs) { if (my !== chain) break; await play(s); }
  btn && btn.classList.remove("on");
}
const kaSrc = w => `audio/${S.voice}/${w.id}.mp3`;
const ruSrc = w => `audio/ru/${w.id}.mp3`;
const pr = k => `audio/prompt/${k}.mp3`;
const praise = () => pr("good" + (1 + (Math.random() * 4 | 0)));
let ac = null;
function beep(ok) {  // tiny synthesized chime — no files
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const notes = ok ? [660, 990] : [220];
    notes.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * .09;
      o.type = ok ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .28);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + .3);
    });
  } catch { /* no audio context */ }
}

/* ---------------- pictures & mascot */
function pic(w) {
  if (w.pic.startsWith("color:")) return `<span class="pic swatch" style="--c:${w.pic.slice(6)}"></span>`;
  if (w.pic.startsWith("svg:")) return `<img class="pic svg" src="pics/${w.pic.slice(4)}.svg" alt="">`;
  return `<span class="pic emoji">${w.pic || "❔"}</span>`;
}
const mascot = (mood = "", text = "") => `<div class="mascot ${mood}"><div class="cat">${MASCOT}</div>${text ? `<div class="bubble">${text}</div>` : ""}</div>`;

/* ---------------- lesson builder (spaced repetition) */
function buildLesson(topic) {
  const t = today(), order = DB.topics.map(x => x.id);
  const all = [...DB.words].sort((a, b) => order.indexOf(a.topic) - order.indexOf(b.topic));
  const words = topic ? all.filter(w => w.topic === topic) : all;
  const due = shuffle(words.filter(w => st(w).seen && st(w).due <= t)).sort((a, b) => st(a).box - st(b).box);
  const news = words.filter(w => !st(w).seen).slice(0, due.length >= 6 ? 2 : 3);
  let reviews = due.slice(0, 10 - news.length * 2);
  if (!news.length && !reviews.length) reviews = shuffle(words.filter(w => st(w).seen)).slice(0, 8);  // free practice
  const tasks = [], pool = [...reviews];
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
const topicStats = id => { const ws = DB.words.filter(w => w.topic === id); return { n: ws.length, k: ws.filter(known).length, s: ws.filter(w => st(w).seen).length }; };

/* ---------------- shell: header + bottom tabs */
function streakNow() { return S.streak.last >= today() - 1 ? S.streak.n : 0; }
function header() {
  return `<div class="top"><button class="me" id="me">${S.avatar}<b>${esc(S.name)}</b></button>
    <span class="chip">🔥 ${streakNow()}</span><span class="chip">⭐ ${S.stars}</span></div>`;
}
function tabs(active) {
  const t = [["home", "🏠", "Главная"], ["album", "🏅", "Наклейки"], ["profile", "👤", "Профиль"]];
  return `<nav class="tabs">${t.map(([id, i, n]) => `<button data-tab="${id}" class="${id === active ? "on" : ""}"><span>${i}</span>${n}</button>`).join("")}</nav>`;
}
function wire() {
  $$("[data-tab]").forEach(b => b.onclick = () => ({ home, album, profile })[b.dataset.tab]());
  const me = $("#me"); if (me) me.onclick = profile;
}

/* ---------------- onboarding */
function onboarding() {
  app.innerHTML = `<section class="screen onboard">
    ${mascot("mood-happy", "Привет! Я котик <b>Гоги</b>.<br>А как зовут тебя?")}
    <input id="name" class="name-input" maxlength="16" placeholder="Твоё имя" autocomplete="off" value="${esc(S.name)}">
    <div class="avatars">${AVATARS.map(a => `<button class="av ${a === (S.avatar || AVATARS[0]) ? "on" : ""}" data-a="${a}">${a}</button>`).join("")}</div>
    <button class="play" id="go" disabled>Поехали! 🚀</button></section>`;
  let avatar = S.avatar || AVATARS[0];
  const inp = $("#name"), go = $("#go");
  const check = () => { go.disabled = inp.value.trim().length < 2; };
  inp.oninput = check; check();
  $$(".av").forEach(b => b.onclick = () => { $$(".av").forEach(x => x.classList.remove("on")); b.classList.add("on"); avatar = b.dataset.a; beep(true); });
  go.onclick = () => { S.name = inp.value.trim().slice(0, 16); S.avatar = avatar; save(); play(pr("letsgo")); home(); };
  $(".mascot").onclick = () => play(pr("hello"));
  setTimeout(() => play(pr("hello")), 300);
}

/* ---------------- home: path of topics */
function home() {
  if (!S.name) return onboarding();
  L = null;
  const total = DB.words.length, k = DB.words.filter(known).length;
  const fresh = DB.words.filter(w => !st(w).seen).length;
  const isNew = S.seenVersion && S.seenVersion !== DB.version && fresh > 0;
  const currentTopic = (DB.topics.find(t => { const x = topicStats(t.id); return x.s < x.n; }) || DB.topics[DB.topics.length - 1]).id;
  const line = isNew ? `Учитель добавил новые слова: <b>${fresh}</b>! 🎉`
    : !S.lessons ? `${esc(S.name)}, давай выучим первые слова!`
    : k === total ? `Ты знаешь все ${total} слов! Повторим? 🏆`
    : fresh ? `${esc(S.name)}, сегодня ${Math.min(fresh, 3)} ${plural(Math.min(fresh, 3), "новое слово", "новых слова", "новых слов")}!`
    : `${esc(S.name)}, повторим слова?`;
  const path = DB.topics.map((t, i) => {
    const x = topicStats(t.id), pct = x.n ? x.k / x.n : 0, done = x.k === x.n && x.n;
    const cls = done ? "done" : t.id === currentTopic ? "now" : x.s ? "started" : "";
    return `<button class="node ${cls} ${i % 2 ? "r" : "l"}" data-topic="${t.id}" style="--tc:${COLORS[t.id] || "#F2B134"};--p:${pct * 100}">
      <span class="ring"><span class="ico">${done ? "👑" : t.icon}</span></span>
      <span class="lbl"><b>${esc(t.name)}</b><small>${x.k} из ${x.n}</small></span></button>`;
  }).join('<i class="dots"></i>');
  app.innerHTML = `<section class="screen">${header()}
    ${mascot(isNew ? "mood-happy" : "", line)}
    <div class="hero">
      <div class="big-num"><b>${k}</b><span>из ${total}<br>${plural(total, "слова", "слов", "слов")} выучено</span></div>
      <div class="bar"><i style="width:${total ? k / total * 100 : 0}%"></i></div>
      <div class="week">${weekDots()}</div>
      <button class="play" id="go">▶ Играть</button></div>
    <div class="path">${path}</div>${tabs("home")}</section>`;
  $("#go").onclick = () => start();
  $$(".node").forEach(b => b.onclick = () => start(b.dataset.topic));
  $(".mascot").onclick = () => $(".mascot").classList.toggle("mood-happy");
  wire();
}
function weekDots() {
  const t = today(), days = new Set(S.days || []), names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = t - 6 + i, wd = new Date((d * 864e5) + new Date().getTimezoneOffset() * 6e4).getDay();
    return `<span class="${days.has(d) ? "hit" : ""} ${d === t ? "today" : ""}"><i>${days.has(d) ? "🔥" : ""}</i>${names[wd]}</span>`;
  }).join("");
}

/* ---------------- lesson */
function start(topic) {
  const tasks = buildLesson(topic);
  if (!tasks.length) return home();
  L = { tasks, i: 0, stars: 0, tries: 0, fresh: tasks.filter(t => t.type === "intro").length, topic };
  play(pr("start"));
  S.seenVersion = DB.version; save();
  setTimeout(task, 500);
}
function steps() {
  const pct = L.i / L.tasks.length * 100;
  return `<div class="lesson-top"><button class="x" id="x" aria-label="Выйти">✕</button>
    <div class="track"><i style="width:${pct}%"></i><span class="runner" style="left:${pct}%">${S.avatar}</span></div></div>`;
}
function prefetch(i) { L.tasks.slice(i, i + 3).forEach(t => { blobURL(kaSrc(t.w)); blobURL(ruSrc(t.w)); }); }
function task() {
  if (L.i >= L.tasks.length) return finish();
  const T = L.tasks[L.i];
  L.tries = 0;
  prefetch(L.i + 1);
  ({ intro, listen, sound })[T.type](T);
  $("#x").onclick = home;
}
function intro(T) {
  const w = T.w;
  app.innerHTML = `<section class="screen">${steps()}
    <div class="card big" style="--tc:${COLORS[w.topic] || "#F2B134"}"><span class="badge-new">✨ Новое слово</span>
      <div class="pic-wrap">${pic(w)}</div>
      <div class="word">${esc(w.ka)}</div><div class="tr">${esc(w.tr)}</div><div class="ru">${esc(w.ru)}</div>
      <div class="pair"><button class="btn" id="k">🔊 Слово</button><button class="btn alt" id="r">💬 Перевод</button></div></div>
    <button class="next" id="n">Запомнил! →</button></section>`;
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
      <div class="opts">${opts.map((o, i) => `<button class="opt" data-i="${i}">${pic(o)}</button>`).join("")}</div></div>
    ${mascot("", "")}</section>`;
  const sp = $("#s");
  sp.onclick = () => say(sp, kaSrc(w));
  $$(".opt").forEach(b => b.onclick = () => answer(b, opts[+b.dataset.i] === w, w, opts));
  const first = !L.tasks.slice(0, L.i).some(t => t.type === "listen");
  first ? say(sp, pr("listen"), kaSrc(w)) : say(sp, kaSrc(w));
}
function sound(T) {
  const w = T.w, opts = options(w);
  L.opts = opts;
  app.innerHTML = `<section class="screen">${steps()}
    <div class="card big"><p class="ask">Какое слово подходит к картинке?</p><div class="pic-wrap">${pic(w)}</div>
      <div class="opts">${opts.map((o, i) => `<div class="opt snd" data-i="${i}"><button class="wave" data-p="${i}" aria-label="Послушать">🔊</button>
        <button class="pick" data-a="${i}">✓ Это</button></div>`).join("")}</div>
      <div class="hint">Нажми 🔊, послушай все слова и выбери</div></div>
    ${mascot("", "")}</section>`;
  $$("[data-p]").forEach(b => b.onclick = () => say(b.parentElement, kaSrc(opts[+b.dataset.p])));
  $$("[data-a]").forEach(b => b.onclick = () => answer(b.parentElement, opts[+b.dataset.a] === w, w, opts));
  if (!L.tasks.slice(0, L.i).some(t => t.type === "sound")) say(null, pr("sound"));
}
function react(mood, text) {
  const m = $(".mascot"); if (!m) return;
  m.className = "mascot show " + mood;
  m.innerHTML = `<div class="cat">${MASCOT}</div><div class="bubble">${text}</div>`;
}
let busy = false;
async function answer(el, right, w, opts) {
  if (busy) return;
  const s = st(w);
  const reveal = () => $$(".opt").forEach((x, i) => x.classList.add(opts[i] === w ? "ok" : "dim"));
  if (right) {
    busy = true;
    el.classList.add("ok"); beep(true);
    if (L.tries === 0) { L.stars++; S.stars++; s.ok++; s.box = Math.min(s.box + 1, DAYS.length - 1); }
    s.seen = true; s.due = today() + DAYS[s.box]; save();
    confetti(el);
    react("mood-happy", ["Молодец!", "Отлично!", "Верно!", "Супер!"][Math.random() * 4 | 0] + (L.tries === 0 ? " ⭐" : ""));
    await say(null, praise(), kaSrc(w));
    busy = false; L.i++; task();
  } else {
    L.tries++; s.bad++; el.classList.add("bad"); beep(false); setTimeout(() => el.classList.remove("bad"), 450);
    if (L.tries === 1) { s.box = Math.max(0, s.box - 1); L.tasks.push({ type: "listen", w }); }  // comes back later in this lesson
    save();
    if (L.tries >= 2) {
      busy = true; reveal(); react("mood-sad", "Вот правильный ответ. Запомним!");
      await say(null, kaSrc(w)); await new Promise(r => setTimeout(r, 900)); busy = false; L.i++; task();
    } else { react("mood-sad", "Почти! Попробуй ещё раз 🙂"); say(null, pr("again")); }
  }
}
function confetti(el) {
  const box = document.createElement("div"); box.className = "confetti";
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 16; i++) {
    const p = document.createElement("i"); p.textContent = ["⭐", "✨", "🍇", "🎉"][i % 4];
    p.style.left = r.left + r.width / 2 + "px"; p.style.top = r.top + r.height / 2 + "px";
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 140;
    p.style.setProperty("--dx", Math.cos(a) * d + "px"); p.style.setProperty("--dy", Math.sin(a) * d + "px");
    p.style.setProperty("--rot", (Math.random() * 360 | 0) + "deg");
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 1100);
}

/* ---------------- result */
function finish() {
  const t = today();
  if (S.streak.last !== t) { S.streak.n = S.streak.last === t - 1 ? S.streak.n + 1 : 1; S.streak.last = t; }
  S.days = [...new Set([...(S.days || []), t])].filter(d => d > t - 60);
  S.lessons++;
  const sticker = S.stickers < STICKERS.length ? STICKERS[S.stickers] : null;
  if (sticker) S.stickers++;
  save();
  const answered = L.tasks.filter(x => x.type !== "intro").length;
  const stars = Math.max(1, Math.round(L.stars / Math.max(1, answered) * 3));
  const total = DB.words.length, k = DB.words.filter(known).length;
  app.innerHTML = `<section class="screen result">
    <div class="cheer"><video id="cat" autoplay loop muted playsinline></video></div>
    <h2>Урок пройден, ${esc(S.name)}!</h2>
    <div class="stars">${[0, 1, 2].map(i => `<span class="${i < stars ? "got" : ""}" style="animation-delay:${.3 + i * .25}s">⭐</span>`).join("")}</div>
    <div class="stats">
      <div><b>+${L.stars}</b><span>звёзд</span></div>
      <div><b>${L.fresh ? "+" + L.fresh : "✓"}</b><span>${L.fresh ? plural(L.fresh, "новое слово", "новых слова", "новых слов") : "повторили"}</span></div>
      <div><b>${k}/${total}</b><span>выучено</span></div>
      <div><b>🔥${S.streak.n}</b><span>${plural(S.streak.n, "день", "дня", "дней")} подряд</span></div>
    </div>
    ${sticker ? `<div class="sticker-new">${sticker}</div><p class="got-sticker">Новая наклейка!</p>` : ""}
    <button class="play" id="again">▶ Следующий урок</button><button class="btn alt wide" id="home">Домой</button></section>`;
  play(pr("done"));
  blobURL(CATS[S.lessons % CATS.length]).then(u => { const v = $("#cat"); if (v) { v.src = u; v.play().catch(() => {}); } });
  $("#again").onclick = () => start(L.topic); $("#home").onclick = home;
}

/* ---------------- album & profile */
function album() {
  app.innerHTML = `<section class="screen">${header()}
    <div class="panel-dark"><h3>🏅 Наклейки: ${S.stickers} из ${STICKERS.length}</h3><p>За каждый урок — новая наклейка</p></div>
    <div class="album">${STICKERS.map((s, i) => i < S.stickers ? `<div class="slot">${s}</div>` : `<div class="slot locked">?</div>`).join("")}</div>
    ${tabs("album")}</section>`;
  wire();
}
function profile() {
  const rows = DB.words.map(w => {
    const s = S.words[w.id], k = known(w);
    const label = !s || !s.seen ? ["new", "ещё не было"] : k ? ["known", "выучил"] : ["", "учит"];
    return `<div><span class="k">${esc(w.ka)}</span><span>${esc(w.ru)}</span><span class="s ${label[0]}">${label[1]}</span></div>`;
  }).join("");
  const kn = DB.words.filter(known).length;
  app.innerHTML = `<section class="screen">${header()}
    <div class="panel profile-head"><span class="big-av">${S.avatar}</span><div><h3>${esc(S.name)}</h3>
      <p>⭐ ${S.stars} · 🔥 ${streakNow()} · уроков ${S.lessons} · выучено ${kn} из ${DB.words.length}</p></div>
      <button class="btn alt" id="edit">✏️ Изменить</button></div>
    <div class="panel"><h3>Голос</h3><div class="seg"><button data-v="giorgi" class="${S.voice === "giorgi" ? "on" : ""}">🧔 Гиорги</button>
      <button data-v="eka" class="${S.voice === "eka" ? "on" : ""}">👩 Эка</button></div></div>
    <div class="panel"><h3>🔐 Вход с другого устройства</h3><p class="muted">Скоро: пароль и рейтинг класса.</p></div>
    <div class="panel"><h3>Слова</h3><div class="wl">${rows}</div><button class="danger" id="reset">Сбросить прогресс</button></div>
    ${tabs("profile")}</section>`;
  $$("[data-v]").forEach(b => b.onclick = () => { S.voice = b.dataset.v; save(); profile(); play(`audio/${S.voice}/${DB.words[0].id}.mp3`); });
  $("#edit").onclick = onboarding;
  $("#reset").onclick = () => { if (confirm("Стереть весь прогресс на этом устройстве?")) { const { name, avatar, voice } = S; S = Object.assign(fresh(), { name, avatar, voice }); save(); home(); } };
  wire();
}

/* ---------------- boot */
(async function boot() {
  S = load();
  if (/tgWebApp/.test(location.hash)) {  // opened from the Telegram bot as a Mini App
    const s = document.createElement("script"); s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = () => { try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch { /* not in Telegram */ } };
    document.head.appendChild(s);
  }
  try {
    const [db, svg] = await Promise.all([fetch("words.json", { cache: "no-cache" }).then(r => r.json()),
      fetch("pics/mascot.svg").then(r => r.text()).catch(() => "🐱")]);
    DB = db; MASCOT = svg;
  } catch {
    app.innerHTML = `<section class="screen"><div class="card"><p class="ask">Нет связи. Откройте игру один раз с интернетом.</p></div></section>`;
    return;
  }
  if (!S.seenVersion) S.seenVersion = DB.version;
  home();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
