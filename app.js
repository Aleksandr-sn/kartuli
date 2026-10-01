/* Kartuli — Georgian words & letters for first graders.
   Static site (words.json, letters.json, audio). Progress on the device (localStorage + name in a cookie).
   Accounts / leaderboard / sync turn on automatically when the server API answers (Cloudflare Pages + D1, phase 2). */
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
const GLYPH_FONT = '"Noto Sans Georgian", "Noto Serif Georgian", sans-serif';

let DB = null, LT = null, S = null, L = null, MASCOT = "", API = false;
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
const fresh = () => ({ name: "", avatar: "", voice: "giorgi", mode: "words", token: "", email: "", words: {}, stars: 0,
  streak: { last: null, n: 0 }, days: [], lessons: 0, stickers: 0, seenVersion: null });
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
function toast(text) {
  const t = document.createElement("div"); t.className = "toast"; t.innerHTML = text;
  document.body.appendChild(t); setTimeout(() => t.classList.add("out"), 3600); setTimeout(() => t.remove(), 4200);
}

/* ---------------- server API (phase 2). Absent on GitHub Pages → everything stays on the device. */
async function api(path, body) {
  const r = await fetch("api/" + path, {
    method: body ? "POST" : "GET",
    headers: Object.assign({ "Content-Type": "application/json" }, S.token ? { Authorization: "Bearer " + S.token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "HTTP " + r.status), { status: r.status, data: j });
  return j;
}
const progressPayload = () => ({ avatar: S.avatar, voice: S.voice, words: S.words, stars: S.stars, streak: S.streak, days: S.days,
  lessons: S.lessons, stickers: S.stickers, known: DB.words.filter(known).length, letters: LT.letters.filter(known).length });
function sync() { if (API && S.token) api("progress", progressPayload()).catch(() => {}); }

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
const isLetter = w => w.kind === "letter";
const kaSrc = w => isLetter(w) ? `audio/letters/${S.voice}/${w.id}.mp3` : `audio/${S.voice}/${w.id}.mp3`;
const exSrc = w => `audio/letters/${S.voice}/ex-${w.id}.mp3`;
const ruSrc = w => isLetter(w) ? `audio/letters/ru/ex-${w.id}.mp3` : `audio/ru/${w.id}.mp3`;
const pr = k => `audio/prompt/${k}.mp3`;
const praise = () => pr("good" + (1 + (Math.random() * 4 | 0)));
let ac = null;
function beep(ok) {  // tiny synthesized chime — no files
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    (ok ? [660, 990] : [220]).forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * .09;
      o.type = ok ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .28);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + .3);
    });
  } catch { /* no audio context */ }
}

/* ---------------- pictures & mascot */
function picOf(p) {
  if (p.startsWith("color:")) return `<span class="pic swatch" style="--c:${p.slice(6)}"></span>`;
  if (p.startsWith("svg:")) return `<img class="pic svg" src="pics/${p.slice(4)}.svg" alt="">`;
  return `<span class="pic emoji">${p || "❔"}</span>`;
}
const pic = w => isLetter(w) ? `<span class="pic glyph">${w.g}</span>` : picOf(w.pic);
const mascot = (mood = "", text = "") => `<div class="mascot ${mood}"><div class="cat">${MASCOT}</div>${text ? `<div class="bubble">${text}</div>` : ""}</div>`;

