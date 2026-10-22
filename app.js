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
    pdfBusy: false,
    me: null,   // { name, admin, team } aus der Datenbank
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
    $("pdfBtn").disabled = !state.canWrite || state.pdfBusy;
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
    $("f-person").value = e ? (e.person || "") : ((state.me && state.me.name) || store.get("kal.name") || "");
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
  // Der Zusatz steht auf dem Handy nicht da, damit Name und Abmelden neben die Marke passen
  function setStatus(s, text, more) { $("status").dataset.state = s; $("statusText").replaceChildren(text, ...(more ? [el("span", { class: "wide" }, " · " + more)] : [])); }

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
    setStatus("live", "Live", "für alle sichtbar"); $("banner").hidden = true;
    afterChange();
    // Ein entzogener Zugang liefert keine Fehler, sondern nur noch leere Monate. Daher regelmäßig nachfragen.
    if (Date.now() - meAt > 60 * 1000) checkMe();
  }
  // Beim Blättern kurz warten, damit schnelles Klicken nicht jeden Monat einzeln lädt.
  rangeHook = () => {
    if (!sb || isLocked()) return;
    const r = visibleRange(), k = r.from + r.to;
    if (k === lastRangeKey) return;
    lastRangeKey = k; clearTimeout(navT); navT = setTimeout(refresh, 200);
  };
  addEventListener("online", () => { if (sb && !isLocked()) refresh(); });

  // ---------- PDF ----------
  // Alle Termine ab dem Ersten des laufenden Monats als PDF, damit man sie auch ohne Internet nachsehen kann.
  // Ist oben eine Person gewählt, nur deren Termine. Geladen wird einmal beim Klick, nicht laufend.
  const PDF_COLOR = { baustelle: "#df4505", kunde: "#1f56c2", buero: "#8a8a94", abwesend: "#7fa23a" };
  async function exportPdf() {
    if (!sb || isLocked() || !window.KalPDF) return;
    state.pdfBusy = true; $("pdfBtn").disabled = true;
    try {
      // Erst prüfen, ob der Zugang noch besteht; sonst entstünde ein leeres PDF, das wie ein leerer Kalender aussieht.
      if (await checkMe() === "weg") return;
      const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1), got = new Map();
      // Seitenweise nach (Datum, id) weiterlesen: so fehlt kein Termin und keiner kommt doppelt, auch wenn gerade jemand ändert.
      for (let last = null; ;) {
        let q = sb.from(T).select(COLS).gte("date", ymd(first)).order("date").order("id").limit(PAGE);
        if (last) q = q.or(`date.gt.${last.date},and(date.eq.${last.date},id.gt.${last.id})`);
        const { data, error } = await q;
        if (error) throw error;
        for (const r of data) got.set(r.id, r);
        if (data.length < PAGE) break;
        last = data[data.length - 1];
      }
      if (isLocked()) return;
      const rows = [...got.values()];
      const who = state.person, whoName = who ? ($("personFilter").selectedOptions[0] || {}).textContent || who : "";
      const byDay = new Map();
      for (const r of rows) {
        const e = fromRow(r);
        if (who && e.person.trim().toLowerCase() !== who) continue;
        if (!byDay.has(e.date)) byDay.set(e.date, []);
        byDay.get(e.date).push(e);
      }
      const order = (a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || (toMin(a.start) ?? 0) - (toMin(b.start) ?? 0) || String(a.title).localeCompare(String(b.title));
      let count = 0;
      const days = [...byDay.keys()].sort().map((ds) => {
        const d = parse(ds), hol = holidayOf(d), list = byDay.get(ds).sort(order);
        count += list.length;
        return { heading: `${longDate(d)} ${d.getFullYear()} · KW ${isoWeek(d)}${hol ? " · " + hol : ""}`,
          rows: list.map((e) => ({ time: timeLabel(e), title: e.title, meta: `${catLabel(e.cat)} · eingetragen von ${e.person || "–"}`,
            note: e.note, color: Object.hasOwn(PDF_COLOR, e.cat) ? PDF_COLOR[e.cat] : PDF_COLOR.buero })) };
      });
      const stand = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())} Uhr`;
      const bytes = window.KalPDF.build({
        title: "PentaWerk Teamkalender",
        sub: [`Termine ab 1. ${MONTHS[first.getMonth()]} ${first.getFullYear()} · ${count} ${count === 1 ? "Termin" : "Termine"}${whoName ? " · nur " + whoName : ""}`, `Stand: ${stand}. Spätere Änderungen fehlen in dieser Datei.`],
        warn: "Vertraulich: enthält Kundendaten. Nur für das Team, nicht weitergeben. Nach Gebrauch löschen.",
        footer: `PentaWerk Teamkalender · Stand ${stand} · vertraulich`,
        empty: whoName ? `Keine Termine von ${whoName} ab diesem Monat.` : "Ab diesem Monat sind keine Termine eingetragen.",
        days,
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = el("a", { href: url, download: `Teamkalender_Stand_${ymd(now)}_${pad(now.getHours())}${pad(now.getMinutes())}.pdf` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast(count ? "PDF wird gespeichert" : whoName ? `PDF gespeichert, ${whoName} hat ab diesem Monat keine Termine` : "PDF gespeichert, ab diesem Monat ist nichts eingetragen");
    } catch (err) {
      if (loggedOut(err)) lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden.");
      else toast("PDF ging nicht. Prüfe die Internetverbindung und versuche es erneut.");
    } finally { state.pdfBusy = false; $("pdfBtn").disabled = !state.canWrite; }
  }
  $("pdfBtn").addEventListener("click", exportPdf);
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
    if ($("teamDlg").open) $("teamDlg").close();
    state.events = new Map(); state.ranges = []; state.canWrite = false; state.person = ""; state.me = null;
    showMe();
    render();
  }
  function showLogin(msg) {
    document.body.classList.add("locked");
    clearData();
    showSetup(false);
    $("loginErr").textContent = msg || "";
    $("loginPw").value = "";
    loadNames();
    setTimeout(() => ($("loginName").value ? $("loginPw") : $("loginName")).focus(), 50);
  }
  async function lockOut(msg) {
    loginStamp.set(0);
    showLogin(msg);
    let failed = true;
    try { failed = !!(await sb.auth.signOut({ scope: "local" })).error; } catch {}
    if (failed) try { localStorage.removeItem(sb.auth.storageKey); } catch {}
  }
  // Nur Kalender-Konten: der Team-Zugang und die persönlichen Zugänge (Adressen ohne Postfach unter kalender.wattcon-installation.de)
  const kalUser = (s) => { const m = (s?.user?.email || "").toLowerCase(); return m === String(CFG.email).toLowerCase() || /^p-[0-9a-f]{12}@kalender\.wattcon-installation\.de$/.test(m); };
  async function enter() {
    document.body.classList.remove("locked");
    showMe();
    startLive();
    // Die erste Ladung kommt mit dem Verbinden der Live-Verbindung; hängt diese, nach 3 s direkt laden.
    clearTimeout(firstT);
    firstT = setTimeout(() => { if (!joined && !isLocked()) refresh(); }, 3000);
  }

  // ---------- Wer bin ich ----------
  function showMe() {
    const me = state.me;
    $("me").textContent = !me || isLocked() ? "" : me.team ? "Team-Zugang" : (me.name || "");
    $("teamBtn").hidden = !me || !me.admin || isLocked();
  }
  // Fragt die Datenbank, ob dieses Konto (noch) Zugang hat und wie die Person heißt. Ohne Verbindung bleibt alles, wie es ist.
  // Antwort: "ok", "weg" (abgemeldet) oder "offen" (keine Antwort).
  let meAt = 0, meSeq = 0, myEmail = "";
  async function checkMe() {
    const seq = ++meSeq;
    let r;
    try { r = await sb.rpc("kalender_ich"); } catch { return "offen"; }
    if (isLocked()) return "weg";
    if (seq !== meSeq) return "offen";
    if (r.error) { if (loggedOut(r.error)) { lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden."); return "weg"; } return "offen"; }
    if (!r.data) { accessGone(); return "weg"; }
    meAt = Date.now(); state.me = r.data; showMe();
    return "ok";
  }
  // Zugang entzogen (gesperrt, neuer Code, Team-Passwort abgeschaltet) oder neues Passwort auf einem anderen Gerät festgelegt
  function accessGone() {
    lockOut(myEmail === String(CFG.email).toLowerCase() ? "Das gemeinsame Team-Passwort wurde abgeschaltet. Bitte mit deinem Namen anmelden."
      : state.me ? "Dein Zugang wurde geändert oder beendet. Bitte neu anmelden oder bei der Verwaltung melden."
      : "Dieses Konto hat keinen Zugang zum Kalender.");
  }

  // ---------- Anmeldung mit Namen ----------
  // Jede Person meldet sich mit ihrem Namen und eigenem Passwort an. Das erste Passwort legt sie mit einem Einmal-Code fest,
  // den die Verwaltung im Kalender erzeugt (Server-Funktion kalender-zugang). Bis alle umgestellt sind, gibt es den Team-Zugang.
  const FN = CFG.url ? CFG.url + "/functions/v1/kalender-zugang" : "";
  let names = [], namesT = null, namesSeq = 0;
  async function loadNames() {
    clearTimeout(namesT);
    if (!sb) return;
    const seq = ++namesSeq;
    let r;
    try { r = await sb.rpc("kalender_namen"); } catch (e) { r = { error: e }; }
    if (seq !== namesSeq || !isLocked()) return;
    if (r.error || !Array.isArray(r.data)) {
      if (!names.length) fillNames([], false);
      $("loginErr").textContent = "Die Namensliste konnte nicht geladen werden. Prüfe die Internetverbindung.";
      namesT = setTimeout(loadNames, 15000);
      return;
    }
    if (/Namensliste/.test($("loginErr").textContent)) $("loginErr").textContent = "";
    names = r.data;
    fillNames(names, true);
  }
  const optVal = (n) => n.team ? "team" : n.id;
  // Zur Auswahl stehen nur Personen mit eigenem Passwort und, solange es ihn gibt, der Team-Zugang
  function fillNames(list, ok) {
    const sel = $("loginName"), keep = sel.value || store.get("kal.loginName") || "";
    sel.replaceChildren(...(list.length ? [el("option", { value: "" }, "Name wählen …"), ...list.map(n => el("option", { value: optVal(n) }, n.name))]
      : [el("option", { value: "" }, ok ? "Noch niemand eingerichtet" : "Keine Namen geladen")]));
    if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
    else if (list.length === 1) sel.value = optVal(list[0]);
    syncUser();
  }
  // Für Passwort-Manager: der gewählte Name gilt als Benutzername
  function syncUser() {
    const o = $("loginName").selectedOptions[0];
    $("loginUser").value = o && o.value ? o.textContent : "";
  }
  $("loginName").addEventListener("change", () => { syncUser(); $("loginErr").textContent = ""; });
  addEventListener("online", () => { if (isLocked()) loadNames(); });

  function showSetup(on) {
    $("loginForm").hidden = on; $("setupForm").hidden = !on;
    $("setupErr").textContent = ""; $("loginErr").textContent = "";
    ["setupCode", "setupPw", "setupPw2"].forEach(id => { $(id).value = ""; });
    if (on) setTimeout(() => $("setupCode").focus(), 30);
  }
  $("setupLink").addEventListener("click", () => showSetup(true));
  $("backLink").addEventListener("click", () => { showSetup(false); loadNames(); $("loginPw").focus(); });

  // Anmelden mit Adresse und Passwort, danach prüfen, ob das Konto in den Kalender darf
  async function signIn(email, pw) {
    let error = null, data = null;
    try { ({ data, error } = await sb.auth.signInWithPassword({ email, password: pw })); } catch (e) { error = e; }
    if (error) return error;
    if (!kalUser(data?.session)) { lockOut("Anmelden hat nicht geklappt."); return null; }
    myEmail = data.session.user.email.toLowerCase();
    let me;
    try { me = await sb.rpc("kalender_ich"); } catch (e) { me = { error: e }; }
    if (!me.error && !me.data) { lockOut("Dieses Konto hat keinen Zugang zum Kalender."); return null; }
    state.me = me.error ? null : me.data;
    meAt = me.error ? 0 : Date.now();
    loginStamp.set(Date.now());
    enter();
    return null;
  }
  $("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!sb) return;
    const sel = $("loginName").value, pw = $("loginPw").value;
    const who = names.find(n => optVal(n) === sel);
    if (!who) { $("loginErr").textContent = "Bitte deinen Namen wählen."; $("loginName").focus(); return; }
    if (!pw) { $("loginErr").textContent = "Bitte das Passwort eingeben."; $("loginPw").focus(); return; }
    $("loginBtn").disabled = true; $("loginErr").textContent = "";
    let error;
    try { error = await signIn(who.email, pw); } finally { $("loginBtn").disabled = false; }
    if (error) {
      const msg = error.status === 429 ? "Zu viele Versuche. Bitte ein paar Minuten warten."
        : error.code === "user_banned" ? "Dieser Zugang ist gesperrt. Bitte bei der Verwaltung einen neuen Code holen."
        : /invalid/i.test(error.message || "") ? "Das Passwort stimmt nicht."
        : "Anmelden hat nicht geklappt. Prüfe die Internetverbindung.";
      $("loginErr").textContent = msg; $("loginPw").value = ""; $("loginPw").focus(); return;
    }
    store.set("kal.loginName", sel);
    $("loginPw").value = "";
  });

  // Erstes oder neues Passwort mit Einmal-Code festlegen. Wem der Code gehört, weiß nur der Server.
  const SETUP_MSG = {
    falsch: "Der Code stimmt nicht. Bitte genau abtippen, etwa K7MP-2QXA.",
    abgelaufen: "Der Code ist abgelaufen. Bitte bei der Verwaltung einen neuen holen.",
    kein_code: "Der Code gilt nicht mehr. Bitte bei der Verwaltung einen neuen holen.",
    zu_viele: "Gerade wurden zu viele falsche Codes eingegeben. Bitte in einer Stunde erneut versuchen.",
    passwort_kurz: "Das Passwort braucht mindestens 10 Zeichen.",
    passwort_lang: "Das Passwort ist zu lang. Bitte ein kürzeres wählen.",
    passwort_schwach: "Dieses Passwort ist zu leicht zu erraten. Bitte ein anderes wählen.",
    passwort_wie_team: "Bitte nicht das bisherige Team-Passwort nehmen, sondern ein eigenes.",
    eingabe: "Bitte den 8-stelligen Code prüfen.",
  };
  $("setupForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!sb || !FN) return;
    const code = $("setupCode").value.toUpperCase().replace(/[^0-9A-Z]/g, "");
    const pw = $("setupPw").value, pw2 = $("setupPw2").value;
    const err = code.length !== 8 ? "Der Code hat 8 Zeichen, etwa K7MP-2QXA."
      : pw.length < 10 ? SETUP_MSG.passwort_kurz : pw !== pw2 ? "Die beiden Passwörter sind nicht gleich." : "";
    if (err) { $("setupErr").textContent = err; return; }
    $("setupBtn").disabled = true; $("setupErr").textContent = "";
    let res = null, out = null;
    try {
      res = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.key },
        body: JSON.stringify({ aktion: "einrichten", code, passwort: pw }) });
      out = await res.json().catch(() => null);
    } catch {}
    if (!res || !res.ok || !out || !out.ok || !out.email) {
      $("setupBtn").disabled = false;
      $("setupErr").textContent = !res ? "Keine Verbindung. Prüfe das Internet und versuche es erneut."
        : SETUP_MSG[out && out.fehler] || "Das hat nicht geklappt. Bitte später erneut versuchen.";
      if (out && /^passwort/.test(out.fehler)) { $("setupPw").value = $("setupPw2").value = ""; $("setupPw").focus(); }
      else if (out && /^(falsch|abgelaufen|kein_code|eingabe)$/.test(out.fehler)) $("setupCode").select();
      return;
    }
    // Passwort steht: gleich damit anmelden
    if (out.id) store.set("kal.loginName", String(out.id));
    let error;
    try { error = await signIn(out.email, pw); } finally { $("setupBtn").disabled = false; }
    ["setupCode", "setupPw", "setupPw2"].forEach(x => { $(x).value = ""; });
    if (error) { showSetup(false); loadNames(); $("loginErr").textContent = "Dein Passwort ist gespeichert. Bitte jetzt damit anmelden."; return; }
    toast("Dein Passwort ist gespeichert");
  });

  // Abmelden betrifft nur dieses Gerät, die anderen bleiben angemeldet.
  $("logoutBtn").addEventListener("click", () => lockOut());

  // ---------- Team und Zugänge (nur Verwaltung) ----------
  const teamDlg = $("teamDlg");
  async function teamCall(body) {
    let s;
    try { s = await sb.auth.getSession(); } catch { throw { status: 0 }; }
    // Erneuern ohne Netz schlägt fehl, ist aber kein Abmelden
    if (s.error) throw { status: 0 };
    const tok = s.data && s.data.session && s.data.session.access_token;
    if (!tok) throw { status: 401 };
    let res;
    try {
      res = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.key, Authorization: "Bearer " + tok }, body: JSON.stringify(body) });
    } catch { throw { status: 0 }; }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, fehler: out && out.fehler };
    return out;
  }
  const TEAM_MSG = {
    keine_rechte: "Du darfst das Team nicht verwalten.",
    selbst: "Das geht nicht für deinen eigenen Zugang.",
    team_nicht: "Personen mit eigenem Passwort verwaltet nur eine Person mit Verwalter-Recht, nicht der Team-Zugang.",
    name: "Bitte einen Namen mit höchstens 40 Zeichen eingeben, der nicht mit „Team“ beginnt.",
    name_vergeben: "Diesen Namen gibt es schon.",
    kein_verwalter: "Erst muss eine Person mit eigenem Passwort das Team verwalten dürfen.",
    unbekannt: "Diese Person gibt es nicht mehr.",
    server: "Der Server ist gerade gestört. Bitte gleich noch einmal versuchen.",
  };
  function teamFail(e) {
    if (e && e.status === 401) { lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden."); return; }
    $("teamErr").textContent = TEAM_MSG[e && e.fehler] || "Das hat nicht geklappt. Prüfe die Verbindung und versuche es erneut.";
    if (e && e.fehler === "keine_rechte") checkMe();
  }
  const fmtWhen = (iso) => { const t = new Date(tsOf(iso)); return isNaN(t) ? "" : `${pad(t.getDate())}.${pad(t.getMonth() + 1)}.${t.getFullYear()}, ${pad(t.getHours())}:${pad(t.getMinutes())} Uhr`; };
  // Zweistufig wie beim Löschen: erst „Wirklich?“, dann ausführen
  function disarm(btn) {
    if (!btn.classList.contains("armed")) return;
    clearTimeout(btn._t); btn.classList.remove("armed"); btn.textContent = btn._was;
  }
  function confirmClick(btn, label, fn) {
    if (!btn.classList.contains("armed")) {
      btn._was = btn.textContent;
      btn.classList.add("armed"); btn.textContent = label;
      btn._t = setTimeout(() => disarm(btn), 4000);
      return;
    }
    disarm(btn); fn();
  }
  // teamGen zählt das Öffnen und Schließen mit: Antworten für ein schon geschlossenes Fenster werden verworfen
  let teamBusy = false, teamGen = 0, offOk = false;
  function hideCode() { $("codeVal").textContent = ""; $("codeFor").textContent = ""; $("codeUntil").textContent = ""; $("codeBox").hidden = true; }
  async function teamAct(body, done) {
    if (teamBusy) return;
    const gen = teamGen;
    teamBusy = true; $("teamErr").textContent = ""; hideCode();
    teamDlg.querySelectorAll("button").forEach(b => { if (b.id !== "teamClose") b.disabled = true; });
    try {
      const r = await teamCall(body);
      if (gen !== teamGen || !teamDlg.open || isLocked()) return;
      if (done) done(r);
      await loadTeam();
    }
    catch (e) { if (gen === teamGen) teamFail(e); }
    finally {
      teamBusy = false;
      teamDlg.querySelectorAll("button").forEach(b => { b.disabled = false; });
      $("teamOffBtn").disabled = !offOk;
    }
  }
  function showCode(name, code, bis) {
    $("codeFor").textContent = `Einmal-Code für ${name}`;
    $("codeVal").textContent = code.slice(0, 4) + "-" + code.slice(4);
    $("codeUntil").textContent = `Gültig bis ${fmtWhen(bis)}, nur einmal. Persönlich weitergeben.`;
    $("codeBox").hidden = false;
  }
  const STATUS = {
    aktiv: () => "Eigenes Passwort aktiv",
    code: (p) => `Code offen bis ${fmtWhen(p.code_bis)}`,
    abgelaufen: (p) => `Code abgelaufen am ${fmtWhen(p.code_bis)}`,
    gesperrt: () => "Gesperrt",
  };
  async function loadTeam() {
    const gen = teamGen;
    let d;
    try { d = await teamCall({ aktion: "liste" }); } catch (e) { if (gen === teamGen) teamFail(e); return; }
    if (gen !== teamGen || !teamDlg.open || isLocked()) return;
    const ich = d.ich;
    $("people").replaceChildren(...(d.personen.length ? d.personen.map(p => {
      const self = !!ich && p.email === ich, st = (STATUS[p.status] || STATUS.gesperrt)(p);
      // Der Team-Zugang richtet nur ein: Personen mit eigenem Passwort ändert nur, wer selbst verwalten darf
      const locked = d.team && p.eingerichtet;
      return el("li", null,
        el("span", { class: "pn" }, p.name + (p.admin ? " · verwaltet" : "") + (self ? " (du)" : "")),
        el("span", { class: "ps", "data-s": p.status }, st),
        self ? null : locked ? el("span", { class: "pa note" }, "Ändern nur mit eigenem Verwalter-Zugang") : el("span", { class: "pa" },
          el("button", { class: "btn", type: "button", onclick: (ev) => {
            const go = () => teamAct({ aktion: "neuer_code", person: p.id }, (r) => showCode(p.name, r.code, r.bis));
            if (p.status === "aktiv") confirmClick(ev.currentTarget, "Altes Passwort sperren?", go); else go();
          } }, "Neuer Code"),
          p.status === "gesperrt" ? null : el("button", { class: "btn", type: "button",
            onclick: (ev) => confirmClick(ev.currentTarget, "Wirklich sperren?", () => teamAct({ aktion: "sperren", person: p.id }, () => toast(`${p.name} ist gesperrt`))) }, "Sperren"),
          el("button", { class: "btn", type: "button", onclick: () => teamAct({ aktion: "admin_setzen", person: p.id, admin: !p.admin }) }, p.admin ? "Verwalten aus" : "Verwalten an"),
          el("button", { class: "btn danger", type: "button",
            onclick: (ev) => confirmClick(ev.currentTarget, "Wirklich entfernen?", () => teamAct({ aktion: "entfernen", person: p.id }, () => toast(`${p.name} ist entfernt, die Termine bleiben`))) }, "Entfernen")));
    }) : [el("li", { class: "empty" }, "Noch niemand angelegt. Lege zuerst dich selbst an und erlaube dir das Verwalten.")]));
    $("adminTip").hidden = d.verwalter !== 1;
    offOk = !!ich && !!d.team_aktiv;
    $("teamOff").hidden = !d.team_aktiv;
    $("teamOffBtn").disabled = !offOk;
    $("teamOffHint").textContent = ich ? "Das gemeinsame Team-Passwort funktioniert noch. Wenn alle ihr eigenes haben, schalte es ab. Wer es kennt, kommt danach nicht mehr hinein."
      : "Das gemeinsame Team-Passwort funktioniert noch. Abschalten kann es nur, wer mit dem eigenen Namen angemeldet ist und verwalten darf.";
  }
  $("teamBtn").addEventListener("click", () => {
    $("teamErr").textContent = ""; hideCode(); $("people").replaceChildren(); $("teamOff").hidden = true; $("adminTip").hidden = true;
    disarm($("teamOffBtn")); offOk = false; $("teamOffBtn").disabled = true;
    teamDlg.showModal(); loadTeam();
  });
  $("teamClose").addEventListener("click", () => teamDlg.close());
  // Codes und Namen nur so lange auf dem Bildschirm, wie das Fenster offen ist
  teamDlg.addEventListener("close", () => {
    teamGen++; hideCode(); $("people").replaceChildren(); $("addForm").reset(); disarm($("teamOffBtn"));
  });
  $("addForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = $("addName").value.replace(/\s+/g, " ").trim(), admin = $("addAdmin").checked;
    if (!name) { $("teamErr").textContent = "Bitte einen Namen eingeben."; $("addName").focus(); return; }
    teamAct({ aktion: "anlegen", name, admin }, (r) => { showCode(name, r.code, r.bis); $("addForm").reset(); });
  });
  $("teamOffBtn").addEventListener("click", (ev) => confirmClick(ev.currentTarget, "Wirklich abschalten?",
    () => teamAct({ aktion: "team_aus" }, () => toast("Das Team-Passwort ist abgeschaltet"))));

  (async () => {
    if (!sb) {
      setStatus("readonly", "Offline");
      $("loginErr").textContent = "Der Kalender konnte nicht geladen werden. Prüfe die Internetverbindung und lade die Seite neu.";
      $("loginBtn").disabled = true; $("setupLink").hidden = true;
      return;
    }
    // Rückruf bleibt synchron: ein await auf sb.auth hier würde die Anmeldung blockieren.
    sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT" && !document.body.classList.contains("locked")) showLogin("Bitte erneut anmelden."); });
    const { data } = await sb.auth.getSession();
    const stamp = loginStamp.get();
    if (data.session && !kalUser(data.session)) lockOut();
    else if (data.session && stamp && Date.now() - stamp < MAX_SESSION_MS) { myEmail = data.session.user.email.toLowerCase(); enter(); checkMe(); }
    else if (data.session) lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden.");
    else showLogin();
  })();
})();
