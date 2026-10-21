(() => {
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }
  const CATS = [
    { id: "baustelle", label: "Baustelle" },
    { id: "kunde", label: "Kundentermin" },
    { id: "buero", label: "Büro / Intern" },
    { id: "abwesend", label: "Urlaub / Abwesend" },
  ];
  const catColor = (id) => `var(--cat-${CATS.some(c => c.id === id) ? id : "buero"})`;
  const catLabel = (id) => (CATS.find(c => c.id === id) || CATS[2]).label;
  const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const DOW = ["Mo","Di","Mi","Do","Fr","Sa","So"];
  const DOW_LONG = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
  const H_START = 6, H_END = 21;

  // ---------- Datum ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const dowIdx = (d) => (d.getDay() + 6) % 7;
  const monday = (d) => addDays(d, -dowIdx(d));
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  };
  const toMin = (s) => { if (!s) return null; const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const longDate = (d) => `${DOW_LONG[dowIdx(d)]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;

  // Gesetzliche Feiertage Bayern
  const holCache = {};
  function holidays(y) {
    if (holCache[y]) return holCache[y];
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const em = Math.floor((h + l - 7 * m + 114) / 31), ed = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = new Date(y, em - 1, ed);
    const map = {};
    const put = (d, n) => { map[ymd(d)] = n; };
    put(new Date(y, 0, 1), "Neujahr");
    put(new Date(y, 0, 6), "Heilige Drei Könige");
    put(addDays(easter, -2), "Karfreitag");
    put(addDays(easter, 1), "Ostermontag");
    put(new Date(y, 4, 1), "Tag der Arbeit");
    put(addDays(easter, 39), "Christi Himmelfahrt");
    put(addDays(easter, 50), "Pfingstmontag");
    put(addDays(easter, 60), "Fronleichnam");
    put(new Date(y, 7, 15), "Mariä Himmelfahrt");
    put(new Date(y, 9, 3), "Tag der Deutschen Einheit");
    put(new Date(y, 10, 1), "Allerheiligen");
    put(new Date(y, 11, 25), "1. Weihnachtstag");
    put(new Date(y, 11, 26), "2. Weihnachtstag");
    return (holCache[y] = map);
  }
  const holidayOf = (d) => holidays(d.getFullYear())[ymd(d)] || "";

  // ---------- Zustand ----------
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const state = {
    view: store.get("kal.view") === "week" ? "week" : "month",
    cursor: new Date(),
    selected: ymd(new Date()),
    person: "",
    events: new Map(),
    canWrite: false,
    col: null,
    myId: null,
    ranges: [],
  };
  // Zeitraum ist geladen, wenn ein bereits abgefragter Bereich ihn enthält.
  const covered = (ds) => state.ranges.some(r => ds >= r.from && ds <= r.to);
  let rangeHook = null;
  const $ = (id) => document.getElementById(id);
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  }
  const svgPlus = () => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", "M8 3v10M3 8h10"); s.append(p); return s; };

  function eventsOn(dateStr) {
    const list = [];
    for (const [id, e] of state.events) {
      if (e.date !== dateStr) continue;
      if (state.person && (e.person || "").trim().toLowerCase() !== state.person) continue;
      list.push({ id, ...e });
    }
    return list.sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || (toMin(a.start) ?? 0) - (toMin(b.start) ?? 0) || String(a.title).localeCompare(String(b.title)));
  }
  const timeLabel = (e) => e.allDay ? "ganztägig" : `${e.start}–${e.end}`;

  // ---------- Rendering ----------
  const narrow = matchMedia("(max-width: 720px)");
  function render() {
    document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    const board = $("board");
    board.replaceChildren(state.view === "month" ? renderMonth() : (narrow.matches ? renderWeekList() : renderWeek()));
    renderAgenda();
    renderFilter();
    $("newBtn").disabled = !state.canWrite;
    if (rangeHook) rangeHook();
  }

  // Erster angezeigter Montag und Anzahl der Wochen der Monatsansicht.
  function monthWeeks(c) {
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    return { start: monday(first), weeks: Math.ceil((dowIdx(first) + new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate()) / 7) };
  }
  function renderMonth() {
    const c = state.cursor, y = c.getFullYear(), m = c.getMonth();
    $("periodTitle").textContent = `${MONTHS[m]} ${y}`;
    const { start, weeks } = monthWeeks(c);
    $("periodKw").textContent = `KW ${isoWeek(start)}–${isoWeek(addDays(start, weeks * 7 - 1))}`;
    const grid = el("div", { class: "month", role: "grid", "aria-label": `${MONTHS[m]} ${y}` });
    grid.append(el("div", { class: "dow kwh", title: "Kalenderwoche" }, "KW"));
    DOW.forEach(d => grid.append(el("div", { class: "dow" }, d)));
    const today = ymd(new Date());
    for (let w = 0; w < weeks; w++) {
      const ws = addDays(start, w * 7);
      grid.append(el("div", { class: "kwcell" }, isoWeek(ws)));
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i), ds = ymd(d), evs = eventsOn(ds), hol = holidayOf(d);
        const cls = ["day", d.getMonth() !== m && "out", i >= 5 && "weekend", ds === today && "today", ds === state.selected && "sel"].filter(Boolean).join(" ");
        const cell = el("div", { class: cls, role: "gridcell", tabindex: "0", "data-date": ds, "aria-label": `${longDate(d)}${hol ? ", " + hol : ""}, ${evs.length} Termine`,
          onclick: () => select(ds), onkeydown: (ev) => { if (ev.key === "Enter") { select(ds); $("board").querySelector(`[data-date="${ds}"]`)?.focus({ preventScroll: true }); } } });
        cell.addEventListener("dblclick", () => state.canWrite && openEditor(null, ds));
        const head = el("div", { class: "dhead" }, el("span", { class: "dnum" }, d.getDate()));
        if (state.canWrite) head.append(el("button", { class: "addday", type: "button", "aria-label": `Termin am ${longDate(d)} anlegen`, onclick: (ev) => { ev.stopPropagation(); openEditor(null, ds); } }, svgPlus()));
        cell.append(head);
        if (hol) cell.append(el("div", { class: "hol", title: hol }, hol));
        const max = hol ? 2 : 3;
        evs.slice(0, max).forEach(e => cell.append(chip(e)));
        if (evs.length > max) cell.append(el("div", { class: "more" }, `+${evs.length - max} weitere`));
        if (evs.length) cell.append(el("div", { class: "dots", "aria-hidden": "true" }, evs.slice(0, 4).map(e => el("i", { style: `--c:${catColor(e.cat)}` }))));
        grid.append(cell);
      }
    }
    return grid;
  }

  function chip(e) {
    return el("button", { class: "chip" + (e.allDay ? " allday" : ""), type: "button", style: `--c:${catColor(e.cat)}`, title: `${timeLabel(e)} · ${e.title} · ${e.person || ""}`,
      onclick: (ev) => { ev.stopPropagation(); state.selected = e.date; openEditor(e.id); } },
      e.allDay ? null : el("span", { class: "t" }, e.start), el("span", { class: "n" }, e.title));
  }

  function weekStart() { return monday(state.cursor); }
  // Sichtbarer Zeitraum: die angezeigten Wochen des Monats bzw. die 7 Tage der Woche.
  function visibleRange() {
    if (state.view !== "month") { const s = weekStart(); return { from: ymd(s), to: ymd(addDays(s, 6)) }; }
    const { start, weeks } = monthWeeks(state.cursor);
    return { from: ymd(start), to: ymd(addDays(start, weeks * 7 - 1)) };
  }
  function setWeekTitle(ws) {
    const we = addDays(ws, 6);
    const sameM = ws.getMonth() === we.getMonth();
    $("periodTitle").textContent = sameM ? `${ws.getDate()}.–${we.getDate()}. ${MONTHS[we.getMonth()]} ${we.getFullYear()}` : `${ws.getDate()}. ${MONTHS[ws.getMonth()].slice(0, 3)} – ${we.getDate()}. ${MONTHS[we.getMonth()].slice(0, 3)} ${we.getFullYear()}`;
    $("periodKw").textContent = `KW ${isoWeek(ws)}`;
  }

  let shownWeek = "";
  function renderWeek() {
    const ws = weekStart(); setWeekTitle(ws);
    const old = document.querySelector("#board .wbody");
    const keepTop = old && shownWeek === ymd(ws) ? old.scrollTop : null;
    shownWeek = ymd(ws);
    const today = ymd(new Date());
    const wrap = el("div", { class: "week" });
    const head = el("div", { class: "whead" }, el("div"));
    const all = el("div", { class: "wall" }, el("div", { class: "lab" }, "ganzt."));
    const body = el("div", { class: "wbody" });
    const hourPx = 52, total = (H_END - H_START) * hourPx;
    const hours = el("div", { class: "hours", style: `height:${total}px` });
    for (let h = H_START + 1; h < H_END; h++) hours.append(el("span", { style: `top:${(h - H_START) * hourPx}px` }, `${pad(h)}:00`));
    body.append(hours);
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i), ds = ymd(d), hol = holidayOf(d), evs = eventsOn(ds);
      head.append(el("div", { class: ["wd", ds === today && "today", ds === state.selected && "sel"].filter(Boolean).join(" "), onclick: () => select(ds) },
        el("div", { class: "l" }, DOW[i]), el("div", { class: "d" }, d.getDate()), hol ? el("div", { class: "hol", title: hol }, hol) : null));
      all.append(el("div", { class: "cell" }, evs.filter(e => e.allDay).map(chip)));
      const col = el("div", { class: "col" + (ds === today ? " today" : ""), style: `height:${total}px`, "aria-label": longDate(d) });
      col.addEventListener("click", (ev) => {
        if (ev.target !== col) return;
        select(ds, true);
        if (!state.canWrite) return;
        const y = ev.offsetY, mins = Math.floor((y / hourPx) * 4) * 15 + H_START * 60;
        const s = Math.min(mins, (H_END - 1) * 60);
        openEditor(null, ds, `${pad(Math.floor(s / 60))}:${pad(s % 60)}`, `${pad(Math.floor((s + 60) / 60))}:${pad((s + 60) % 60)}`);
      });
      layoutBlocks(evs.filter(e => !e.allDay)).forEach(({ e, lane, lanes }) => {
        const s = Math.max(toMin(e.start), H_START * 60), en = Math.min(Math.max(toMin(e.end), s + 20), H_END * 60);
        const top = (s - H_START * 60) / 60 * hourPx, h = Math.max((en - s) / 60 * hourPx - 2, 22);
        const w = 100 / lanes;
        const b = el("button", { class: "blk", type: "button", style: `--c:${catColor(e.cat)};top:${top}px;height:${h}px;left:calc(${lane * w}% + 2px);width:calc(${w}% - 4px)`,
          onclick: (ev) => { ev.stopPropagation(); state.selected = ds; openEditor(e.id); } },
          el("span", { class: "bt" }, e.title), el("span", { class: "bm num" }, `${e.start}–${e.end}`), h > 50 && e.person ? el("span", { class: "bm" }, e.person) : null);
        col.append(b);
      });
      if (ds === today) {
        const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
        if (nm >= H_START * 60 && nm <= H_END * 60) col.append(el("div", { class: "nowline", style: `top:${(nm - H_START * 60) / 60 * hourPx}px` }));
      }
      body.append(col);
    }
    wrap.append(head, all, body);
    requestAnimationFrame(() => { body.scrollTop = keepTop ?? (7 - H_START) * hourPx; });
    return wrap;
  }

  function layoutBlocks(evs) {
    const items = evs.map(e => ({ e, s: toMin(e.start), en: Math.max(toMin(e.end), toMin(e.start) + 20) })).sort((a, b) => a.s - b.s || b.en - a.en);
    const out = []; let cluster = [], lanesEnd = [], clusterEnd = -1;
    const flush = () => { const n = lanesEnd.length || 1; cluster.forEach(c => out.push({ e: c.e, lane: c.lane, lanes: n })); cluster = []; lanesEnd = []; };
    for (const it of items) {
      if (it.s >= clusterEnd && cluster.length) flush();
      let lane = lanesEnd.findIndex(end => end <= it.s);
      if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(it.en); } else lanesEnd[lane] = it.en;
      it.lane = lane; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.en);
    }
    if (cluster.length) flush();
    return out;
  }

  function renderWeekList() {
    const ws = weekStart(); setWeekTitle(ws);
    const today = ymd(new Date());
    const list = el("div", { class: "wlist" });
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i), ds = ymd(d), hol = holidayOf(d), evs = eventsOn(ds);
      list.append(el("section", null,
        el("h3", { class: ds === today ? "today" : "" }, longDate(d), hol ? el("span", { class: "hol" }, hol) : null),
        evs.length ? evs.map(itemCard) : el("div", { class: "none" }, "Keine Termine")));
    }
    return list;
  }

  function itemCard(e) {
    return el("button", { class: "item", type: "button", onclick: () => openEditor(e.id) },
      el("div", { class: "time" }, e.allDay ? el("b", null, "ganzt.") : [el("b", null, e.start), e.end]),
      el("div", { class: "body" },
        el("span", { class: "ti" }, e.title),
        el("span", { class: "meta" }, el("span", { class: "tag", style: `--c:${catColor(e.cat)}` }, catLabel(e.cat)), e.person ? el("span", null, "· " + e.person) : null),
        e.note ? el("span", { class: "note" }, e.note) : null));
  }

  function renderAgenda() {
    const d = parse(state.selected), evs = eventsOn(state.selected), hol = holidayOf(d);
    const a = $("agenda");
    const kids = [];
    kids.push(el("header", null,
      el("div", null, el("h3", null, longDate(d)),
        el("div", { class: "sub" }, `${d.getFullYear()} · KW ${isoWeek(d)}`, hol ? [" · ", el("span", { class: "h" }, hol)] : null)),
      state.canWrite ? el("button", { class: "btn icon", type: "button", "aria-label": "Termin an diesem Tag anlegen", onclick: () => openEditor(null, state.selected) }, svgPlus()) : null));
    if (!covered(state.selected)) kids.push(el("div", { class: "empty" }, "Termine werden geladen …"));
    else if (evs.length) kids.push(el("div", { class: "items" }, evs.map(itemCard)));
    else kids.push(el("div", { class: "empty" },
      el("span", null, state.person ? "Keine Termine dieser Person an diesem Tag." : "An diesem Tag ist noch nichts eingetragen."),
      state.canWrite ? el("button", { class: "btn", type: "button", onclick: () => openEditor(null, state.selected) }, svgPlus(), "Termin eintragen") : null));
    kids.push(el("div", { class: "legend" }, CATS.map(c => el("span", { class: "tag", style: `--c:${catColor(c.id)}` }, c.label))));
    a.replaceChildren(...kids);
  }

  function renderFilter() {
    const sel = $("personFilter");
    const names = new Map();
    for (const e of state.events.values()) { const n = (e.person || "").trim(); if (n) names.set(n.toLowerCase(), names.get(n.toLowerCase()) || n); }
    const sorted = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], "de"));
    const sig = sorted.map(x => x[0]).join("|");
    if (sel.dataset.sig === sig && sel.value === state.person) return;
    sel.dataset.sig = sig;
    sel.replaceChildren(el("option", { value: "" }, "Alle Personen"), ...sorted.map(([k, n]) => el("option", { value: k }, n)));
    if (state.person && !names.has(state.person)) state.person = "";
    sel.value = state.person;
  }

  const phone = matchMedia("(max-width: 640px)"), calm = matchMedia("(prefers-reduced-motion: reduce)");
  function select(ds, silent) {
    state.selected = ds;
    if (!silent || state.view === "month") render(); else renderAgenda();
    if (state.view === "month" && phone.matches) {
      const a = $("agenda");
      if (a.getBoundingClientRect().top > innerHeight - 120) a.scrollIntoView({ behavior: calm.matches ? "auto" : "smooth", block: "start" });
    }
  }

  // ---------- Editor ----------
  const dlg = $("dlg");
  let editingId = null, editingStamp = null, deletingId = null;
  $("cats").replaceChildren(...CATS.map((c, i) => el("label", { style: `--c:${catColor(c.id)}` },
    el("input", { type: "radio", name: "cat", value: c.id, id: `cat-${c.id}`, checked: i === 0 }), c.label)));
  const syncAllDay = () => { $("timeRow").hidden = $("f-allday").checked; };
  $("f-allday").addEventListener("change", syncAllDay);
  $("f-start").addEventListener("change", () => {
    const s = toMin($("f-start").value), e = toMin($("f-end").value);
    if (s != null && (e == null || e <= s)) { const n = Math.min(s + 60, 23 * 60 + 45); $("f-end").value = `${pad(Math.floor(n / 60))}:${pad(n % 60)}`; }
  });

  function openEditor(id, dateStr, start, end) {
    const e = id ? state.events.get(id) : null;
    if (id && !e) return;
    editingId = id; editingStamp = e ? e.updatedAt : null;
    const ro = !state.canWrite;
    $("dlgTitle").textContent = ro ? "Termin" : (e ? "Termin bearbeiten" : "Neuer Termin");
    $("f-title").value = e ? e.title : "";
    $("f-date").value = e ? e.date : (dateStr || state.selected);
    $("f-allday").checked = !!(e && e.allDay);
    $("f-start").value = e && !e.allDay ? e.start : (start || "08:00");
    $("f-end").value = e && !e.allDay ? e.end : (end || "09:00");
    $("f-person").value = e ? (e.person || "") : (store.get("kal.name") || state.myName || "");
    $("f-note").value = e ? (e.note || "") : "";
    const cat = e && CATS.some(c => c.id === e.cat) ? e.cat : "baustelle";
    $(`cat-${cat}`).checked = true;
    $("formErr").textContent = "";
    $("delBtn").hidden = !e || ro;
    disarmDelete();
    $("saveBtn").hidden = ro;
    $("cancelBtn").textContent = ro ? "Schließen" : "Abbrechen";
    dlg.querySelectorAll("input, textarea").forEach(n => { n.disabled = ro; });
    $("stamp").textContent = e && e.updatedAt ? `Geändert ${fmtStamp(e.updatedAt)}` : "";
    syncAllDay();
    $("f-title").autofocus = !ro && !e;
    $("cancelBtn").autofocus = ro || !!e;
    dlg.showModal();
  }
  // Zeitstempel kommen je nach Weg als "…T…+00:00" oder "… …+00"
  const tsOf = (v) => Date.parse(String(v || "").replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  const fmtStamp = (iso) => { const d = new Date(tsOf(iso)); return isNaN(d) ? "" : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  $("cancelBtn").addEventListener("click", () => dlg.close());
  // Kundendaten nur so lange im Formular halten, wie es offen ist.
  dlg.addEventListener("close", () => { $("form").reset(); $("stamp").textContent = ""; $("formErr").textContent = ""; editingId = editingStamp = null; });
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });

  let delTimer = null;
  function disarmDelete() { clearTimeout(delTimer); const b = $("delBtn"); b.classList.remove("armed"); b.textContent = "Löschen"; }
  $("delBtn").addEventListener("click", async () => {
    const b = $("delBtn");
    if (!b.classList.contains("armed")) {
      b.classList.add("armed"); b.textContent = "Wirklich löschen?";
      delTimer = setTimeout(disarmDelete, 4000); return;
    }
    disarmDelete();
    const id = editingId;
    b.disabled = true; deletingId = id;
    try { await state.col.doc(id).delete(); dlg.close(); render(); toast("Termin gelöscht"); }
    catch (err) { $("formErr").textContent = writeError(err); }
    finally { b.disabled = false; deletingId = null; }
  });

  $("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!state.canWrite || !state.col) return;
    const title = $("f-title").value.trim(), date = $("f-date").value, allDay = $("f-allday").checked;
    const start = $("f-start").value, end = $("f-end").value, person = $("f-person").value.trim(), note = $("f-note").value.trim();
    const cat = (dlg.querySelector('input[name="cat"]:checked') || {}).value || "baustelle";
    const err = !title ? "Bitte einen Titel eintragen." : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Bitte ein Datum wählen."
      : !allDay && (!start || !end) ? "Bitte Uhrzeit von und bis angeben."
      : !allDay && toMin(end) <= toMin(start) ? "Die Endzeit muss nach der Startzeit liegen."
      : !person ? "Bitte deinen Namen eintragen, damit alle sehen, wer den Termin angelegt hat." : "";
    if (err) { $("formErr").textContent = err; return; }
    store.set("kal.name", person);
    const now = new Date().toISOString();
    const prev = editingId ? state.events.get(editingId) : null;
    const body = { title, date, allDay, start: allDay ? "" : start, end: allDay ? "" : end, person, note, cat,
      createdAt: prev?.createdAt || now, createdBy: prev?.createdBy || state.myId || "", updatedAt: now };
    $("saveBtn").disabled = true;
    try {
      if (editingId) await state.col.doc(editingId).set(body, editingStamp); else await state.col.add(body);
      dlg.close();
      state.selected = date;
      const d = parse(date);
      if (state.view === "month" && (d.getMonth() !== state.cursor.getMonth() || d.getFullYear() !== state.cursor.getFullYear())) state.cursor = d;
      if (state.view === "week" && ymd(monday(d)) !== ymd(weekStart())) state.cursor = d;
      render();
      if (!document.body.classList.contains("locked")) toast(prev ? "Termin gespeichert" : "Termin eingetragen");
    } catch (e2) { $("formErr").textContent = writeError(e2); }
    finally { $("saveBtn").disabled = false; }
  });

  function writeError(e) {
    const code = e && e.code;
    if (code === "conflict") {
      editingStamp = state.events.get(editingId)?.updatedAt || null;
      return "Jemand hat diesen Termin gerade geändert. Abbrechen zeigt die neue Fassung, Speichern überschreibt sie mit deiner.";
    }
    if (loggedOut(e)) { lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden."); return ""; }
    if (code === "23514" || code === "22001") return "Ein Feld ist ungültig oder zu lang. Titel bis 120, Name bis 60, Notiz bis 1000 Zeichen.";
    if (e && e.status === 429) return "Gerade zu viele Änderungen auf einmal. Bitte kurz warten und erneut speichern.";
    return "Speichern hat nicht geklappt. Prüfe die Verbindung und versuche es erneut.";
  }
  const loggedOut = (e) => !!e && (["42501", "PGRST301", "PGRST302", "PGRST303"].includes(e.code) || e.status === 401 || e.status === 403 || /JWT/i.test(e.message || ""));

  // ---------- Toast ----------
  let toastT = null;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }

  // ---------- Status ----------
  function setStatus(s, text) { $("status").dataset.state = s; $("statusText").textContent = text; }

  // ---------- Navigation ----------
  function shift(n) {
    const c = state.cursor;
    state.cursor = state.view === "month" ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, 7 * n);
    const d = state.cursor;
    state.selected = state.view === "month" ? ymd(new Date(d.getFullYear(), d.getMonth(), 1)) : ymd(monday(d));
    const t = new Date();
    if (state.view === "month" ? (t.getMonth() === d.getMonth() && t.getFullYear() === d.getFullYear()) : ymd(monday(t)) === ymd(monday(d))) state.selected = ymd(t);
    render();
  }
  $("prevBtn").addEventListener("click", () => shift(-1));
  $("nextBtn").addEventListener("click", () => shift(1));
  $("todayBtn").addEventListener("click", () => { state.cursor = new Date(); state.selected = ymd(new Date()); render(); });
  $("newBtn").addEventListener("click", () => openEditor(null, state.selected));
  document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
    state.view = b.dataset.view; store.set("kal.view", state.view);
    state.cursor = parse(state.selected); render();
  }));
  $("personFilter").addEventListener("change", (e) => { state.person = e.target.value; render(); });
  narrow.addEventListener("change", () => { if (state.view === "week") render(); });
  document.addEventListener("keydown", (e) => {
    if (dlg.open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    if (e.key === "ArrowLeft" && e.altKey) shift(-1);
    if (e.key === "ArrowRight" && e.altKey) shift(1);
  });
  setInterval(() => { if (state.view === "week" && !dlg.open) render(); }, 5 * 60 * 1000);

  document.getElementById("loginDay").textContent = new Date().getDate();
  render();

  // ---------- Verbindung (Supabase) ----------
  const CFG = window.KALENDER_CONFIG || {};
  const sb = window.supabase && CFG.url ? window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
  const fromRow = (r) => ({ title: r.title, date: r.date, allDay: !!r.all_day, start: r.start_time || "", end: r.end_time || "",
    person: r.person || "", note: r.note || "", cat: r.cat || "buero", createdAt: r.created_at, updatedAt: r.updated_at });
  const toRow = (b) => ({ title: b.title, date: b.date, all_day: !!b.allDay, start_time: b.allDay ? null : b.start, end_time: b.allDay ? null : b.end,
    person: b.person, note: b.note || null, cat: b.cat });
  const check = ({ error }) => { if (error) throw error; };
  const T = "kalender_termine", COLS = "id,title,date,all_day,start_time,end_time,person,note,cat,updated_at";
  const isLocked = () => document.body.classList.contains("locked");
  // Termine, die sich während einer laufenden Abfrage geändert haben; die ältere Abfrage überschreibt sie nicht.
  let touched = new Set();
  // Eine Änderung nur übernehmen, wenn sie nicht älter ist als der bekannte Stand (Zeit vergibt die Datenbank).
  function putRow(r) {
    if (isLocked()) return;
    touched.add(r.id);
    const cur = state.events.get(r.id);
    if (cur && tsOf(cur.updatedAt) > tsOf(r.updated_at)) return;
    state.events.set(r.id, fromRow(r));
  }
  function dropRow(id) { if (!id) return; touched.add(id); state.events.delete(id); }
  function afterChange() {
    if (dlg.open && editingId && editingId !== deletingId && !state.events.has(editingId)) { dlg.close(); toast("Dieser Termin wurde gerade von jemand anderem gelöscht"); }
    render();
  }
  state.col = {
    add: async (b) => { const res = await sb.from(T).insert(toRow(b)).select(COLS).single(); check(res); putRow(res.data); },
    doc: (id) => ({
      // Nur speichern, wenn niemand den Termin seit dem Öffnen geändert hat.
      set: async (b, stamp) => {
        let q = sb.from(T).update(toRow(b)).eq("id", id);
        if (stamp) q = q.eq("updated_at", stamp);
        const res = await q.select(COLS); check(res);
        if (res.data.length) { putRow(res.data[0]); return; }
        const now = await sb.from(T).select(COLS).eq("id", id).maybeSingle(); check(now);
        if (isLocked()) throw { code: "conflict" };
        if (now.data) putRow(now.data); else dropRow(id);
        afterChange();
        throw { code: "conflict" };
      },
      delete: async () => { check(await sb.from(T).delete().eq("id", id)); dropRow(id); },
    }),
  };
  // Geladen wird nur der sichtbare Zeitraum, damit die Datenmenge auch nach Jahren klein bleibt.
  // Die Datenbank liefert höchstens 1000 Zeilen pro Abfrage, daher seitenweise.
  const PAGE = 1000;
  let loadSeq = 0, lastRangeKey = "", navT = null, retryT = null, retryMs = 5000;
  async function refresh() {
    clearTimeout(navT); clearTimeout(retryT);
    const r = visibleRange(), seq = ++loadSeq, rows = [], seen = touched = new Set();
    lastRangeKey = r.from + r.to;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from(T).select(COLS).gte("date", r.from).lte("date", r.to).order("date").order("id").range(from, from + PAGE - 1);
      if (seq !== loadSeq) return;
      if (error) {
        if (loggedOut(error)) return lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden.");
        // Später erneut versuchen, mit wachsendem Abstand.
        setStatus("readonly", "Getrennt"); lastRangeKey = "";
        retryT = setTimeout(() => rangeHook(), retryMs); retryMs = Math.min(retryMs * 2, 120000);
        return;
      }
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    if (isLocked()) return;
    for (const [id, e] of state.events) if (e.date >= r.from && e.date <= r.to && !seen.has(id)) state.events.delete(id);
    for (const row of rows) if (!seen.has(row.id)) putRow(row);
    // Ein offener Termin, der nicht mehr im Zeitraum liegt, wurde vielleicht nur verschoben.
    if (dlg.open && editingId && editingId !== deletingId && !state.events.has(editingId)) {
      const one = await sb.from(T).select(COLS).eq("id", editingId).maybeSingle();
      if (seq !== loadSeq || isLocked()) return;
      if (one.data) putRow(one.data);
    }
    if (!state.ranges.some(x => x.from <= r.from && x.to >= r.to)) state.ranges.push(r);
    retryMs = 5000;
    state.canWrite = true;
    setStatus("live", "Live · für alle sichtbar"); $("banner").hidden = true;
    afterChange();
  }
  // Beim Blättern kurz warten, damit schnelles Klicken nicht jeden Monat einzeln lädt.
  rangeHook = () => {
    if (!sb || isLocked()) return;
    const r = visibleRange(), k = r.from + r.to;
    if (k === lastRangeKey) return;
    lastRangeKey = k; clearTimeout(navT); navT = setTimeout(refresh, 200);
  };
  addEventListener("online", () => { if (sb && !isLocked()) refresh(); });
  let channel = null, joined = false, firstT = null;
  function startLive() {
    if (channel) return;
    channel = sb.channel("termine-live")
      // Änderungen der anderen kommen einzeln an, ohne alles neu zu laden.
      .on("postgres_changes", { event: "*", schema: "public", table: T }, (p) => {
        if (isLocked()) return;
        if (p.eventType === "DELETE") dropRow(p.old && p.old.id);
        else if (p.new && p.new.id) putRow(p.new);
        afterChange();
      })
      .subscribe((st) => {
        // Nach jedem (Wieder-)Verbinden neu laden, damit verpasste Änderungen nachkommen.
        if (st === "SUBSCRIBED") { joined = true; clearTimeout(firstT); refresh(); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") { setStatus("readonly", "Getrennt"); if (!state.ranges.length && !isLocked()) refresh(); }
      });
  }
  // Nach mehr als einer Minute im Hintergrund den sichtbaren Zeitraum auffrischen.
  let hiddenAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (sb && !isLocked() && Date.now() - hiddenAt > 60 * 1000) refresh();
  });

  // Anmeldung gilt höchstens 30 Tage auf einem Gerät, danach muss das Passwort neu eingegeben werden.
  const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
  const loginStamp = { get() { try { return Number(localStorage.getItem("kal.loginAt")) || 0; } catch { return 0; } },
    set(v) { try { v ? localStorage.setItem("kal.loginAt", String(v)) : localStorage.removeItem("kal.loginAt"); } catch {} } };

  function clearData() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    loadSeq++; lastRangeKey = ""; joined = false; touched = new Set();
    clearTimeout(navT); clearTimeout(retryT); clearTimeout(firstT); retryMs = 5000;
    if (dlg.open) dlg.close();
    state.events = new Map(); state.ranges = []; state.canWrite = false; state.person = "";
    render();
  }
  function showLogin(msg) {
    document.body.classList.add("locked");
    clearData();
    $("loginErr").textContent = msg || "";
    $("loginPw").value = "";
    setTimeout(() => $("loginPw").focus(), 50);
  }
  async function lockOut(msg) {
    loginStamp.set(0);
    showLogin(msg);
    let failed = true;
    try { failed = !!(await sb.auth.signOut({ scope: "local" })).error; } catch {}
    if (failed) try { localStorage.removeItem(sb.auth.storageKey); } catch {}
  }
  const teamUser = (s) => !!s && (s.user?.email || "").toLowerCase() === String(CFG.email).toLowerCase();
  async function enter() {
    document.body.classList.remove("locked");
    startLive();
    // Die erste Ladung kommt mit dem Verbinden der Live-Verbindung; hängt diese, nach 3 s direkt laden.
    clearTimeout(firstT);
    firstT = setTimeout(() => { if (!joined && !isLocked()) refresh(); }, 3000);
  }
  $("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!sb) return;
    const pw = $("loginPw").value;
    if (!pw) { $("loginErr").textContent = "Bitte das Passwort eingeben."; return; }
    $("loginBtn").disabled = true; $("loginErr").textContent = "";
    let error = null, data = null;
    try { ({ data, error } = await sb.auth.signInWithPassword({ email: CFG.email, password: pw })); } catch (e) { error = e; }
    finally { $("loginBtn").disabled = false; }
    if (!error && !teamUser(data?.session)) { lockOut("Anmelden hat nicht geklappt."); return; }
    if (error) {
      const msg = error.status === 429 ? "Zu viele Versuche. Bitte ein paar Minuten warten."
        : /invalid/i.test(error.message || "") ? "Das Passwort stimmt nicht."
        : "Anmelden hat nicht geklappt. Prüfe die Internetverbindung.";
      $("loginErr").textContent = msg; $("loginPw").value = ""; $("loginPw").focus(); return;
    }
    $("loginPw").value = "";
    loginStamp.set(Date.now());
    enter();
  });
  // Abmelden betrifft nur dieses Gerät, die anderen bleiben angemeldet.
  $("logoutBtn").addEventListener("click", () => lockOut());

  (async () => {
    if (!sb) {
      setStatus("readonly", "Offline");
      $("loginErr").textContent = "Der Kalender konnte nicht geladen werden. Prüfe die Internetverbindung und lade die Seite neu.";
      $("loginBtn").disabled = true;
      return;
    }
    // Rückruf bleibt synchron: ein await auf sb.auth hier würde die Anmeldung blockieren.
    sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT" && !document.body.classList.contains("locked")) showLogin("Bitte erneut anmelden."); });
    const { data } = await sb.auth.getSession();
    const stamp = loginStamp.get();
    if (data.session && !teamUser(data.session)) lockOut();
    else if (data.session && stamp && Date.now() - stamp < MAX_SESSION_MS) enter();
    else if (data.session) lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden.");
    else showLogin();
  })();
})();