/* ---------------- lesson builders (spaced repetition) */
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
function buildLetterLesson() {
  const t = today(), all = [...LT.letters].sort((a, b) => a.order - b.order);
  const due = shuffle(all.filter(x => st(x).seen && st(x).due <= t)).sort((a, b) => st(a).box - st(b).box);
  const news = all.filter(x => !st(x).seen).slice(0, due.length >= 6 ? 1 : 2);
  let reviews = due.slice(0, 8 - news.length * 2);
  if (!news.length && !reviews.length) reviews = shuffle(all.filter(x => st(x).seen)).slice(0, 7);
  const kinds = ["lfind", "lfirst", "lfind", "ltrace"], tasks = [], pool = [...reviews];
  const add = n => { for (let i = 0; i < n && pool.length; i++) tasks.push({ type: kinds[Math.random() * kinds.length | 0], w: pool.shift() }); };
  news.forEach(w => { tasks.push({ type: "lintro", w }, { type: "ltrace", w }, { type: "lfind", w, fresh: true }); add(2); });
  add(pool.length);
  return tasks;
}
function options(w) {
  const list = isLetter(w) ? LT.letters : DB.words;
  const ok = o => isLetter(w) ? o !== w : o.family !== w.family && o.pic !== w.pic;
  const near = o => isLetter(w) || o.topic === w.topic;
  const seen = shuffle(list.filter(o => ok(o) && st(o).seen && near(o)));
  const same = shuffle(list.filter(o => ok(o) && near(o) && !seen.includes(o)));
  const other = shuffle(list.filter(o => ok(o) && !near(o)));
  const picks = [];
  const key = o => isLetter(o) ? o.g : o.pic;
  for (const o of [...seen, ...same, ...other]) { if (picks.length < 2 && !picks.some(p => key(p) === key(o))) picks.push(o); }
  return shuffle([w, ...picks]);
}
const topicStats = id => { const ws = DB.words.filter(w => w.topic === id); return { n: ws.length, k: ws.filter(known).length, s: ws.filter(w => st(w).seen).length }; };

/* ---------------- shell: header, mode switch, bottom tabs */
function streakNow() { return S.streak.last >= today() - 1 ? S.streak.n : 0; }
function header() {
  return `<div class="top"><button class="me" id="me">${S.avatar}<b>${esc(S.name)}</b></button>
    <span class="chip">🔥 ${streakNow()}</span><span class="chip">⭐ ${S.stars}</span></div>`;
}
function tabs(active) {
  const t = [["home", "🏠", "Главная"], ...(API ? [["rating", "🏆", "Рейтинг"]] : []), ["album", "🏅", "Наклейки"], ["profile", "👤", "Профиль"]];
  return `<nav class="tabs">${t.map(([id, i, n]) => `<button data-tab="${id}" class="${id === active ? "on" : ""}"><span>${i}</span>${n}</button>`).join("")}</nav>`;
}
function wire() {
  $$("[data-tab]").forEach(b => b.onclick = () => ({ home, album, profile, rating })[b.dataset.tab]());
  $$("[data-mode]").forEach(b => b.onclick = () => { S.mode = b.dataset.mode; save(); beep(true); home(); });
  const me = $("#me"); if (me) me.onclick = profile;
}
const modes = () => `<div class="modes"><button data-mode="words" class="${S.mode !== "letters" ? "on" : ""}">🗣 Слова</button>
  <button data-mode="letters" class="${S.mode === "letters" ? "on" : ""}">🔤 Буквы</button></div>`;

/* ---------------- onboarding: name + avatar → password (or play without one) */
function onboarding(again = false) {
  app.innerHTML = `<section class="screen onboard">
    ${mascot("mood-happy", again ? "Как тебя зовут и какой ты зверёк?" : "Привет! Я котик <b>Гоги</b>.<br>А как зовут тебя?")}
    <input id="name" class="name-input" maxlength="16" placeholder="Твоё имя" autocomplete="off" value="${esc(S.name)}">
    <div class="avatars">${AVATARS.map(a => `<button class="av ${a === (S.avatar || AVATARS[0]) ? "on" : ""}" data-a="${a}">${a}</button>`).join("")}</div>
    <button class="play" id="go" disabled>Дальше →</button>
    ${again ? "" : `<button class="link" id="login">У меня уже есть аккаунт — войти</button>`}</section>`;
  let avatar = S.avatar || AVATARS[0];
  const inp = $("#name"), go = $("#go");
  const check = () => { go.disabled = inp.value.trim().length < 2; };
  inp.oninput = check; check();
  $$(".av").forEach(b => b.onclick = () => { $$(".av").forEach(x => x.classList.remove("on")); b.classList.add("on"); avatar = b.dataset.a; beep(true); });
  go.onclick = () => {
    S.name = inp.value.trim().slice(0, 16); S.avatar = avatar; save();
    if (again) { sync(); return profile(); }
    passwordScreen(false);
  };
  if (!again) { $("#login").onclick = loginScreen; setTimeout(() => play(pr("hello")), 300); }
  $(".mascot").onclick = () => play(pr("hello"));
}
function passwordScreen(fromProfile) {
  app.innerHTML = `<section class="screen onboard">
    ${mascot("", `Придумай пароль, ${esc(S.name)}!<br>С ним можно играть на любом телефоне или планшете. Можно простой — <b>3 буквы или цифры</b>.`)}
    <input id="pw" class="name-input" maxlength="32" placeholder="Пароль" autocomplete="new-password">
    <button class="play" id="reg" disabled>🔐 Зарегистрироваться</button>
    <button class="link" id="skip">${fromProfile ? "← Назад" : "Играть без пароля"}</button>
    ${fromProfile ? "" : `<p class="note">Без пароля игра запомнит тебя только на этом устройстве. Пароль можно создать потом в профиле.</p>`}</section>`;
  const pw = $("#pw"), reg = $("#reg");
  pw.oninput = () => { reg.disabled = pw.value.trim().length < 3; };
  $("#skip").onclick = () => { if (fromProfile) return profile(); play(pr("letsgo")); home(); };
  reg.onclick = async () => {
    if (!API) {
      toast("Регистрация откроется совсем скоро 🙂<br>Пока играем на этом устройстве — пароль создашь в профиле.");
      return fromProfile ? profile() : (play(pr("letsgo")), home());
    }
    reg.disabled = true;
    try {
      const r = await api("register", { name: S.name, password: pw.value.trim(), progress: progressPayload() });
      S.token = r.token; S.name = r.name; save();
      toast(`Готово! Аккаунт <b>${esc(S.name)}</b> создан ✓`); play(pr("letsgo"));
      fromProfile ? profile() : home();
    } catch (e) {
      reg.disabled = false;
      if (e.status === 409) toast(`Имя «${esc(S.name)}» уже занято. Добавь первую букву фамилии, например «${esc(S.name)} С.»`), onboarding(true);
      else toast("Не получилось: " + esc(e.message));
    }
  };
  pw.focus();
}
function loginScreen() {
  app.innerHTML = `<section class="screen onboard">${mascot("", "С возвращением! Введи имя и пароль.")}
    <input id="ln" class="name-input" maxlength="16" placeholder="Имя" autocomplete="username" value="${esc(S.name)}">
    <input id="lp" class="name-input" maxlength="32" placeholder="Пароль" type="password" autocomplete="current-password">
    <button class="play" id="in">Войти</button><button class="link" id="back">← Назад</button>
    ${API ? `<button class="link" id="forgot">Забыли пароль?</button>` : ""}</section>`;
  $("#back").onclick = () => onboarding();
  $("#in").onclick = async () => {
    if (!API) return toast("Вход с другого устройства откроется совсем скоро 🙂");
    try {
      const r = await api("login", { name: $("#ln").value.trim(), password: $("#lp").value.trim() });
      S = Object.assign(fresh(), r.progress || {}, { name: r.name, token: r.token, email: r.email || "" }); save();
      toast(`Привет, ${esc(S.name)}! Прогресс загружен ✓`); home();
    } catch (e) { toast(e.status === 401 ? "Имя или пароль не подходят" : "Не получилось: " + esc(e.message)); }
  };
  const f = $("#forgot");
  if (f) f.onclick = async () => {
    const name = $("#ln").value.trim(); if (!name) return toast("Сначала введи имя");
    try { await api("forgot", { name }); toast("Если к аккаунту привязана почта — мы отправили письмо со ссылкой 📧"); }
    catch (e) { toast("Не получилось: " + esc(e.message)); }
  };
}

/* ---------------- home */
function home() {
  if (!S.name) return onboarding();
  L = null;
  if (S.mode === "letters") return lettersHome();
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
  app.innerHTML = `<section class="screen">${header()}${modes()}
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
function lettersHome() {
  const all = LT.letters, total = all.length, k = all.filter(known).length;
  const next = all.find(x => !st(x).seen);
  const line = !all.some(x => st(x).seen) ? `${esc(S.name)}, давай знакомиться с грузинскими буквами!`
    : k === total ? "Ты знаешь все буквы! 🏆" : `Нажми на любую букву — она скажет, как звучит!`;
  const grid = all.map(x => {
    const s = S.words[x.id], cls = known(x) ? "known" : s && s.seen ? "seen" : x === next ? "next" : "";
    return `<button class="lt ${cls}" data-l="${x.id}">${x.g}</button>`;
  }).join("");
  app.innerHTML = `<section class="screen">${header()}${modes()}
    ${mascot("", line)}
    <div class="hero">
      <div class="big-num"><b>${k}</b><span>из ${total}<br>букв выучено</span></div>
      <div class="bar"><i style="width:${k / total * 100}%"></i></div>
      <button class="play" id="go">▶ Играть</button></div>
    <div class="letters">${grid}</div>${tabs("home")}</section>`;
  $("#go").onclick = startLetters;
  $$(".lt").forEach(b => b.onclick = () => { const x = all.find(y => y.id === b.dataset.l); b.animate([{ transform: "scale(1.2)" }, { transform: "scale(1)" }], { duration: 300 }); say(null, kaSrc(x), exSrc(x)); });
  wire();
}
function weekDots() {
  const t = today(), days = new Set(S.days || []), names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = t - 6 + i, wd = new Date((d * 864e5) + new Date().getTimezoneOffset() * 6e4).getDay();
    return `<span class="${days.has(d) ? "hit" : ""} ${d === t ? "today" : ""}"><i>${days.has(d) ? "🔥" : ""}</i>${names[wd]}</span>`;
  }).join("");
}

/* ---------------- lesson flow */
function begin(tasks, kind, topic) {
  if (!tasks.length) return home();
  L = { tasks, i: 0, stars: 0, tries: 0, fresh: tasks.filter(t => t.type === "intro" || t.type === "lintro").length, topic, kind };
  play(pr("start"));
  if (kind === "words") S.seenVersion = DB.version;
  save();
  setTimeout(task, 500);
}
const start = topic => begin(buildLesson(topic), "words", topic);
const startLetters = () => begin(buildLetterLesson(), "letters");
function steps() {
  const pct = L.i / L.tasks.length * 100;
  return `<div class="lesson-top"><button class="x" id="x" aria-label="Выйти">✕</button>
    <div class="track"><i style="width:${pct}%"></i><span class="runner" style="left:${pct}%">${S.avatar}</span></div></div>`;
}
function prefetch(i) { L.tasks.slice(i, i + 3).forEach(t => { blobURL(kaSrc(t.w)); blobURL(ruSrc(t.w)); if (isLetter(t.w)) blobURL(exSrc(t.w)); }); }
function task() {
  if (L.i >= L.tasks.length) return finish();
  const T = L.tasks[L.i];
  L.tries = 0;
  prefetch(L.i + 1);
  ({ intro, listen, sound, lintro, lfind, lfirst, ltrace })[T.type](T);
  $("#x").onclick = home;
}
const firstOf = type => !L.tasks.slice(0, L.i).some(t => t.type === type);
function choiceScreen(ask, middle, opts, renderOpt, w) {
  L.opts = opts;
  app.innerHTML = `<section class="screen">${steps()}
    <div class="card ${middle.big ? "big" : ""}"><p class="ask">${ask}</p>${middle.html}
      <div class="opts">${opts.map((o, i) => `<button class="opt ${isLetter(o) ? "glyph-opt" : ""}" data-i="${i}">${renderOpt(o)}</button>`).join("")}</div></div>
    ${mascot("", "")}</section>`;
  $$(".opt").forEach(b => b.onclick = () => answer(b, opts[+b.dataset.i] === w, w, opts));
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
  const w = T.w;
  choiceScreen("Послушай и найди картинку", { html: `<button class="speak" id="s" aria-label="Послушать">🔊</button>` }, options(w), pic, w);
  const sp = $("#s"); sp.onclick = () => say(sp, kaSrc(w));
  firstOf("listen") ? say(sp, pr("listen"), kaSrc(w)) : say(sp, kaSrc(w));
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
  if (firstOf("sound")) say(null, pr("sound"));
}
function lintro(T) {
  const w = T.w, ex = w.ex;
  app.innerHTML = `<section class="screen">${steps()}
    <div class="card big"><span class="badge-new">✨ Новая буква</span>
      <div class="pic-wrap letter-wrap"><span class="pic glyph">${w.g}</span></div>
      <div class="lname"><b>${esc(w.ka)}</b><span>звучит как «${esc(w.sound)}»</span></div>
      <div class="example"><span class="ex-pic">${picOf(ex.pic)}</span><span><b class="ka-word"><u>${w.g}</u>${esc(ex.ka.slice(w.g.length))}</b><small>${esc(ex.tr)} — ${esc(ex.ru)}</small></span></div>
      <div class="pair"><button class="btn" id="k">🔊 Буква</button><button class="btn alt" id="e">🔊 Слово</button></div></div>
    <button class="next" id="n">Запомнил! →</button></section>`;
  $("#k").onclick = () => say($("#k"), kaSrc(w));
  $("#e").onclick = () => say($("#e"), exSrc(w), ruSrc(w));
  $("#n").onclick = () => { st(w).seen = true; save(); L.i++; task(); };
  say(null, pr("new_letter"), kaSrc(w), exSrc(w), ruSrc(w));
}
function lfind(T) {
  const w = T.w;
  choiceScreen("Послушай и найди букву", { html: `<button class="speak" id="s" aria-label="Послушать">🔊</button>` }, options(w), pic, w);
  const sp = $("#s"); sp.onclick = () => say(sp, kaSrc(w));
  firstOf("lfind") ? say(sp, pr("find_letter"), kaSrc(w)) : say(sp, kaSrc(w));
}
function lfirst(T) {
  const w = T.w;
  choiceScreen("С какой буквы начинается слово?",
    { html: `<button class="ex-big" id="s">${picOf(w.ex.pic)}<span>🔊 ${esc(w.ex.ru)}</span></button>` }, options(w), pic, w);
  const sp = $("#s"); sp.onclick = () => say(sp, exSrc(w));
  firstOf("lfirst") ? say(sp, pr("first_letter"), exSrc(w)) : say(sp, exSrc(w));
}

/* ---------------- tracing: the child draws over a faint letter; done when most of it is covered */
function ltrace(T) {
  const w = T.w;
  app.innerHTML = `<section class="screen">${steps()}
    <div class="card"><p class="ask">Обведи букву пальчиком</p>
      <div class="trace"><canvas id="tc" width="600" height="600"></canvas><div class="meter"><i id="m"></i></div></div>
      <div class="pair"><button class="btn alt" id="clr">↺ Заново</button><button class="btn" id="hear">🔊 ${esc(w.ka)}</button></div></div>
    ${mascot("", "")}</section>`;
  const cv = $("#tc"), ctx = cv.getContext("2d"), N = 600, CELL = 12;
  const ink = document.createElement("canvas"); ink.width = ink.height = N;
  const ictx = ink.getContext("2d");
  let target = [], strokes = 0, done = false, last = null;
  const font = `800 470px ${GLYPH_FONT}`;
  function guide() {
    ctx.clearRect(0, 0, N, N);
    ctx.fillStyle = "#EFE3C8"; ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(w.g, N / 2, N / 2 + 20);
    ctx.drawImage(ink, 0, 0);
  }
  document.fonts.load(font).finally(() => {
    const m = document.createElement("canvas"); m.width = m.height = N;
    const mc = m.getContext("2d"); mc.font = font; mc.textAlign = "center"; mc.textBaseline = "middle"; mc.fillText(w.g, N / 2, N / 2 + 20);
    const data = mc.getImageData(0, 0, N, N).data;
    for (let y = CELL / 2; y < N; y += CELL) for (let x = CELL / 2; x < N; x += CELL) if (data[(y * N + x) * 4 + 3] > 120) target.push(y * N + x);
    guide();
  });
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * N / r.width, (e.clientY - r.top) * N / r.height]; };
  function line(a, b) {
    for (const c of [ctx, ictx]) {
      c.strokeStyle = "#FF4D5E"; c.lineWidth = 46; c.lineCap = c.lineJoin = "round";
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
  }
  function score() {
    const d = ictx.getImageData(0, 0, N, N).data;
    const hit = target.filter(i => d[i * 4 + 3] > 0).length;
    let inkCells = 0, outside = 0;
    const tset = new Set(target);
    for (let y = CELL / 2; y < N; y += CELL) for (let x = CELL / 2; x < N; x += CELL) {
      const i = y * N + x; if (d[i * 4 + 3] > 0) { inkCells++; if (!tset.has(i)) outside++; }
    }
    return { cover: target.length ? hit / target.length : 0, spill: inkCells ? outside / inkCells : 0 };
  }
  cv.onpointerdown = e => { if (done) return; cv.setPointerCapture(e.pointerId); last = pos(e); line(last, last); };
  cv.onpointermove = e => { if (!last || done) return; const p = pos(e); line(last, p); last = p; };
  cv.onpointerup = cv.onpointercancel = () => {
    if (!last || done) return;
    last = null; strokes++;
    const { cover, spill } = score();
    $("#m").style.width = Math.min(100, cover / .6 * 100) + "%";
    if (cover >= .6 && spill <= .6) { done = true; answer($(".trace"), true, w, []); }
    else if (spill > .6 && strokes > 2) react("mood-sad", "Старайся рисовать по букве 🙂");
    else if (strokes > 1) react("", "Ещё немного! ✏️");
  };
  $("#clr").onclick = () => { ictx.clearRect(0, 0, N, N); strokes = 0; $("#m").style.width = "0"; guide(); };
  $("#hear").onclick = () => say($("#hear"), kaSrc(w));
  cv.style.touchAction = "none";
  firstOf("ltrace") ? say(null, pr("trace"), kaSrc(w)) : say(null, kaSrc(w));
}

/* ---------------- answers & feedback */
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
    if (L.tries === 1) { s.box = Math.max(0, s.box - 1); L.tasks.push({ type: isLetter(w) ? "lfind" : "listen", w }); }  // comes back later in this lesson
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
  save(); sync();
  const letters = L.kind === "letters";
  const answered = L.tasks.filter(x => x.type !== "intro" && x.type !== "lintro").length;
  const stars = Math.max(1, Math.round(L.stars / Math.max(1, answered) * 3));
  const pool = letters ? LT.letters : DB.words, total = pool.length, k = pool.filter(known).length;
  const newWord = letters ? ["новая буква", "новые буквы", "новых букв"] : ["новое слово", "новых слова", "новых слов"];
  app.innerHTML = `<section class="screen result">
    <div class="cheer"><video id="cat" autoplay loop muted playsinline></video></div>
    <h2>Урок пройден, ${esc(S.name)}!</h2>
    <div class="stars">${[0, 1, 2].map(i => `<span class="${i < stars ? "got" : ""}" style="animation-delay:${.3 + i * .25}s">⭐</span>`).join("")}</div>
    <div class="stats">
      <div><b>+${L.stars}</b><span>звёзд</span></div>
      <div><b>${L.fresh ? "+" + L.fresh : "✓"}</b><span>${L.fresh ? plural(L.fresh, ...newWord) : "повторили"}</span></div>
      <div><b>${k}/${total}</b><span>выучено</span></div>
      <div><b>🔥${S.streak.n}</b><span>${plural(S.streak.n, "день", "дня", "дней")} подряд</span></div>
    </div>
    ${sticker ? `<div class="sticker-new">${sticker}</div><p class="got-sticker">Новая наклейка!</p>` : ""}
    <button class="play" id="again">▶ Следующий урок</button><button class="btn alt wide" id="home">Домой</button></section>`;
  play(pr("done"));
  blobURL(CATS[S.lessons % CATS.length]).then(u => { const v = $("#cat"); if (v) { v.src = u; v.play().catch(() => {}); } });
  $("#again").onclick = () => letters ? startLetters() : start(L.topic); $("#home").onclick = home;
}

/* ---------------- album, rating, profile */
function album() {
  app.innerHTML = `<section class="screen">${header()}
    <div class="panel-dark"><h3>🏅 Наклейки: ${S.stickers} из ${STICKERS.length}</h3><p>За каждый урок — новая наклейка</p></div>
    <div class="album">${STICKERS.map((s, i) => i < S.stickers ? `<div class="slot">${s}</div>` : `<div class="slot locked">?</div>`).join("")}</div>
    ${tabs("album")}</section>`;
  wire();
}
async function rating() {
  app.innerHTML = `<section class="screen">${header()}<div class="panel-dark"><h3>🏆 Рейтинг</h3><p>Загружаю…</p></div>${tabs("rating")}</section>`;
  wire();
  try {
    const r = await api("leaderboard");
    const rows = r.players.map((p, i) => `<div class="rk ${p.name === S.name ? "me-row" : ""}"><span class="pos">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
      <span class="av-s">${p.avatar}</span><b>${esc(p.name)}</b><span class="w">${p.known} сл · ${p.letters} б</span><span class="s">⭐${p.stars}</span></div>`).join("");
    app.innerHTML = `<section class="screen">${header()}<div class="panel-dark"><h3>🏆 Рейтинг</h3><p>Кто сколько слов и букв выучил</p></div>
      <div class="ranks">${rows || "<p>Пока никого — будь первым!</p>"}</div>${tabs("rating")}</section>`;
    wire();
  } catch { $(".panel-dark p").textContent = "Нет связи с сервером. Попробуй позже."; }
}
function profile() {
  const rows = DB.words.map(w => {
    const s = S.words[w.id], k = known(w);
    const label = !s || !s.seen ? ["new", "ещё не было"] : k ? ["known", "выучил"] : ["", "учит"];
    return `<div><span class="k">${esc(w.ka)}</span><span>${esc(w.ru)}</span><span class="s ${label[0]}">${label[1]}</span></div>`;
  }).join("");
  const kn = DB.words.filter(known).length, kl = LT.letters.filter(known).length;
  const account = S.token
    ? `<p class="muted">✓ Аккаунт защищён паролем — заходи с любого устройства по имени <b>${esc(S.name)}</b>.</p>
       ${API ? `<div class="row-in"><input id="em" class="small-input" type="email" placeholder="Почта родителей (для восстановления)" value="${esc(S.email)}">
       <button class="btn" id="sem">Сохранить</button></div>` : ""}`
    : `<p class="muted">Сейчас прогресс хранится только на этом устройстве.</p><button class="btn wide" id="mkpw">🔐 Создать пароль</button>`;
  app.innerHTML = `<section class="screen">${header()}
    <div class="panel profile-head"><span class="big-av">${S.avatar}</span><div><h3>${esc(S.name)}</h3>
      <p>⭐ ${S.stars} · 🔥 ${streakNow()} · уроков ${S.lessons}<br>слов ${kn}/${DB.words.length} · букв ${kl}/${LT.letters.length}</p></div>
      <button class="btn alt" id="edit">✏️</button></div>
    <div class="panel"><h3>🔐 Вход с другого устройства</h3>${account}</div>
    <div class="panel"><h3>Голос</h3><div class="seg"><button data-v="giorgi" class="${S.voice === "giorgi" ? "on" : ""}">🧔 Гиорги</button>
      <button data-v="eka" class="${S.voice === "eka" ? "on" : ""}">👩 Эка</button></div></div>
    <div class="panel"><h3>Слова</h3><div class="wl">${rows}</div><button class="danger" id="reset">Сбросить прогресс</button></div>
    ${tabs("profile")}</section>`;
  $$("[data-v]").forEach(b => b.onclick = () => { S.voice = b.dataset.v; save(); sync(); profile(); play(`audio/${S.voice}/${DB.words[0].id}.mp3`); });
  $("#edit").onclick = () => onboarding(true);
  const mk = $("#mkpw"); if (mk) mk.onclick = () => passwordScreen(true);
  const sem = $("#sem");
  if (sem) sem.onclick = async () => {
    try { await api("email", { email: $("#em").value.trim() }); S.email = $("#em").value.trim(); save(); toast("Письмо для подтверждения отправлено 📧"); }
    catch (e) { toast("Не получилось: " + esc(e.message)); }
  };
  $("#reset").onclick = () => {
    if (confirm("Стереть весь прогресс на этом устройстве?")) {
      const { name, avatar, voice, token, email } = S; S = Object.assign(fresh(), { name, avatar, voice, token, email }); save(); sync(); home();
    }
  };
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
    const [db, lt, svg] = await Promise.all([
      fetch("words.json", { cache: "no-cache" }).then(r => r.json()),
      fetch("letters.json", { cache: "no-cache" }).then(r => r.json()),
      fetch("pics/mascot.svg").then(r => r.text()).catch(() => "🐱")]);
    DB = db; LT = lt; MASCOT = svg;
  } catch {
    app.innerHTML = `<section class="screen"><div class="card"><p class="ask">Нет связи. Откройте игру один раз с интернетом.</p></div></section>`;
    return;
  }
  API = await fetch("api/ping", { cache: "no-store" }).then(r => r.ok).catch(() => false);
  if (!S.seenVersion) S.seenVersion = DB.version;
  home();
  if (API && S.token) api("me").then(r => { if (r.progress && (r.progress.lessons || 0) > S.lessons) { Object.assign(S, r.progress); save(); home(); } }).catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
