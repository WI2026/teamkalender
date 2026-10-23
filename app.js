(() => {
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }
  if (!document.getElementById("projView")) {
    try { if (!sessionStorage.getItem("kal.neu")) { sessionStorage.setItem("kal.neu", "1"); location.replace(location.pathname + "?neu=" + Date.now()); } } catch {}
    return;
  }
  if (/[?&]neu=/.test(location.search)) { try { history.replaceState(null, "", location.pathname); sessionStorage.removeItem("kal.neu"); } catch {} }
  const CATS = [
    { id: "baustelle", label: "Baustelle" },
    { id: "kunde", label: "Kundentermin" },
    { id: "buero", label: "Büro / Intern" },
    { id: "abwesend", label: "Urlaub / Abwesend" },
  ];
  const catColor = (id) => `var(--cat-${CATS.some(c => c.id === id) ? id : "buero"})`;
  const catLabel = (id) => (CATS.find(c => c.id === id) || CATS[2]).label;
  // Projekte: nur Aufträge mit Unterschrift. Die Schritte kommen aus einer Vorlage je Art und lassen sich ergänzen oder streichen.
  const ARTEN = [
    { id: "pv", label: "PV-Anlage" },
    { id: "speicher", label: "Speicher" },
    { id: "wallbox", label: "Wallbox" },
    { id: "waermepumpe", label: "Wärmepumpe" },
    { id: "zaehlerschrank", label: "Zählerschrank" },
    { id: "elektro", label: "Elektroinstallation" },
    { id: "sonstiges", label: "Sonstiges" },
  ];
  const artLabel = (id) => (ARTEN.find(a => a.id === id) || ARTEN[ARTEN.length - 1]).label;
  // Vorlagen je Art. Beim Anlegen lassen sich einzelne Schritte abwählen; mit „opt“ markierte sind zunächst abgewählt.
  // Danach lassen sich Schritte ergänzen (kommen vor die Schlussrechnung) oder streichen.
  const SCHLUSS = ["Schlussrechnung gestellt", "Bezahlt"];
  const wahl = (t) => ({ t, opt: true });
  const vorlage = (...l) => [...l, ...SCHLUSS].map(x => typeof x === "string" ? { t: x } : x);
  const VORLAGEN = {
    pv: vorlage("Anmeldung beim Netzbetreiber gestellt", "Einspeisezusage erhalten", "Anzahlung erhalten", "Material bestellt", "Material geliefert",
      "Zählerschrank geprüft oder ertüchtigt", "Gerüst gestellt", "Module montiert (DC)", "Wechselrichter und AC-Anschluss", wahl("Speicher montiert und angeschlossen"),
      wahl("Wallbox montiert und angeschlossen"), "Steuerbarkeit nach § 9 EEG eingerichtet", "Inbetriebnahme mit Protokoll", "MaStR-Nummer vom Kunden erhalten",
      "Fertigmeldung an Netzbetreiber", "Zähler gewechselt", "Gerüst abgebaut", "Übergabe und Unterlagen an Kunden"),
    speicher: vorlage("Anmeldung beim Netzbetreiber gestellt", "Zusage des Netzbetreibers erhalten", "Anzahlung erhalten", "Material bestellt", "Material geliefert",
      "Speicher montiert und angeschlossen", "Inbetriebnahme mit Protokoll", "MaStR-Eintrag vom Kunden ergänzt", "Fertigmeldung an Netzbetreiber", "Übergabe und Einweisung"),
    wallbox: vorlage("Anmeldung beim Netzbetreiber gestellt (§ 14a)", wahl("Genehmigung des Netzbetreibers erhalten (über 11 kW)"), "Anzahlung erhalten", "Material bestellt",
      "Material geliefert", "Leitung verlegt und Wallbox montiert", "§ 14a-Steuerung angeschlossen", "Netzentgelt-Modul mit Kunden geklärt", "Inbetriebnahme mit Prüfprotokoll",
      "Fertigmeldung an Netzbetreiber", "Übergabe und Einweisung"),
    waermepumpe: vorlage("Anmeldung beim Netzbetreiber gestellt (§ 14a)", "Zusage des Netzbetreibers erhalten", wahl("Förderantrag gestellt"), "Anzahlung erhalten", "Material bestellt",
      "Material geliefert", "Zählerschrank vorbereitet", wahl("Wärmepumpen-Zähler gesetzt"), "Fundament und Aufstellung", "Hydraulik angeschlossen",
      "Elektroanschluss und § 14a-Steuerung", "Inbetriebnahme mit Protokoll", "Hydraulischer Abgleich", "Fertigmeldung an Netzbetreiber", "Übergabe und Einweisung"),
    zaehlerschrank: vorlage("Anmeldung beim Netzbetreiber gestellt", "Anzahlung erhalten", "Material bestellt", "Material geliefert", "Abschalttermin mit Netzbetreiber vereinbart",
      "Zählerschrank gesetzt und angeschlossen", "Prüfprotokoll erstellt", "Fertigmeldung an Netzbetreiber", "Zähler gesetzt"),
    elektro: vorlage("Aufmaß und Planung", wahl("Anzahlung erhalten"), "Material bestellt", "Material geliefert", "Rohinstallation", "Feininstallation",
      "Prüfung und Messprotokoll", "Übergabe an Kunden"),
    sonstiges: vorlage("Material bestellt", "Ausführung", "Abnahme mit Kunden"),
  };
  const STAND = { laufend: "Laufend", pausiert: "Pausiert", abgeschlossen: "Fertig", storniert: "Storniert" };
  const STAND_FARBE = { laufend: "var(--cat-abwesend)", pausiert: "var(--holiday)", abgeschlossen: "var(--accent-ink)", storniert: "var(--fg-3)" };
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
  const sitzung = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} } };
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
    tab: sitzung.get("kal.tab") === "projekte" ? "projekte" : "kalender",
    projekte: new Map(),     // alle Projekte (nur Kopfdaten)
    schritte: new Map(),     // Schritte der geladenen Projekte, nach Schritt-Kennung
    schritteVon: new Set(),  // Projekte, deren Schritte geladen sind
    projLoaded: false,
    projErr: false,          // Laden der Projekte fehlgeschlagen (Übersicht zeigt „Erneut versuchen“)
    naechste: new Map(),     // Projekt → nächster Termin ab heute
    pfilter: { status: "laufend", q: "" },
  };
  // Schritte, die gerade geladen werden, und solche, die nach einem Fehler später erneut geladen werden
  const stepLaedt = new Set(), stepWarten = new Set();
  // Zählt Abmeldungen: späte Antworten einer beendeten Anmeldung zeigen nichts mehr an
  let sitzGen = 0;
  const gleicheSitzung = (g) => g === sitzGen && !document.body.classList.contains("locked");
  let fertigMax = 100;  // so viele fertige Projekte zeigt die Liste (in Hunderterschritten mehr)
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
  // Wie replaceChildren, aber ohne leere Teile (replaceChildren schriebe null als Text „null“ hin)
  const fill = (n, ...kids) => n.replaceChildren(...kids.flat().filter(c => c != null && c !== false));
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

  // ---------- Projekte: Hilfen ----------
  // Schritte je Projekt, sortiert; wird bei jeder Änderung neu aufgebaut
  let stepIdx = null;
  function stepsOf(pid) {
    if (!stepIdx) {
      stepIdx = new Map();
      for (const st of state.schritte.values()) { if (!stepIdx.has(st.projekt_id)) stepIdx.set(st.projekt_id, []); stepIdx.get(st.projekt_id).push(st); }
      for (const l of stepIdx.values()) l.sort((a, b) => Number(a.pos) - Number(b.pos) || String(a.id).localeCompare(String(b.id)));
    }
    return stepIdx.get(pid) || [];
  }
  const TAG_MS = 24 * 60 * 60 * 1000;
  function fortschritt(pid) {
    const list = stepsOf(pid), done = list.filter(x => x.erledigt).length;
    const i = list.findIndex(x => !x.erledigt), next = i < 0 ? null : list[i];
    // Wie lange der nächste Schritt schon ansteht: seit dem zuletzt erledigten Schritt davor, sonst seit der Unterschrift
    let seit = null;
    if (next) {
      const vor = list.slice(0, i).reverse().find(x => x.erledigt && x.erledigt_am);
      const p = state.projekte.get(pid);
      const ab = vor ? tsOf(vor.erledigt_am) : p ? parse(p.unterschrieben_am).getTime() : NaN;
      if (!isNaN(ab)) seit = Math.floor((Date.now() - ab) / TAG_MS);
    }
    return { list, done, total: list.length, pct: list.length ? Math.round(done / list.length * 100) : 0, next, seit, loaded: state.schritteVon.has(pid) && !stepLaedt.has(pid) };
  }
  const offen = (p) => p.status === "laufend" || p.status === "pausiert";
  const svg = (d, w) => { const n = document.createElementNS("http://www.w3.org/2000/svg", "svg"); n.setAttribute("viewBox", "0 0 16 16"); n.setAttribute("fill", "none"); n.setAttribute("stroke", "currentColor"); n.setAttribute("stroke-width", w || "1.8"); n.setAttribute("stroke-linecap", "round"); n.setAttribute("stroke-linejoin", "round"); n.setAttribute("aria-hidden", "true"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); n.append(p); return n; };
  const svgNext = () => svg("m6 3.5 4.5 4.5L6 12.5");
  const svgX = () => svg("M4.5 4.5l7 7M11.5 4.5l-7 7");
  const svgCheck = () => svg("m3.5 8.4 2.9 2.9 6.1-6.6", "2.2");
  const svgEdit = () => svg("M10.6 3.4a1.5 1.5 0 0 1 2.1 2.1L6 12.2l-2.9.7.7-2.9z");
  // Projekt: Liste mit Häkchen
  const svgProj = () => svg("M3 4.5h1.5M3 8h1.5M3 11.5h1.5M7 4.5h6M7 8h6M7 11.5h4");
  // Fortschrittsbalken; die Breite läuft über transform, damit Änderungen weich und ohne Neuberechnung des Layouts gleiten
  const pbar = (f, cls) => el("span", { class: "pbar" + (cls ? " " + cls : ""), role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(f.total || 0),
    "aria-valuenow": String(f.done || 0), "aria-valuetext": f.total ? `${f.done} von ${f.total} Schritten erledigt` : "keine Schritte" },
    el("i", { style: `transform:translateX(${(f.pct || 0) - 100}%)` }));
  const fmtTag = (iso) => { const t = new Date(tsOf(iso)); return isNaN(t) ? "" : `${pad(t.getDate())}.${pad(t.getMonth() + 1)}.`; };
  const tageText = (n) => n <= 0 ? "seit heute" : n === 1 ? "seit gestern" : `seit ${n} Tagen`;
  // Projektzeile unter einem Termin: Stand und nächster Schritt, öffnet das Unterfenster. Der Name steht nur da, wenn er nicht schon der Termintitel ist.
  function projPill(p, terminTitel, tid) {
    const f = fortschritt(p.id), gleich = (terminTitel || "").trim().toLowerCase() === p.titel.trim().toLowerCase();
    const stand = !f.loaded ? "…" : f.total ? `${f.done} von ${f.total}` : "keine Schritte";
    const weiter = !f.loaded || !f.total ? null : f.next ? "Als Nächstes: " + f.next.titel : "alle erledigt";
    if (!f.loaded) wantSchritte(p.id);
    return el("button", { class: "ppill", type: "button", "data-pid": p.id, "data-tid": tid || null, "aria-label": `Projektfortschritt ${p.titel}: ${stand}${weiter ? ", " + weiter : ""}`, onclick: () => openProg(p.id) },
      svgProj(),
      el("span", { class: "pl" }, gleich ? "Projekt" : p.titel),
      el("span", { class: "pc num" }, stand),
      weiter ? el("span", { class: "pw" }, weiter) : null,
      svgNext());
  }

  // ---------- Rendering ----------
  const narrow = matchMedia("(max-width: 720px)");
  function render() {
    const proj = state.tab === "projekte";
    document.querySelectorAll(".tabs button").forEach(b => { const on = b.dataset.tab === state.tab; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    $("calView").hidden = proj; $("projView").hidden = !proj;
    $("newLbl").textContent = proj ? "Neues Projekt" : "Neuer Termin";
    $("pdfBtn").hidden = proj;
    if (proj) renderProjekte();
    else {
      document.querySelectorAll(".seg button[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
      const board = $("board");
      board.replaceChildren(state.view === "month" ? renderMonth() : (narrow.matches ? renderWeekList() : renderWeek()));
      renderAgenda();
      renderFilter();
    }
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
    const pr = e.projektId && state.projekte.get(e.projektId);
    return el("button", { class: "chip" + (e.allDay ? " allday" : ""), type: "button", style: `--c:${catColor(e.cat)}`, title: `${timeLabel(e)} · ${e.title} · ${e.person || ""}${pr ? " · Projekt " + pr.titel : ""}`,
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

  // Die Karte öffnet den Termin; hat er ein Projekt, hängt darunter eine eigene Zeile, die den Projektfortschritt öffnet
  function itemCard(e) {
    const card = el("button", { class: "item", type: "button", onclick: () => openEditor(e.id) },
      el("div", { class: "time" }, e.allDay ? el("b", null, "ganzt.") : [el("b", null, e.start), e.end]),
      el("div", { class: "body" },
        el("span", { class: "ti" }, e.title),
        el("span", { class: "meta" }, el("span", { class: "tag", style: `--c:${catColor(e.cat)}` }, catLabel(e.cat)), e.person ? el("span", null, "· " + e.person) : null),
        e.note ? el("span", { class: "note" }, e.note) : null));
    const pr = e.projektId && state.projekte.get(e.projektId);
    return pr ? el("div", { class: "itemw" }, card, projPill(pr, e.title, e.id)) : card;
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
  let editingId = null, editingStamp = null, deletingId = null, projektAtOpen = "";
  $("cats").replaceChildren(...CATS.map((c, i) => el("label", { style: `--c:${catColor(c.id)}` },
    el("input", { type: "radio", name: "cat", value: c.id, id: `cat-${c.id}`, checked: i === 0 }), c.label)));
  const syncAllDay = () => { $("timeRow").hidden = $("f-allday").checked; };
  $("f-allday").addEventListener("change", syncAllDay);
  $("f-start").addEventListener("change", () => {
    const s = toMin($("f-start").value), e = toMin($("f-end").value);
    if (s != null && (e == null || e <= s)) { const n = Math.min(s + 60, 23 * 60 + 45); $("f-end").value = `${pad(Math.floor(n / 60))}:${pad(n % 60)}`; }
  });

  function openEditor(id, dateStr, start, end, projektVor) {
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
    projektAtOpen = (e && e.projektId) || "";
    fillProjSelect(projektAtOpen || projektVor || "");
    if (!e && projektVor && state.projekte.has(projektVor)) $("f-title").value = state.projekte.get(projektVor).titel.slice(0, 120);
    $("projNewBtn").hidden = ro;
    const cat = e && CATS.some(c => c.id === e.cat) ? e.cat : "baustelle";
    $(`cat-${cat}`).checked = true;
    $("formErr").textContent = "";
    $("delBtn").hidden = !e || ro;
    disarmDelete();
    $("saveBtn").hidden = ro;
    $("cancelBtn").textContent = ro ? "Schließen" : "Abbrechen";
    dlg.querySelectorAll("input, textarea, select").forEach(n => { n.disabled = ro; });
    $("stamp").textContent = e && e.updatedAt ? `Geändert ${fmtStamp(e.updatedAt)}` : "";
    syncAllDay();
    $("f-title").autofocus = !ro && !e;
    $("cancelBtn").autofocus = ro || !!e;
    dlg.showModal();
  }
  // Zeitstempel kommen je nach Weg als "…T…+00:00" oder "… …+00"
  const tsOf = (v) => Date.parse(String(v || "").replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  const fmtStamp = (iso) => { const d = new Date(tsOf(iso)); return isNaN(d) ? "" : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // Projekt am Termin: Auswahl der laufenden Projekte, darunter der Fortschritt (öffnet das Unterfenster)
  const fehltGeholt = new Set();
  function fillProjSelect(cur) {
    const sel = $("f-projekt");
    const list = [...state.projekte.values()].filter(p => offen(p) || p.id === cur).sort((a, b) => a.titel.localeCompare(b.titel, "de"));
    fill(sel, el("option", { value: "" }, "Kein Projekt"),
      ...list.map(p => el("option", { value: p.id }, `${p.titel} · ${artLabel(p.art)}` + (p.status === "laufend" ? "" : ` (${STAND[p.status]})`))),
      // Unbekanntes Projekt (noch nicht geladen oder gerade gelöscht): Zuordnung stehen lassen, Speichern ändert sie nicht
      cur && !state.projekte.has(cur) ? el("option", { value: cur }, "Projekt wird geladen …") : null);
    // Steht ein Projekt am Termin, das hier noch fehlt: gezielt nachladen
    if (cur && !state.projekte.has(cur) && state.projLoaded && !fehltGeholt.has(cur)) { fehltGeholt.add(cur); reloadProjekt(cur); }
    sel.value = cur || "";
    syncProgRow();
  }
  function syncProgRow() {
    const id = $("f-projekt").value, p = id && state.projekte.get(id), r = $("progRow");
    r.hidden = !p;
    if (!p) { r.replaceChildren(); r.removeAttribute("aria-label"); return; }
    const f = fortschritt(p.id);
    if (!f.loaded) wantSchritte(p.id);
    r.replaceChildren(
      el("span", { class: "pl" }, "Fortschritt", el("span", { class: "num" }, f.loaded && f.total ? ` · ${f.done} von ${f.total}` : "")),
      pbar(f),
      el("span", { class: "pn" }, !f.loaded ? "wird geladen …" : f.next ? "Als Nächstes: " + f.next.titel : f.total ? "Alle Schritte erledigt" : "Noch keine Schritte"),
      svgNext());
    r.setAttribute("aria-label", `Projektfortschritt ${p.titel} öffnen`);
  }
  $("f-projekt").addEventListener("change", () => {
    const p = state.projekte.get($("f-projekt").value);
    // Neuer Termin ohne Titel: den Projektnamen vorschlagen
    if (p && !$("f-title").value.trim()) $("f-title").value = p.titel.slice(0, 120);
    syncProgRow();
  });
  $("progRow").addEventListener("click", () => { const id = $("f-projekt").value; if (state.projekte.has(id)) openProg(id); });
  $("projNewBtn").addEventListener("click", () => openProjForm(null, true));

  $("cancelBtn").addEventListener("click", () => dlg.close());
  // Kundendaten nur so lange im Formular halten, wie es offen ist.
  // Auch beim Abmelden aufgerufen, ob das Fenster offen ist oder nicht (eine späte Antwort könnte es sonst wieder gefüllt haben)
  let dlgGen = 0;
  function wipeTermin() {
    $("form").reset(); $("stamp").textContent = ""; $("formErr").textContent = ""; editingId = editingStamp = null;
    $("f-projekt").replaceChildren(el("option", { value: "" }, "Kein Projekt")); $("progRow").replaceChildren(); $("progRow").removeAttribute("aria-label"); $("progRow").hidden = true;
  }
  dlg.addEventListener("close", () => { dlgGen++; wipeTermin(); });
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });

  let delTimer = null, delAb = 0;
  function disarmDelete() { clearTimeout(delTimer); const b = $("delBtn"); b.classList.remove("armed"); b.textContent = "Löschen"; }
  $("delBtn").addEventListener("click", async () => {
    const b = $("delBtn");
    if (!b.classList.contains("armed")) {
      b.classList.add("armed"); b.textContent = "Wirklich löschen?"; delAb = performance.now();
      delTimer = setTimeout(disarmDelete, 4000); return;
    }
    if (performance.now() - delAb < 500) return;
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
    // Projekt nur mitschicken, wenn es hier geändert wurde (sonst überschriebe ein veralteter Stand die Zuordnung)
    if (!editingId || $("f-projekt").value !== projektAtOpen) body.projektId = $("f-projekt").value || null;
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
    if (code === "23503") { $("f-projekt").value = ""; syncProgRow(); return "Das gewählte Projekt gibt es nicht mehr. Bitte ein anderes wählen oder ohne Projekt speichern."; }
    if (e && e.status === 429) return "Gerade zu viele Änderungen auf einmal. Bitte kurz warten und erneut speichern.";
    return "Speichern hat nicht geklappt. Prüfe die Verbindung und versuche es erneut.";
  }
  const loggedOut = (e) => !!e && (["42501", "PGRST301", "PGRST302", "PGRST303"].includes(e.code) || e.status === 401 || e.status === 403 || /JWT/i.test(e.message || ""));

  // ---------- Toast ----------
  let toastT = null;
  function toast(msg, ms) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    zeigToast();
    clearTimeout(toastT); toastT = setTimeout(hideToast, ms || 2200);
  }
  // Ist ein Fenster offen, gehört die Meldung hinein: alles außerhalb ist dann gesperrt und für Bildschirmleser stumm
  function zeigToast() {
    const t = $("toast"), oben = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
    if (t.parentNode !== oben) oben.append(t);
    if (t.showPopover) { try { t.hidePopover(); } catch {} try { t.showPopover(); } catch {} }
  }
  // Schließt das Fenster, in dem die Meldung steht: im nächsten offenen Fenster oder auf der Seite weiter zeigen
  document.querySelectorAll("dialog").forEach(d => d.addEventListener("close", () => {
    const t = $("toast");
    if (d.contains(t)) { if (!t.hidden && t.textContent) zeigToast(); else document.body.append(t); }
  }));
  const kurz = (x, n) => x.length > n ? x.slice(0, n - 1).trimEnd() + "…" : x;
  // Der Text kann einen Projektnamen enthalten: nach dem Ausblenden nicht im Dokument stehen lassen
  function hideToast() { clearTimeout(toastT); const t = $("toast"); t.hidden = true; t.textContent = ""; if (t.hidePopover) try { t.hidePopover(); } catch {} }

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
  $("newBtn").addEventListener("click", () => state.tab === "projekte" ? openProjForm(null, false) : openEditor(null, state.selected));
  // Reiter Kalender / Projekte; Pfeiltasten wechseln wie bei Registerkarten üblich
  function setTab(t) {
    if (state.tab === t) return;
    state.tab = t; sitzung.set("kal.tab", t);
    meBald();
    render();
    if (t === "projekte") loadNaechste();
  }
  document.querySelectorAll(".tabs button").forEach(b => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
    b.addEventListener("keydown", (ev) => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const t = ev.key === "Home" ? "kalender" : ev.key === "End" ? "projekte"
        : ev.key === "ArrowLeft" || ev.key === "ArrowRight" ? (state.tab === "kalender" ? "projekte" : "kalender") : null;
      if (!t) return;
      ev.preventDefault(); setTab(t); $("tab-" + t).focus();
    });
  });
  document.querySelectorAll(".seg button[data-view]").forEach(b => b.addEventListener("click", () => {
    state.view = b.dataset.view; store.set("kal.view", state.view);
    state.cursor = parse(state.selected); render();
  }));
  $("personFilter").addEventListener("change", (e) => { state.person = e.target.value; render(); });
  narrow.addEventListener("change", () => { if (state.view === "week") render(); });
  document.addEventListener("keydown", (e) => {
    if (state.tab !== "kalender" || document.querySelector("dialog[open]") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    if (e.key === "ArrowLeft" && e.altKey) shift(-1);
    if (e.key === "ArrowRight" && e.altKey) shift(1);
  });
  setInterval(() => { if (state.tab === "kalender" && state.view === "week" && !dlg.open) render(); }, 5 * 60 * 1000);

  render();

  // ---------- Verbindung (Supabase) ----------
  const CFG = window.KALENDER_CONFIG || {};
  const sb = window.supabase && CFG.url ? window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
  const fromRow = (r) => ({ title: r.title, date: r.date, allDay: !!r.all_day, start: r.start_time || "", end: r.end_time || "",
    person: r.person || "", note: r.note || "", cat: r.cat || "buero", projektId: r.projekt_id || null, createdAt: r.created_at, updatedAt: r.updated_at });
  const toRow = (b) => Object.assign({ title: b.title, date: b.date, all_day: !!b.allDay, start_time: b.allDay ? null : b.start, end_time: b.allDay ? null : b.end,
    person: b.person, note: b.note || null, cat: b.cat }, "projektId" in b ? { projekt_id: b.projektId || null } : null);
  const check = ({ error }) => { if (error) throw error; };
  const T = "kalender_termine", COLS = "id,title,date,all_day,start_time,end_time,person,note,cat,projekt_id,updated_at";
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
    const warSchreibbar = state.canWrite;
    state.canWrite = true;
    if (!warSchreibbar && progDlg.open) renderProg();
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
  addEventListener("online", () => { if (sb && !isLocked()) { refresh(); if (state.projLoaded) projAbgleich(); } });

  // ---------- Projekte (Supabase) ----------
  // Geladen werden alle Projekte (nur Kopfdaten, wenig Daten) und die Schritte der nicht fertigen. Schritte fertiger Projekte erst bei Bedarf.
  const PT = "kalender_projekte", ST = "kalender_projekt_schritte";
  const PCOLS = "id,titel,art,unterschrieben_am,auftragsnr,verantwortlich,notiz,status,updated_at";
  const SCOLS = "id,projekt_id,pos,titel,erledigt,erledigt_am,erledigt_von,updated_at";
  // Live-Änderungen während einer laufenden Abfrage (Kennung → Zeile oder null für gelöscht); die ältere Abfrage überschreibt sie nicht
  let projSeq = 0, pTouched = new Map(), sTouched = new Map(), stepFailAt = 0, stepPause = 0, projRetryT = null, stepRetryT = 0;
  // Stand der Datenbank beim letzten vollständigen Laden (oder danach live bestätigt). Gleich beim Wiederverbinden: nichts neu laden.
  let projStand = null, projRetryMs = 5000;
  const newer = (cur, r) => !cur || tsOf(r.updated_at) >= tsOf(cur.updated_at);
  function applyProjekt(r) { if (newer(state.projekte.get(r.id), r)) state.projekte.set(r.id, r); }
  function applySchritt(r) {
    if (!state.schritteVon.has(r.projekt_id) || !state.projekte.has(r.projekt_id)) return;
    if (newer(state.schritte.get(r.id), r)) { state.schritte.set(r.id, r); stepIdx = null; }
  }
  function putProjekt(r) {
    if (isLocked() || !r || !r.id) return;
    pTouched.set(r.id, r); applyProjekt(r);
    // Neu oder wieder geöffnet: Schritte nachladen
    if (state.projLoaded && r.status !== "abgeschlossen") ensureSchritte([r.id]);
  }
  function dropProjekt(id) {
    if (!id) return;
    pTouched.set(id, null); state.projekte.delete(id); state.schritteVon.delete(id); state.naechste.delete(id);
    for (const [sid, x] of state.schritte) if (x.projekt_id === id) state.schritte.delete(sid);
    stepIdx = null;
  }
  function putSchritt(r) { if (isLocked() || !r || !r.id) return; sTouched.set(r.id, r); applySchritt(r); }
  function dropSchritt(id) { if (!id) return; sTouched.set(id, null); state.schritte.delete(id); stepIdx = null; }
  // Nach jeder Änderung an Projekten: Ansicht, offenes Unterfenster und Auswahl im Termin nachziehen
  function afterProj() {
    stepIdx = null;
    if (isLocked()) return;
    if (progDlg.open) {
      if (!state.projekte.has(progId)) { progDlg.close(); toast("Dieses Projekt wurde gerade gelöscht"); }
      else { if (state.projLoaded && !state.schritteVon.has(progId)) wantSchritte(progId); renderProg(); }
    }
    if (projDlg.open && projEditId && !state.projekte.has(projEditId)) { projDlg.close(); toast("Dieses Projekt wurde gerade gelöscht"); }
    if (dlg.open) fillProjSelect($("f-projekt").value);
    render();
  }
  // Viele Live-Änderungen kurz hintereinander (z. B. Projekt mit Vorlage angelegt): nur einmal neu zeichnen
  let projRaf = 0;
  const afterProjBald = () => { if (!projRaf) projRaf = requestAnimationFrame(() => { projRaf = 0; afterProj(); }); };
  // Abgelaufene Anmeldung: abmelden. Fehlendes Recht (42501) kann auch nur eine Spalte betreffen: dann nur nachfragen, ob der Zugang noch gilt.
  const projFail = (e) => {
    if (e && e.code === "42501") { checkMe(); return false; }
    if (loggedOut(e)) { lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden."); return true; }
    return false;
  };
  // Seitenweise nach Kennung (bleibt richtig, auch wenn zwischendurch Zeilen dazukommen oder wegfallen)
  async function alleZeilen(table, cols, filter, seq) {
    const out = [];
    for (let last = null; ; ) {
      let q = filter(sb.from(table).select(cols)).order("id").limit(PAGE);
      if (last) q = q.gt("id", last);
      const { data, error } = await q;
      if (seq !== projSeq || isLocked()) return null;
      if (error) throw error;
      out.push(...data);
      if (data.length < PAGE) return out;
      last = data[data.length - 1].id;
    }
  }
  async function loadProjekte() {
    if (!sb || isLocked()) return;
    clearTimeout(projRetryT);
    const seq = ++projSeq, pt = pTouched = new Map(), st = sTouched = new Map();
    const steps = [];
    try {
      // Stand vor dem Laden: was danach geändert wird, kommt live oder beim nächsten Abgleich
      const sr = await sb.rpc("kalender_projekt_stand");
      if (seq !== projSeq || isLocked()) return;
      if (sr.error) throw sr.error;
      const rows = await alleZeilen(PT, PCOLS, q => q, seq);
      if (!rows) return;
      // Schritte der nicht fertigen Projekte, dazu die schon einmal geladenen (z. B. ein fertiges Projekt im offenen Unterfenster)
      const ids = new Set(rows.map(r => r.id)), need = new Set(rows.filter(r => r.status !== "abgeschlossen").map(r => r.id));
      for (const id of state.schritteVon) if (ids.has(id)) need.add(id);
      const open = [...need];
      for (let i = 0; i < open.length; i += 100) {
        const chunk = open.slice(i, i + 100);
        const part = await alleZeilen(ST, SCOLS, q => q.in("projekt_id", chunk), seq);
        if (!part) return;
        steps.push(...part);
      }
      // Plötzlich gar keine Projekte mehr: erst fragen, ob der Zugang noch gilt (ein entzogener Zugang liefert nur leere Listen)
      if (!rows.length && state.projekte.size && await checkMe() !== "ok") return;
      if (seq !== projSeq || isLocked()) return;
      // Stand der Datenbank übernehmen, dann die Live-Änderungen, die während der Abfrage kamen
      state.projekte = new Map(rows.map(r => [r.id, r]));
      state.schritteVon = new Set(open);
      // Ältere Einzel-Ladevorgänge sind damit erledigt (ihre Antwort wird verworfen)
      open.forEach(id => stepLaedt.delete(id));
      state.schritte = new Map(steps.map(r => [r.id, r]));
      for (const [id, r] of pt) { if (r) applyProjekt(r); else state.projekte.delete(id); }
      for (const id of state.schritteVon) if (!state.projekte.has(id)) state.schritteVon.delete(id);
      for (const [id, r] of st) { if (r) applySchritt(r); else state.schritte.delete(id); }
      for (const [id, x] of state.schritte) if (!state.schritteVon.has(x.projekt_id)) state.schritte.delete(id);
      state.projLoaded = true; state.projErr = false; projStand = sr.data; projRetryMs = 5000;
      // Während der Abfrage live dazugekommene oder wieder geöffnete Projekte: Schritte nachladen
      const fehlt = [...pt.keys()].filter(id => state.projekte.has(id) && !state.schritteVon.has(id) && state.projekte.get(id).status !== "abgeschlossen");
      if (fehlt.length) ensureSchritte(fehlt);
      afterProj();
      if (state.tab === "projekte") loadNaechste();
    } catch (e) {
      if (seq !== projSeq || projFail(e)) return;
      // Später erneut versuchen, mit wachsendem Abstand; die Termine laufen davon unabhängig weiter
      state.projErr = true; if (state.tab === "projekte") renderProjekte();
      clearTimeout(projRetryT); projRetryT = setTimeout(loadProjekte, projRetryMs); projRetryMs = Math.min(projRetryMs * 2, 120000);
    }
  }
  // Nach dem (Wieder-)Verbinden: nur neu laden, wenn sich seit dem letzten Laden etwas geändert hat (spart Datenvolumen)
  async function projAbgleich() {
    if (!sb || isLocked()) return;
    if (!state.projLoaded || projStand === null) return loadProjekte();
    const seq = projSeq;
    let r;
    try { r = await sb.rpc("kalender_projekt_stand"); } catch { r = { error: {} }; }
    if (seq !== projSeq || isLocked()) return;
    if (r.error && projFail(r.error)) return;
    if (r.error || r.data !== projStand) loadProjekte();
  }
  // Live-Änderungen verändern den Stand. Den neuen Stand erst merken, wenn die Verbindung danach noch einige Sekunden steht
  // (dann sind auch Änderungen angekommen, die beim Abfragen noch unterwegs waren).
  let standT = null, pEpoch = 0;
  function standBald() {
    clearTimeout(standT);
    const ep = pEpoch, seq = projSeq;
    standT = setTimeout(async () => {
      let r;
      try { r = await sb.rpc("kalender_projekt_stand"); } catch { return; }
      if (r.error || ep !== pEpoch || seq !== projSeq || isLocked()) return;
      standT = setTimeout(() => { if (ep === pEpoch && seq === projSeq) projStand = r.data; }, 5000);
    }, 3000);
  }
  // Schritte einzelner Projekte nachladen (fertige Projekte, neu angelegte, wieder geöffnete)
  async function ensureSchritte(ids) {
    const need = [...new Set(ids)].filter(id => id && !state.schritteVon.has(id) && state.projekte.has(id));
    if (!need.length || !sb || isLocked()) return;
    // Kurz nach einem Fehler nicht gleich wieder fragen, aber auch nicht aufgeben
    const warte = stepPause - (Date.now() - stepFailAt);
    if (warte > 0) { spaeterSchritte(need, warte); return; }
    const seq = projSeq, sagen = progDlg.open && need.includes(progId) && stepWarten.has(progId);
    need.forEach(id => { state.schritteVon.add(id); stepLaedt.add(id); stepWarten.delete(id); });
    try {
      for (let i = 0; i < need.length; i += 100) {
        const chunk = need.slice(i, i + 100);
        const part = await alleZeilen(ST, SCOLS, q => q.in("projekt_id", chunk), seq);
        if (!part) return;
        for (const r of part) if (sTouched.get(r.id) !== null) applySchritt(r);
      }
      stepPause = 0;
      if (sagen && progDlg.open && need.includes(progId)) progSay("Schritte geladen.");
    } catch (e) {
      if (seq !== projSeq || projFail(e)) return;
      stepFailAt = Date.now(); stepPause = Math.min(stepPause ? stepPause * 2 : 15000, 120000);
      need.forEach(id => state.schritteVon.delete(id));
      spaeterSchritte(need, stepPause);
      if (progDlg.open && need.includes(progId)) progSay("Schritte konnten nicht geladen werden. Neuer Versuch läuft gleich von selbst.");
    } finally {
      need.forEach(id => stepLaedt.delete(id));
      // Von einem vollständigen Neuladen überholt: trotzdem neu zeichnen (sonst bliebe „…“ stehen)
      if (seq !== projSeq && !isLocked()) afterProjBald();
    }
    afterProj();
  }
  // Nach einem Fehler später erneut laden (sonst bliebe „wird geladen“ stehen, bis zufällig etwas neu zeichnet)
  function spaeterSchritte(ids, ms) {
    ids.forEach(id => stepWarten.add(id));
    if (!stepRetryT) stepRetryT = setTimeout(() => { stepRetryT = 0; const l = [...stepWarten]; stepWarten.clear(); ensureSchritte(l); }, ms);
  }
  // Schritte, die eine Anzeige braucht (Projektzeile am Termin, Unterfenster), gesammelt nachladen
  let wantSet = new Set(), wantT = 0;
  function wantSchritte(id) {
    if (!id || !state.projLoaded || state.schritteVon.has(id) || isLocked()) return;
    wantSet.add(id);
    if (!wantT) wantT = setTimeout(() => { wantT = 0; const l = [...wantSet]; wantSet.clear(); ensureSchritte(l); }, 0);
  }
  // Nächster Termin je Projekt (ab heute), für die Übersicht
  let naechsteSeq = 0, naechsteT = null;
  async function loadNaechste() {
    clearTimeout(naechsteT);
    if (!sb || isLocked()) return;
    const seq = ++naechsteSeq;
    let r;
    try {
      r = await sb.from(T).select("id,title,date,start_time,end_time,all_day,projekt_id").not("projekt_id", "is", null).gte("date", ymd(new Date()))
        .order("date").order("all_day", { ascending: false }).order("start_time").limit(1000);
    } catch { return; }
    if (seq !== naechsteSeq || isLocked()) return;
    if (r.error) { projFail(r.error); return; }
    const m = new Map(), jetzt = new Date(), heute = ymd(jetzt), hm = `${pad(jetzt.getHours())}:${pad(jetzt.getMinutes())}`;
    for (const x of r.data) if (!m.has(x.projekt_id) && !(x.date === heute && !x.all_day && x.end_time && x.end_time <= hm)) m.set(x.projekt_id, x);
    state.naechste = m;
    if (state.tab === "projekte") renderProjekte();
  }
  const naechsteBald = () => { if (state.tab !== "projekte") return; clearTimeout(naechsteT); naechsteT = setTimeout(loadNaechste, 1500); };

  // ---------- Übersicht (Reiter Projekte) ----------
  $("projSearch").addEventListener("input", (e) => { state.pfilter.q = e.target.value; renderProjekte(); });
  document.querySelectorAll("#statusSeg button").forEach(b => b.addEventListener("click", () => { state.pfilter.status = b.dataset.status; fertigMax = 100; renderProjekte(); }));
  const kurzTermin = (x) => { const d = parse(x.date); return `${DOW[dowIdx(d)]} ${d.getDate()}.${d.getMonth() + 1}.${x.all_day ? "" : " · " + x.start_time}`; };
  // Laufend = laufend und pausiert, Fertig = abgeschlossen und storniert
  const gruppe = (p) => offen(p) ? "laufend" : "fertig";
  function renderProjekte() {
    const f = state.pfilter, all = [...state.projekte.values()];
    const n = { laufend: 0, fertig: 0 };
    for (const p of all) n[gruppe(p)]++;
    document.querySelectorAll("#statusSeg button").forEach(b => {
      b.setAttribute("aria-pressed", String(b.dataset.status === f.status));
      fill(b, b.dataset.status === "laufend" ? "Laufend" : "Fertig", state.projLoaded ? el("span", { class: "cnt num" }, n[b.dataset.status]) : null);
    });
    const pausiert = all.filter(p => p.status === "pausiert").length;
    $("projCount").textContent = !state.projLoaded ? "" : `${n.laufend - pausiert} laufend` + (pausiert ? ` · ${pausiert} pausiert` : "");
    const qq = f.q.trim().toLowerCase();
    const list = all.filter(p => gruppe(p) === f.status
      && (!qq || [p.titel, p.auftragsnr, p.verantwortlich, p.notiz, artLabel(p.art)].some(x => (x || "").toLowerCase().includes(qq))));
    // Laufende: der älteste Auftrag zuerst, pausierte am Ende. Fertige: zuletzt geändert zuerst.
    list.sort(f.status === "fertig" ? (a, b) => tsOf(b.updated_at) - tsOf(a.updated_at) || a.titel.localeCompare(b.titel, "de")
      : (a, b) => (a.status === "pausiert") - (b.status === "pausiert") || a.unterschrieben_am.localeCompare(b.unterschrieben_am) || a.titel.localeCompare(b.titel, "de"));
    // Fertige Projekte in Hunderterschritten zeigen; Schritte nur für die gezeigten laden (spart Datenvolumen)
    const zeige = f.status === "fertig" ? list.slice(0, fertigMax) : list;
    if (f.status === "fertig") ensureSchritte(zeige.map(p => p.id));
    const box = $("projList");
    box.setAttribute("aria-busy", String(!state.projLoaded));
    if (!state.projLoaded) {
      box.replaceChildren(state.projErr
        ? el("div", { class: "empty" }, el("span", null, "Projekte konnten nicht geladen werden."),
            el("button", { class: "btn", type: "button", onclick: () => { state.projErr = false; renderProjekte(); loadProjekte(); } }, "Erneut versuchen"))
        : el("div", { class: "empty" }, "Projekte werden geladen …"));
      return;
    }
    if (!list.length) {
      const leer = !all.length;
      box.replaceChildren(el("div", { class: "empty" },
        el("span", null, leer ? "Noch keine Projekte. Lege ein Projekt an, sobald ein Auftrag unterschrieben ist."
          : qq ? "Keine Projekte passen zur Suche." : f.status === "laufend" ? "Keine laufenden Projekte." : "Noch keine fertigen Projekte."),
        leer && state.canWrite ? el("button", { class: "btn primary", type: "button", onclick: () => openProjForm(null, false) }, svgPlus(), "Neues Projekt") : null));
      return;
    }
    const rest = list.length - zeige.length;
    // Neu zeichnen (Live-Änderung, nachgeladene Schritte) behält den Tastaturfokus auf derselben Zeile
    const act = document.activeElement, fokusPid = act && box.contains(act) ? act.dataset.pid : null;
    fill(box, el("ul", { class: "prows" }, zeige.map(p => el("li", null, projRow(p)))),
      rest > 0 ? el("div", { class: "pmehr" }, el("button", { class: "btn", type: "button", onclick: () => {
        // Fokus auf die erste neu gezeigte Zeile (der Knopf verschwindet beim Neuzeichnen)
        const alt = fertigMax; fertigMax += 100; renderProjekte(); $("projList").querySelectorAll(".prow")[alt]?.focus(); } },
        `Weitere ${Math.min(rest, 100)} von ${rest} anzeigen`)) : null);
    if (fokusPid) box.querySelector(`.prow[data-pid="${CSS.escape(fokusPid)}"]`)?.focus({ preventScroll: true });
  }
  function projRow(p) {
    const f = fortschritt(p.id), nx = state.naechste.get(p.id);
    const meta = [artLabel(p.art), p.auftragsnr ? "Nr. " + p.auftragsnr : null, p.verantwortlich].filter(Boolean).join(" · ");
    const lange = f.seit != null && f.seit >= 14 && p.status === "laufend";
    return el("button", { class: "prow", type: "button", "data-status": p.status, "data-pid": p.id, onclick: () => openProg(p.id) },
      el("span", { class: "pt" }, el("span", { class: "ptn" }, p.titel), p.status === "laufend" ? null : el("span", { class: "badge", "data-status": p.status }, STAND[p.status])),
      el("span", { class: "pm" }, meta),
      el("span", { class: "pnext" + (lange ? " lange" : "") },
        !f.loaded ? "…" : f.next ? [el("span", { class: "k" }, "Als Nächstes"), el("span", { class: "v" }, f.next.titel),
          offen(p) && f.seit != null ? el("span", { class: "seit" }, tageText(f.seit)) : null]
        : f.total ? el("span", { class: "fertig" }, svgCheck(), "Alle Schritte erledigt") : el("span", { class: "v" }, "Noch keine Schritte")),
      el("span", { class: "ptermin" + (offen(p) && !nx ? " keiner" : "") }, el("span", { class: "k" }, "Nächster Termin"),
        el("span", { class: "v num" }, nx ? kurzTermin(nx) : offen(p) ? "keiner geplant" : "–")),
      el("span", { class: "pprog" }, pbar(f), el("span", { class: "num" }, f.loaded && f.total ? `${f.done}/${f.total}` : "")),
      svgNext());
  }

  // ---------- Unterfenster: Fortschritt eines Projekts ----------
  const progDlg = $("progDlg");
  let progId = null, progGen = 0, progFromEditor = false, progTermine = null, progEdit = false, progAlle = false, progOpener = null;
  const stepBusy = new Set();
  function openProg(id) {
    if (!state.projekte.has(id)) return;
    meBald();
    const act = document.activeElement;
    progOpener = act && act.matches && act.matches(".prow, .ppill") ? act : null;
    progId = id; progGen++; progFromEditor = dlg.open; progTermine = null; progEdit = false; progAlle = false;
    $("progBody").replaceChildren(
      el("header", { class: "phead", id: "progHead" }),
      el("div", { class: "pscroll", id: "progScroll" },
        el("div", { class: "pstand", id: "progStand", tabindex: "-1" }),
        el("ul", { class: "psteps", id: "progSteps", "aria-label": "Schritte" }),
        el("form", { class: "padd", id: "progAdd", novalidate: true, hidden: true, onsubmit: (ev) => { ev.preventDefault(); addStep(); } },
          el("label", { class: "sr", for: "progNeu" }, "Neuer Schritt"),
          el("input", { type: "text", id: "progNeu", maxlength: "80", placeholder: "Neuer Schritt", autocomplete: "off", enterkeyhint: "done",
            onfocus: (ev) => setTimeout(() => ev.target.scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" }), 300) }),
          el("button", { class: "btn", type: "submit" }, svgPlus(), "Hinzufügen"),
          el("p", { class: "phinw", id: "progAddHint" })),
        el("div", { class: "err", id: "progErr", role: "alert" }),
        el("p", { class: "pinfo", id: "progInfo", role: "status" }),
        el("p", { class: "sr", id: "progSay", role: "status" }),
        el("section", { class: "pnote", id: "progNote" }),
        el("section", { class: "ptermine", id: "progTermine" })),
      el("footer", { class: "pfoot", id: "progFoot" }));
    renderProg();
    progDlg.showModal();
    $("progScroll").scrollTop = 0;
    ensureSchritte([id]);
    loadProgTermine();
  }
  // Nur für Bildschirmleser: Laden der Schritte geklappt oder nicht
  function progSay(msg) { const n = $("progSay"); if (!n) return; n.textContent = ""; setTimeout(() => { if ($("progSay")) $("progSay").textContent = msg; }, 50); }
  // Kurze Rückmeldung im Fenster selbst (eine Meldung unten am Bildschirm läge hinter dem Fenster)
  let progInfoT = null;
  function progInfo(msg) {
    const n = $("progInfo"); if (!n) return;
    n.textContent = msg; clearTimeout(progInfoT); progInfoT = setTimeout(() => { if ($("progInfo")) $("progInfo").textContent = ""; }, 3000);
  }
  // Neue Schritte kommen vor den Abschluss (Schlussrechnung, Bezahlt), wenn das Projekt damit endet
  function neuePos(list) {
    let k = list.length;
    while (k > 0 && SCHLUSS.includes(list[k - 1].titel)) k--;
    if (k === list.length || k === 0) return null;
    return (Number(list[k - 1].pos) + Number(list[k].pos)) / 2;
  }
  // Wieder öffnen braucht einen zweiten Tipp: sonst ginge mit einem Fehltipp verloren, wer den Schritt wann erledigt hat
  let reopenId = null, reopenT = null, reopenAb = 0;
  function armReopen(sid) {
    reopenId = sid; reopenAb = performance.now(); clearTimeout(reopenT);
    reopenT = setTimeout(() => { reopenId = null; if (progDlg.open) renderProg(); }, 4000);
    renderProg();
    $("progSteps").querySelector(`[data-sid="${CSS.escape(sid)}"] .reopen`)?.focus({ preventScroll: true });
  }
  // Streichen ebenso mit Rückfrage; die Rückfrage steht im Zustand, damit sie ein Neuzeichnen (Live-Änderung) übersteht
  let delArmId = null, delArmT = null, delArmAb = 0;
  function disarmDel() { delArmId = null; clearTimeout(delArmT); }
  function armDel(sid) {
    if (delArmId === sid) {
      // Doppeltipp zählt nicht als Bestätigung
      if (performance.now() - delArmAb < 500) return;
      disarmDel(); delStep(sid); return;
    }
    delArmId = sid; delArmAb = performance.now(); clearTimeout(delArmT);
    delArmT = setTimeout(() => { delArmId = null; if (progDlg.open) renderProg(); }, 4000);
    renderProg();
    $("progSteps").querySelector(`[data-sid="${CSS.escape(sid)}"] .sdel`)?.focus({ preventScroll: true });
  }
  function renderProg() {
    const p = state.projekte.get(progId);
    if (!p) return;
    const f = fortschritt(p.id), ro = !state.canWrite, edit = progEdit && !ro, fehl = !f.loaded && stepWarten.has(p.id);
    const act = document.activeElement, focusSid = act && act.closest && act.closest("#progSteps [data-sid]")?.dataset.sid;
    const focusCls = act && act.classList ? [...act.classList].find(c => c === "reopen" || c === "sdel") || "" : "";
    fill($("progHead"),
      el("span", { class: "grab", "aria-hidden": "true" }),
      el("div", { class: "ph" },
        el("h4", { id: "progTitle" }, p.titel, p.status === "laufend" ? null : el("span", { class: "badge", "data-status": p.status }, STAND[p.status])),
        el("p", { class: "sub" }, [artLabel(p.art), p.auftragsnr ? "Nr. " + p.auftragsnr : null, "unterschrieben " + dmy(p.unterschrieben_am), p.verantwortlich].filter(Boolean).join(" · "))),
      el("div", { class: "pacts" },
        // Aus dem Termin heraus geöffnet: keine weiteren Fenster darüber (Projekt bearbeiten, Termin eintragen)
        ro || progFromEditor ? null : el("button", { class: "btn icon ghost pedit", type: "button", "aria-label": "Projekt bearbeiten", title: "Projekt bearbeiten",
          onclick: () => openProjForm(p.id, false) }, svgEdit()),
        el("button", { class: "btn icon ghost pclose", type: "button", "aria-label": "Schließen", onclick: () => progDlg.close() }, svgX())));
    fill($("progStand"),
      el("div", { class: "pzahl" }, el("strong", { class: "num" }, !f.loaded ? "…" : f.total ? `${f.done} von ${f.total}` : "0"),
        el("span", null, f.loaded && f.total ? "Schritten erledigt" : f.loaded ? "Noch keine Schritte" : fehl ? "Schritte konnten nicht geladen werden" : "Schritte werden geladen")),
      fehl ? el("div", { class: "pfehl" }, el("span", null, "Neuer Versuch läuft gleich von selbst."),
        el("button", { class: "btn small", type: "button", onclick: () => { stepFailAt = 0; ensureSchritte([p.id]); renderProg(); $("progStand")?.focus({ preventScroll: true }); } }, "Jetzt erneut versuchen")) : null,
      pbar(f, "big"),
      f.loaded && f.next ? el("p", { class: "pnext2" }, el("span", { class: "k" }, "Als Nächstes"), el("span", null, f.next.titel), offen(p) && f.seit != null ? el("span", { class: "seit" }, tageText(f.seit)) : null) : null,
      f.loaded && f.total && !f.next && offen(p) && !ro
        ? el("div", { class: "pfertig" }, el("span", null, svgCheck(), "Alle Schritte erledigt"),
            el("button", { class: "btn primary small", type: "button", onclick: (ev) => setProjStand(p, "abgeschlossen", ev.currentTarget) }, "Als fertig markieren")) : null);
    const darfStreichen = (x) => !x.erledigt || istVerwalter();
    $("progSteps").replaceChildren(...f.list.map(x => {
      const busy = stepBusy.has(x.id), armed = reopenId === x.id && x.erledigt && !ro;
      return el("li", { "data-sid": x.id, class: (x.erledigt ? "done" : "") + (busy ? " busy" : "") },
        el("label", { class: "chk" },
          // Während des Speicherns nicht „disabled“: sonst verlöre die Tastatur bzw. VoiceOver den Fokus
          el("input", { type: "checkbox", checked: x.erledigt, disabled: ro, "aria-disabled": busy ? "true" : null, "aria-describedby": x.erledigt ? `sm-${x.id}` : null,
            onchange: (ev) => {
              if (stepBusy.has(x.id)) { ev.target.checked = !ev.target.checked; return; }
              if (ev.target.checked) toggleStep(x.id, true);
              else { ev.target.checked = true; armReopen(x.id); }
            } }),
          el("span", { class: "box", "aria-hidden": "true" }, svgCheck()),
          el("span", { class: "st" }, el("span", { class: "stt" }, x.titel),
            x.erledigt ? el("span", { class: "sm", id: `sm-${x.id}` }, `erledigt ${x.erledigt_am ? fmtTag(x.erledigt_am) : ""}${x.erledigt_von ? " · " + x.erledigt_von : ""}`) : null)),
        armed ? el("button", { class: "btn small reopen", type: "button", onclick: () => {
          // Doppeltipp auf den Haken zählt nicht als Bestätigung
          if (performance.now() - reopenAb < 500) return;
          reopenId = null; clearTimeout(reopenT); toggleStep(x.id, false); } }, "Wieder öffnen?") : null,
        edit && !armed && darfStreichen(x) ? (delArmId === x.id
          ? el("button", { class: "sdel armed", type: "button", "aria-label": `Schritt „${x.titel}“ wirklich streichen?`, onclick: () => armDel(x.id) }, "Streichen?")
          : el("button", { class: "sdel", type: "button", "aria-label": `Schritt „${x.titel}“ streichen`, onclick: () => armDel(x.id) }, svgX())) : null);
    }));
    $("progAdd").hidden = !edit || !f.loaded;
    $("progAddHint").textContent = neuePos(f.list) != null ? "Neue Schritte kommen vor die Schlussrechnung." : "";
    const note = p.notiz ? [el("span", { class: "k" }, "Notiz"), el("p", null, p.notiz)] : [];
    $("progNote").replaceChildren(...note); $("progNote").hidden = !note.length;
    fill($("progFoot"),
      ro ? null : el("button", { class: "btn" + (edit ? " on" : ""), type: "button", "aria-pressed": String(edit), onclick: () => { progEdit = !progEdit; disarmDel(); renderProg(); if (progEdit) $("progNeu")?.focus({ preventScroll: true }); } },
        edit ? "Fertig mit Bearbeiten" : "Schritte bearbeiten"),
      ro || progFromEditor || !offen(p) ? null : el("button", { class: "btn", type: "button", onclick: () => terminFuer(p) }, svgPlus(), "Termin"),
      el("span", { class: "spacer" }),
      el("span", { class: "phint2" }, ro ? "Nur lesen" : "Häkchen werden sofort gespeichert"));
    renderProgTermine();
    if (focusSid) {
      const row = $("progSteps").querySelector(`[data-sid="${CSS.escape(focusSid)}"]`);
      (focusCls && row?.querySelector("." + focusCls) || row?.querySelector("input"))?.focus({ preventScroll: true });
    }
  }
  function renderProgTermine() {
    const box = $("progTermine");
    if (!box) return;
    const heute = ymd(new Date()), t = progTermine;
    const kids = [el("span", { class: "k" }, "Termine")];
    if (t === null) kids.push(el("p", { class: "leer" }, "werden geladen …"));
    else if (t === "fehler") kids.push(el("p", { class: "leer" }, "Konnten nicht geladen werden."));
    else if (!t.length) kids.push(el("p", { class: "leer" }, "Noch keine Termine zu diesem Projekt."));
    else {
      const kommend = t.filter(x => x.date >= heute);
      const zeigen = progAlle ? t : kommend.slice(0, 3);
      if (!zeigen.length) kids.push(el("p", { class: "leer" }, "Kein Termin geplant."));
      kids.push(el("ul", null, zeigen.map(x => {
        const inhalt = [el("span", { class: "td num" }, kurzTermin(x)), el("span", { class: "tt" }, x.title)];
        // Zum Tag springen geht nur, wenn kein Termin offen ist (sonst gingen dessen Eingaben verloren)
        return el("li", { class: x.date < heute ? "alt" : "" }, progFromEditor ? el("span", { class: "tr" }, inhalt)
          : el("button", { class: "tr", type: "button", onclick: () => springeZu(x.date) }, inhalt, svgNext()));
      })));
      if (!progAlle && t.length > zeigen.length) kids.push(el("button", { class: "linkbtn", type: "button", onclick: () => { progAlle = true; renderProgTermine(); } },
        `Alle Termine anzeigen (${t.length}${t.length >= 70 ? "+" : ""})`));
    }
    box.replaceChildren(...kids);
  }
  function springeZu(ds) {
    progDlg.close();
    state.selected = ds; state.cursor = parse(ds);
    if (state.tab !== "kalender") setTab("kalender"); else render();
  }
  // Neuen Termin für dieses Projekt: Unterfenster zu, Termin mit Projekt und Titel vorbelegt
  function terminFuer(p) {
    progDlg.close();
    if (state.tab !== "kalender") setTab("kalender");
    openEditor(null, state.selected, null, null, p.id);
  }
  // Kommende Termine (bis 50) und die letzten vergangenen (bis 20)
  const TCOLS = "id,title,date,start_time,end_time,all_day";
  let progTermineT = null;
  async function loadProgTermine() {
    clearTimeout(progTermineT);
    const gen = progGen, id = progId, heute = ymd(new Date());
    let a, b;
    try {
      [a, b] = await Promise.all([
        sb.from(T).select(TCOLS).eq("projekt_id", id).gte("date", heute).order("date").order("all_day", { ascending: false }).order("start_time").limit(50),
        sb.from(T).select(TCOLS).eq("projekt_id", id).lt("date", heute).order("date", { ascending: false }).order("all_day").order("start_time", { ascending: false }).limit(20)]);
    } catch { a = { error: {} }; }
    if (gen !== progGen || !progDlg.open || isLocked()) return;
    const err = a.error || (b && b.error);
    if (err && projFail(err)) return;
    progTermine = err ? "fehler" : [...a.data, ...b.data.reverse()];
    renderProgTermine();
  }
  // Ein Termin dieses Projekts wurde angelegt, verschoben, umgehängt oder gelöscht
  function progTermineBald(p) {
    if (!progDlg.open || !progId) return;
    const id = (p.new && p.new.id) || (p.old && p.old.id);
    const dabei = Array.isArray(progTermine) && progTermine.some(x => x.id === id);
    if (!dabei && !(p.new && p.new.projekt_id === progId)) return;
    clearTimeout(progTermineT); progTermineT = setTimeout(loadProgTermine, 800);
  }
  const stepError = (e) => {
    if (projFail(e)) return "";
    if (e && e.code === "23514") return e.hint === "schritte_max" || /40 Schritte/.test(e.message || "") ? "Mehr als 40 Schritte je Projekt gehen nicht." : "Der Schritt ist zu lang (höchstens 80 Zeichen).";
    if (e && e.code === "23503") { if (progId) reloadProjekt(progId); return "Dieses Projekt gibt es nicht mehr."; }
    if (e && e.code === "42501") return "Keine Berechtigung. Lade die Seite neu und versuche es noch einmal.";
    if (e && e.status === 429) return "Gerade zu viele Änderungen auf einmal. Bitte kurz warten und erneut versuchen.";
    return "Speichern hat nicht geklappt. Prüfe die Verbindung und versuche es erneut.";
  };
  // Fehler zu einem Projekt: im Fenster, solange es dieses Projekt zeigt; zeigt es ein anderes, dort mit Namen; sonst unten am Bildschirm
  // (sonst bliebe z. B. ein zurückgenommenes Häkchen nach dem Schließen unbemerkt). Nach dem Abmelden nichts mehr.
  function projMeldung(pid, m, sonst, sg) {
    if (!m || !gleicheSitzung(sg)) return;
    if (progDlg.open && $("progErr")) $("progErr").textContent = progId === pid ? m : sonst || m;
    else toast(sonst || m, 7000);
  }
  // Abhaken: sofort anzeigen, bei Fehler zurücknehmen. „Wer und wann“ trägt die Datenbank ein.
  async function toggleStep(sid, on) {
    const prev = state.schritte.get(sid);
    if (!prev || !state.canWrite || stepBusy.has(sid)) return;
    stepBusy.add(sid); $("progErr").textContent = "";
    const pid = prev.projekt_id, wer = state.projekte.get(pid)?.titel || "", sg = sitzGen;
    const nicht = `„${kurz(prev.titel, 40)}“${wer ? " bei " + kurz(wer, 40) : ""} wurde nicht ${on ? "abgehakt" : "wieder geöffnet"}. Bitte noch einmal versuchen.`;
    // Vorläufige Anzeige behält den alten Zeitstempel: jede Antwort der Datenbank ist neuer und ersetzt sie
    const opt = { ...prev, erledigt: on, erledigt_am: on ? new Date().toISOString() : null, erledigt_von: on ? (state.me && state.me.name) || "" : null };
    state.schritte.set(sid, opt);
    afterProj();
    try {
      const res = await sb.from(ST).update({ erledigt: on }).eq("id", sid).select(SCOLS);
      check(res);
      if (res.data.length) putSchritt(res.data[0]);
      else {
        // Nichts geändert: entweder gestrichen oder der Zugang gilt nicht mehr
        if (state.schritte.get(sid) === opt) state.schritte.set(sid, prev);
        if (await checkMe() === "weg") return;
        const now = await sb.from(ST).select(SCOLS).eq("id", sid).maybeSingle();
        if (isLocked()) return;
        if (now.error) throw now.error;
        if (now.data) { putSchritt(now.data); projMeldung(pid, "Speichern hat nicht geklappt. Bitte erneut versuchen.", nicht, sg); }
        else { dropSchritt(sid); if (progDlg.open && progId === pid) progInfo("Diesen Schritt hat gerade jemand gestrichen."); }
      }
    } catch (e) {
      if (state.schritte.get(sid) === opt) state.schritte.set(sid, prev);
      projMeldung(pid, stepError(e), nicht, sg);
    } finally { stepBusy.delete(sid); afterProj(); }
  }
  let addBusy = false;
  async function addStep() {
    const inp = $("progNeu"), titel = inp.value.replace(/\s+/g, " ").trim(), pid = progId, gen = progGen, sg = sitzGen;
    if (!titel || addBusy || !state.canWrite) return;
    addBusy = true; $("progErr").textContent = "";
    try {
      const pos = neuePos(stepsOf(pid));
      const res = await sb.from(ST).insert(pos == null ? { projekt_id: pid, titel } : { projekt_id: pid, titel, pos }).select(SCOLS).single();
      check(res);
      putSchritt(res.data);
      if (gen === progGen) { inp.value = ""; inp.focus({ preventScroll: true }); }
    } catch (e) { projMeldung(gen === progGen ? pid : null, stepError(e), `Der Schritt „${kurz(titel, 40)}“ wurde nicht hinzugefügt. Bitte noch einmal versuchen.`, sg); }
    finally { addBusy = false; afterProj(); }
  }
  async function delStep(sid) {
    $("progErr").textContent = "";
    const pid = progId, sg = sitzGen;
    // Nach dem Streichen den Fokus auf den nächsten Schritt setzen (sonst landet er bei Tastatur und VoiceOver im Nichts)
    const list = stepsOf(progId), i = list.findIndex(x => x.id === sid), nb = (list[i + 1] || list[i - 1] || {}).id;
    try {
      const res = await sb.from(ST).delete().eq("id", sid).select("id");
      check(res);
      if (res.data.length) dropSchritt(sid);
      else {
        // Gerade von jemand anderem abgehakt (erledigte streichen nur Verwalter) oder schon weg
        const now = await sb.from(ST).select(SCOLS).eq("id", sid).maybeSingle();
        if (isLocked()) return;
        if (now.data) { putSchritt(now.data); projMeldung(pid, "Erledigte Schritte können nur Verwalter streichen.", null, sg); }
        else if (!now.error) dropSchritt(sid);
      }
    } catch (e) { projMeldung(pid, stepError(e), "Ein Schritt wurde nicht gestrichen. Bitte noch einmal versuchen.", sg); }
    afterProj();
    if (progDlg.open && !progDlg.contains(document.activeElement)) {
      const row = nb && $("progSteps").querySelector(`[data-sid="${CSS.escape(nb)}"]`);
      (row?.querySelector(".sdel") || row?.querySelector("input") || $("progNeu"))?.focus({ preventScroll: true });
    }
  }
  // Stand ändern (Als fertig markieren) mit Versionsprüfung
  async function setProjStand(p, status, btn) {
    const sg = sitzGen;
    if (btn) btn.disabled = true;
    try {
      const res = await sb.from(PT).update({ status }).eq("id", p.id).eq("updated_at", p.updated_at).select(PCOLS);
      check(res);
      if (res.data.length) { putProjekt(res.data[0]); if (progDlg.open && progId === p.id) progInfo(status === "abgeschlossen" ? "Projekt ist fertig." : "Gespeichert."); }
      else { projMeldung(p.id, "Jemand hat das Projekt gerade geändert. Bitte noch einmal prüfen.", `„${kurz(p.titel, 40)}“ hat gerade jemand geändert. Bitte noch einmal prüfen.`, sg); await reloadProjekt(p.id); }
    } catch (e) { projMeldung(p.id, stepError(e), `„${kurz(p.titel, 40)}“ wurde nicht als fertig markiert. Bitte noch einmal versuchen.`, sg); }
    finally { if (btn) btn.disabled = false; afterProj(); }
  }
  async function reloadProjekt(id) {
    let r;
    try { r = await sb.from(PT).select(PCOLS).eq("id", id).maybeSingle(); } catch { return; }
    if (isLocked() || r.error) return;
    if (r.data) putProjekt(r.data); else dropProjekt(id);
    afterProj();
  }
  // Kundendaten nur so lange im Fenster, wie es offen ist
  progDlg.addEventListener("close", () => {
    const id = progId;
    progGen++; progId = null; progTermine = null; progEdit = false; reopenId = null; disarmDel();
    clearTimeout(progTermineT); clearTimeout(reopenT); clearTimeout(progInfoT); $("progBody").replaceChildren();
    // Das Element, das das Fenster geöffnet hat, wurde inzwischen evtl. neu gezeichnet: Fokus auf seinen sichtbaren Nachfolger
    const op = progOpener; progOpener = null;
    if (id && !isLocked() && (!document.activeElement || document.activeElement === document.body)) {
      const sicht = (n) => !!n && n.isConnected && n.getClientRects().length > 0;
      const erst = (q) => [...document.querySelectorAll(q)].find(sicht);
      // Zuerst dieselbe Projektzeile am selben Termin, sonst irgendeine sichtbare Zeile des Projekts (z. B. nach Sprung zu einem anderen Tag)
      (sicht(op) ? op : (op && op.dataset.tid && erst(`.ppill[data-pid="${CSS.escape(id)}"][data-tid="${CSS.escape(op.dataset.tid)}"]`))
        || erst(`.prow[data-pid="${CSS.escape(id)}"], .ppill[data-pid="${CSS.escape(id)}"]`))?.focus({ preventScroll: true });
    }
  });
  progDlg.addEventListener("click", (ev) => { if (ev.target === progDlg) progDlg.close(); });

  // ---------- Projekt anlegen und bearbeiten ----------
  const projDlg = $("projDlg");
  let projEditId = null, projStamp = null, projForEditor = false, projNeuId = null;
  // Verwalter mit eigenem Zugang (dürfen Projekte und erledigte Schritte löschen; die Datenbank prüft das ebenso)
  const istVerwalter = () => !!(state.me && state.me.admin && !state.me.team);
  $("arten").replaceChildren(...ARTEN.map((a, i) => el("label", { style: "--c:var(--accent-ink)" },
    el("input", { type: "radio", name: "art", value: a.id, id: `art-${a.id}`, checked: i === 0 }), a.label)));
  $("p-status").replaceChildren(...Object.entries(STAND).map(([k, v]) => el("label", { style: `--c:${STAND_FARBE[k]}` },
    el("input", { type: "radio", name: "pstatus", value: k, id: `pst-${k}` }), v)));
  const artOf = () => (projDlg.querySelector('input[name="art"]:checked') || {}).value || "pv";
  // Vorlage als Liste zum Abwählen; optionale Schritte sind zunächst nicht gewählt
  function syncVorlage() {
    if (projEditId) { $("p-vorlage").hidden = true; return; }
    const v = VORLAGEN[artOf()] || [];
    $("p-vorlageListe").replaceChildren(...v.map((s, i) => el("li", null, el("label", { class: "toggle" },
      el("input", { type: "checkbox", value: String(i), checked: !s.opt, onchange: zaehleVorlage }), s.t))));
    $("p-vorlage").hidden = false;
    zaehleVorlage();
  }
  function vorlageGewaehlt() {
    const v = VORLAGEN[artOf()] || [];
    return [...$("p-vorlageListe").querySelectorAll("input:checked")].map(i => v[Number(i.value)]?.t).filter(Boolean);
  }
  function zaehleVorlage() {
    const n = vorlageGewaehlt().length, all = (VORLAGEN[artOf()] || []).length;
    $("p-vorlageSum").textContent = `Checkliste: ${n} von ${all} Schritten aus der Vorlage`;
  }
  $("arten").addEventListener("change", syncVorlage);
  function openProjForm(id, forEditor) {
    const p = id ? state.projekte.get(id) : null;
    if (id && !p) return;
    if (!state.canWrite) return;
    projEditId = id; projStamp = p ? p.updated_at : null; projForEditor = !!forEditor;
    // Neues Projekt: Kennung schon jetzt, damit ein zweiter Versuch nach Verbindungsabbruch kein zweites Projekt anlegt
    projNeuId = p ? null : crypto.randomUUID();
    $("projDlgTitle").textContent = p ? "Projekt bearbeiten" : "Neues Projekt";
    // Aus dem Termin: Titel des Termins als Vorschlag
    $("p-titel").value = p ? p.titel : forEditor && dlg.open ? $("f-title").value.trim().slice(0, 80) : "";
    $(`art-${p && ARTEN.some(a => a.id === p.art) ? p.art : "pv"}`).checked = true;
    $("p-datum").value = p ? p.unterschrieben_am : ymd(new Date());
    $("p-datum").max = ymd(addDays(new Date(), 1));
    $("p-nr").value = p ? p.auftragsnr || "" : "";
    $("p-wer").value = p ? p.verantwortlich || "" : (state.me && !state.me.team && state.me.name) || "";
    // Vorschläge: Namen der Zugänge (nur nach Anmeldung mit Namensliste bekannt), der eigene Name und die schon eingetragenen
    const wer = new Map();
    for (const n of [...names.filter(n => !n.team).map(n => n.name), state.me && !state.me.team ? state.me.name : "", ...[...state.projekte.values()].map(x => x.verantwortlich)]) {
      const t = (n || "").trim(); if (t && !wer.has(t.toLowerCase())) wer.set(t.toLowerCase(), t);
    }
    $("p-werListe").replaceChildren(...[...wer.values()].sort((a, b) => a.localeCompare(b, "de")).map(n => el("option", { value: n })));
    $("p-notiz").value = p ? p.notiz || "" : "";
    $("p-statusFeld").hidden = !p;
    if (p) $(`pst-${p.status in STAND ? p.status : "laufend"}`).checked = true;
    $("p-signRow").hidden = !!p; $("p-sign").checked = false;
    $("p-vorlage").open = false;
    $("projSave").textContent = p ? "Speichern" : "Anlegen";
    $("projDel").hidden = !p || !istVerwalter();
    disarm($("projDel"));
    $("projErr").textContent = "";
    $("projStamp").textContent = p && p.updated_at ? `Geändert ${fmtStamp(p.updated_at)}` : "";
    syncVorlage();
    $("p-titel").autofocus = !p;
    projDlg.showModal();
  }
  $("projCancel").addEventListener("click", () => projDlg.close());
  function wipeProjForm() {
    $("projForm").reset(); $("projErr").textContent = ""; $("projStamp").textContent = ""; $("p-vorlageListe").replaceChildren(); $("p-werListe").replaceChildren();
    projEditId = projStamp = projNeuId = null; disarm($("projDel"));
  }
  projDlg.addEventListener("close", wipeProjForm);
  // Vom Browser wiederhergestellte Eingaben (Zurück, wiederhergestellter Tab) gleich verwerfen
  $("form").reset(); $("projForm").reset();
  projDlg.addEventListener("click", (ev) => { if (ev.target === projDlg) projDlg.close(); });
  const projWriteError = (e) => {
    if (projFail(e)) return "";
    if (e && (e.code === "23514" || e.code === "22001")) return "Ein Feld ist ungültig oder zu lang. Name bis 80, Auftragsnummer bis 30, Verantwortlich bis 60, Notiz bis 1000 Zeichen; das Datum darf nicht in der Zukunft liegen.";
    if (e && e.code === "42501") return "Keine Berechtigung. Lade die Seite neu und versuche es noch einmal.";
    if (e && e.status === 429) return "Gerade zu viele Änderungen auf einmal. Bitte kurz warten und erneut speichern.";
    return "Speichern hat nicht geklappt. Prüfe die Verbindung und versuche es erneut.";
  };
  $("projForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!state.canWrite || !sb) return;
    const titel = $("p-titel").value.replace(/\s+/g, " ").trim(), art = artOf(), datum = $("p-datum").value;
    const nr = $("p-nr").value.trim(), wer = $("p-wer").value.replace(/\s+/g, " ").trim(), notiz = $("p-notiz").value.trim();
    const edit = projEditId, status = (projDlg.querySelector('input[name="pstatus"]:checked') || {}).value || "laufend";
    const err = !titel ? "Bitte Kunde und Projekt eintragen." : !/^\d{4}-\d{2}-\d{2}$/.test(datum) ? "Bitte das Datum der Unterschrift eintragen."
      : datum > ymd(addDays(new Date(), 1)) ? "Das Datum der Unterschrift darf nicht in der Zukunft liegen." : datum < "2000-01-01" ? "Bitte das Datum der Unterschrift prüfen."
      : !edit && !$("p-sign").checked ? "Projekte gibt es nur für unterschriebene Aufträge. Bitte bestätigen, dass die Unterschrift vorliegt." : "";
    if (err) { $("projErr").textContent = err; return; }
    // Vor dem ersten Warten merken, aus welchem Termin das Formular kam: wird er geschlossen oder ein anderer geöffnet, kommt nichts hinein
    const sg = sitzGen, g0 = dlgGen, ausTermin = projForEditor && dlg.open, termNoch = () => ausTermin && dlg.open && g0 === dlgGen;
    $("projSave").disabled = true; $("projErr").textContent = "";
    try {
      if (edit) {
        const neu = { titel, art, unterschrieben_am: datum, auftragsnr: nr || null, verantwortlich: wer || null, notiz: notiz || null, status };
        const alt = state.projekte.get(edit);
        if (alt && alt.updated_at === projStamp && Object.keys(neu).every(k => (alt[k] ?? null) === neu[k])) { projDlg.close(); return; }
        const res = await sb.from(PT).update(neu).eq("id", edit).eq("updated_at", projStamp).select(PCOLS);
        check(res);
        if (!res.data.length) {
          await reloadProjekt(edit);
          if (!state.projekte.has(edit)) { $("projErr").textContent = "Dieses Projekt wurde gerade gelöscht."; return; }
          projStamp = state.projekte.get(edit).updated_at;
          $("projErr").textContent = "Jemand hat dieses Projekt gerade geändert. Abbrechen zeigt die neue Fassung, Speichern überschreibt sie mit deiner.";
          return;
        }
        putProjekt(res.data[0]);
        if (!gleicheSitzung(sg)) return;
        // Aus dem Termin angelegt (nach verlorener Antwort hier weitergeführt): Projekt im Termin auswählen
        projDlg.close(); afterProj();
        if (termNoch()) { fillProjSelect(edit); $("f-projekt").focus(); }
        if (progDlg.open) progInfo("Projekt gespeichert."); else toast("Projekt gespeichert");
      } else {
        const id = projNeuId;
        const res = await sb.rpc("kalender_projekt_anlegen", { p_id: id, p_titel: titel, p_art: art, p_unterschrieben_am: datum, p_auftragsnr: nr,
          p_verantwortlich: wer, p_notiz: notiz, p_schritte: vorlageGewaehlt() });
        // 23505: der erste Versuch kam schon an, nur die Antwort ging verloren
        if (res.error && res.error.code !== "23505") throw res.error;
        // Gleich nachladen, nicht auf die Live-Verbindung warten
        const one = await sb.from(PT).select(PCOLS).eq("id", id).maybeSingle();
        if (!gleicheSitzung(sg)) return;
        if (one.data) putProjekt(one.data);
        const d = one.data;
        if (res.error && !d) {
          // Nicht bestätigt, dass das Projekt da ist: Fenster offen lassen. Ist es inzwischen gelöscht, legt der nächste Versuch es neu an.
          if (one.error) throw one.error;
          projNeuId = crypto.randomUUID();
          throw res.error;
        }
        if (res.error && !(d.titel === titel && d.art === art && d.unterschrieben_am === datum && (d.auftragsnr || "") === nr
            && (d.verantwortlich || "") === wer && (d.notiz || "") === notiz)) {
          // Dazwischen wurde etwas geändert: nicht stillschweigend verwerfen, sondern als Bearbeiten weiterführen
          projEditId = id; projStamp = d.updated_at; projNeuId = null;
          $("projDlgTitle").textContent = "Projekt bearbeiten"; $("projSave").textContent = "Speichern";
          $("p-signRow").hidden = true; $("p-vorlage").hidden = true; $("p-statusFeld").hidden = false;
          $(`pst-${d.status in STAND ? d.status : "laufend"}`).checked = true;
          $("projDel").hidden = !istVerwalter();
          $("projErr").textContent = "Das Projekt war beim ersten Versuch schon angelegt. „Speichern“ übernimmt deine Änderungen, die Schritte passt du danach unter „Schritte bearbeiten“ an.";
          return;
        }
        projDlg.close();
        if (one.data) await ensureSchritte([id]);
        if (!gleicheSitzung(sg)) return;
        // Termin inzwischen geschlossen (oder ein anderer offen): nichts mehr hineinschreiben
        if (termNoch()) {
          fillProjSelect(id);
          if (!$("f-title").value.trim()) $("f-title").value = titel.slice(0, 120);
          $("f-projekt").focus();
        } else if (ausTermin) toast("Projekt angelegt");
        else {
          state.pfilter.status = "laufend"; render();
          // Gleich die Checkliste zeigen
          if (state.projekte.has(id)) { openProg(id); progInfo("Projekt angelegt."); } else toast("Projekt angelegt");
        }
      }
    } catch (e) { const m = projWriteError(e); if (m && projDlg.open) $("projErr").textContent = m; }
    finally { $("projSave").disabled = false; }
  });
  $("projDel").addEventListener("click", (ev) => confirmClick(ev.currentTarget, "Mit Checkliste löschen?", async () => {
    const id = projEditId;
    if (!id) return;
    $("projErr").textContent = "";
    try {
      const res = await sb.from(PT).delete().eq("id", id).select("id");
      check(res);
      if (!res.data.length) {
        // Schon weg oder kein Verwalter
        await reloadProjekt(id);
        if (state.projekte.has(id)) { $("projErr").textContent = "Löschen dürfen nur Verwalter mit eigenem Zugang."; return; }
      }
      dropProjekt(id);
      projDlg.close(); if (progDlg.open) progDlg.close();
      afterProj();
      toast("Projekt gelöscht. Die Termine bleiben, nur ohne Projekt.");
    } catch (e) { const m = projWriteError(e); if (m && projDlg.open) $("projErr").textContent = m; }
  }));

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
          rows: list.map((e) => ({ time: timeLabel(e), title: e.title,
            meta: `${catLabel(e.cat)} · eingetragen von ${e.person || "–"}${e.projektId && state.projekte.has(e.projektId) ? " · Projekt " + state.projekte.get(e.projektId).titel : ""}`,
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
  let channel = null, joined = false, firstT = null, pchannel = null, pjoined = false, pFirstT = null;
  function startLive() {
    if (channel) return;
    channel = sb.channel("termine-live")
      // Änderungen der anderen kommen einzeln an, ohne alles neu zu laden.
      .on("postgres_changes", { event: "*", schema: "public", table: T }, (p) => {
        if (isLocked()) return;
        if (p.eventType === "DELETE") dropRow(p.old && p.old.id);
        else if (p.new && p.new.id) putRow(p.new);
        afterChange();
        naechsteBald();
        progTermineBald(p);
      })
      .subscribe((st) => {
        // Nach jedem (Wieder-)Verbinden neu laden, damit verpasste Änderungen nachkommen.
        if (st === "SUBSCRIBED") { joined = true; clearTimeout(firstT); refresh(); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") { setStatus("readonly", "Getrennt"); if (!state.ranges.length && !isLocked()) refresh(); }
      });
    // Projekte und Schritte über eine eigene Verbindung: ein Problem dort stört die Termine nicht
    pchannel = sb.channel("projekte-live")
      .on("postgres_changes", { event: "*", schema: "public", table: PT }, (p) => {
        if (isLocked()) return;
        if (p.eventType === "DELETE") dropProjekt(p.old && p.old.id);
        else putProjekt(p.new);
        standBald(); afterProjBald();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: ST }, (p) => {
        if (isLocked()) return;
        if (p.eventType === "DELETE") dropSchritt(p.old && p.old.id);
        else putSchritt(p.new);
        standBald(); afterProjBald();
      })
      .subscribe((st) => {
        pEpoch++; clearTimeout(standT);
        if (st === "SUBSCRIBED") { pjoined = true; clearTimeout(pFirstT); projAbgleich(); }
      });
  }
  // Nach mehr als einer Minute im Hintergrund den sichtbaren Zeitraum auffrischen.
  let hiddenAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (sb && !isLocked() && Date.now() - hiddenAt > 60 * 1000) { refresh(); projAbgleich(); }
  });

  // Anmeldung gilt höchstens 30 Tage auf einem Gerät, danach muss das Passwort neu eingegeben werden.
  const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
  const loginStamp = { get() { try { return Number(localStorage.getItem("kal.loginAt")) || 0; } catch { return 0; } },
    set(v) { try { v ? localStorage.setItem("kal.loginAt", String(v)) : localStorage.removeItem("kal.loginAt"); } catch {} } };

  function clearData() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    if (pchannel) { sb.removeChannel(pchannel); pchannel = null; }
    pjoined = false; pEpoch++; clearTimeout(pFirstT); clearTimeout(standT); projStand = null;
    if (projRaf) { cancelAnimationFrame(projRaf); projRaf = 0; }
    loadSeq++; lastRangeKey = ""; joined = false; touched = new Set();
    clearTimeout(navT); clearTimeout(retryT); clearTimeout(firstT); retryMs = 5000;
    if (dlg.open) dlg.close();
    if ($("teamDlg").open) $("teamDlg").close();
    if ($("logDlg").open) $("logDlg").close();
    if (progDlg.open) progDlg.close();
    if (projDlg.open) projDlg.close();
    // Formulare und Unterfenster immer leeren, auch wenn sie gerade zu sind (späte Antworten, vom Browser wiederhergestellte Eingaben)
    sitzGen++; wipeTermin(); wipeProjForm(); $("progBody").replaceChildren(); progOpener = null; hideToast();
    projSeq++; naechsteSeq++; clearTimeout(projRetryT); clearTimeout(naechsteT); stepFailAt = 0; stepPause = 0;
    clearTimeout(stepRetryT); stepRetryT = 0; stepWarten.clear(); stepLaedt.clear(); fertigMax = 100;
    pTouched = new Map(); sTouched = new Map(); stepBusy.clear(); wantSet.clear(); clearTimeout(wantT); wantT = 0; disarmDel();
    state.projekte = new Map(); state.schritte = new Map(); state.schritteVon = new Set(); state.naechste = new Map(); state.projLoaded = false; stepIdx = null;
    state.pfilter.q = ""; $("projSearch").value = ""; state.projErr = false;
    $("projList").replaceChildren(); $("projCount").textContent = ""; fehltGeholt.clear();
    document.querySelectorAll("#statusSeg .cnt").forEach(n => n.remove());
    state.events = new Map(); state.ranges = []; state.canWrite = false; state.person = ""; state.me = null;
    // Gezeichnet wird nur der offene Reiter: den verborgenen Kalender ausdrücklich leeren (sonst blieben Termine im Dokument)
    $("board").replaceChildren(); $("agenda").replaceChildren();
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
    clearTimeout(pFirstT);
    pFirstT = setTimeout(() => { if (!pjoined && !isLocked()) loadProjekte(); }, 3000);
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
  // Zugang höchstens einmal pro Minute nachfragen. Auch ohne Klicks alle zwei Minuten, solange die Seite sichtbar ist:
  // ein gesperrtes Gerät, das offen herumliegt, zeigt die Kundendaten sonst weiter an.
  function meBald() { if (sb && !isLocked() && Date.now() - meAt > 60 * 1000) checkMe(); }
  setInterval(() => { if (sb && !isLocked() && !document.hidden && Date.now() - meAt > 2 * 60 * 1000) checkMe(); }, 30 * 1000);
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
  // Ohne Antwort nach einiger Zeit aufgeben, statt endlos zu warten (schwaches Netz auf der Baustelle)
  const within = (promise, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error("Zeit abgelaufen")), ms); promise.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); }); });
  function postFn(body, headers) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    return fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.key, ...headers }, body: JSON.stringify(body), signal: ctl.signal })
      .finally(() => clearTimeout(t));
  }
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
    falsch: "Der Code stimmt nicht. Bitte genau abtippen, etwa K7MPX-2QXA9.",
    abgelaufen: "Der Code ist abgelaufen. Bitte bei der Verwaltung einen neuen holen.",
    kein_code: "Der Code gilt nicht mehr. Bitte bei der Verwaltung einen neuen holen.",
    zu_viele: "Gerade wurden zu viele falsche Codes eingegeben. Bitte in einer Stunde erneut versuchen.",
    passwort_kurz: "Das Passwort braucht mindestens 10 Zeichen.",
    passwort_lang: "Das Passwort ist zu lang. Bitte ein kürzeres wählen.",
    passwort_schwach: "Dieses Passwort ist zu leicht zu erraten. Bitte ein anderes wählen.",
    passwort_wie_team: "Bitte nicht das bisherige Team-Passwort nehmen, sondern ein eigenes.",
    eingabe: "Bitte den 10-stelligen Code prüfen.",
  };
  $("setupForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!sb || !FN) return;
    const code = $("setupCode").value.toUpperCase().replace(/[^0-9A-Z]/g, "");
    const pw = $("setupPw").value, pw2 = $("setupPw2").value;
    const err = code.length !== 10 ? "Der Code hat 10 Zeichen, etwa K7MPX-2QXA9."
      : pw.length < 10 ? SETUP_MSG.passwort_kurz : pw !== pw2 ? "Die beiden Passwörter sind nicht gleich." : "";
    if (err) { $("setupErr").textContent = err; return; }
    $("setupBtn").disabled = true; $("setupErr").textContent = "";
    let res = null, out = null;
    try {
      res = await postFn({ aktion: "einrichten", code, passwort: pw });
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
    // Erneuern ohne Netz schlägt fehl oder dauert, ist aber kein Abmelden
    try { s = await within(sb.auth.getSession(), 10000); } catch { throw { status: 0 }; }
    if (s.error) throw { status: 0 };
    const tok = s.data && s.data.session && s.data.session.access_token;
    if (!tok) throw { status: 401 };
    let res;
    try {
      res = await postFn(body, { Authorization: "Bearer " + tok });
    } catch { throw { status: 0 }; }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, fehler: out && out.fehler };
    return out;
  }
  const TEAM_MSG = {
    keine_rechte: "Du darfst das Team nicht verwalten.",
    selbst: "Das geht nicht für deinen eigenen Zugang.",
    team_nicht: "Personen mit eigenem Passwort verwaltet nur eine Person mit Verwalter-Recht, nicht der Team-Zugang.",
    name: "Bitte einen anderen Namen wählen: höchstens 40 Zeichen, nicht „Team…“, „Datenbank“ oder „System“.",
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
    clearTimeout(btn._t); btn.classList.remove("armed"); btn.replaceChildren(...btn._was);
  }
  // Der zweite Tipp zählt erst nach einer halben Sekunde, damit ein versehentlicher Doppeltipp nicht gleich bestätigt
  function confirmClick(btn, label, fn) {
    if (!btn.classList.contains("armed")) {
      btn._was = [...btn.childNodes]; btn._ab = performance.now();
      btn.classList.add("armed"); btn.textContent = label;
      btn._t = setTimeout(() => disarm(btn), 4000);
      return;
    }
    if (performance.now() - btn._ab < 500) return;
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
    $("codeVal").textContent = code.slice(0, 5) + "-" + code.slice(5);
    $("codeUntil").textContent = `Gültig bis ${fmtWhen(bis)}, nur einmal. Persönlich weitergeben.`;
    $("codeBox").hidden = false;
  }
  const STATUS = {
    aktiv: () => "Eigenes Passwort aktiv",
    code: (p) => `Code offen bis ${fmtWhen(p.code_bis)}` + (p.team_code ? " (aus der Team-Phase)" : ""),
    abgelaufen: (p) => `Code abgelaufen am ${fmtWhen(p.code_bis)}`,
    neu: () => "Noch kein Code",
    gesperrt: () => "Gesperrt",
  };
  // Umbenennen direkt in der Zeile, z. B. wenn „User 1“ an eine neue Person geht
  function renameRow(li, p) {
    const inp = el("input", { type: "text", maxlength: "40", value: p.name, autocomplete: "off", "aria-label": `Neuer Name für ${p.name}` });
    li.replaceChildren(el("form", { class: "ren", novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      const name = inp.value.replace(/\s+/g, " ").trim();
      if (!name) { $("teamErr").textContent = "Bitte einen Namen eingeben."; inp.focus(); return; }
      if (name === p.name) { drawTeam(); return; }
      teamAct({ aktion: "umbenennen", person: p.id, name }, () => toast(`${p.name} heißt jetzt ${name}`));
    } }, inp,
      el("span", { class: "pa" }, el("button", { class: "btn primary", type: "submit" }, "Speichern"), el("button", { class: "btn", type: "button", onclick: () => drawTeam() }, "Abbrechen")),
      p.eingerichtet ? el("span", { class: "ps note" }, "Bekommt jemand anderes diesen Zugang, danach „Neuer Code“ drücken. Dann gilt das alte Passwort nicht mehr.") : null));
    inp.focus(); inp.select();
  }
  let teamData = null;
  function drawTeam() {
    const d = teamData;
    if (!d) return;
    const ich = d.ich;
    $("people").replaceChildren(...(d.personen.length ? d.personen.map(p => {
      const self = !!ich && p.email === ich, st = (STATUS[p.status] || STATUS.gesperrt)(p);
      // Der Team-Zugang richtet nur ein: Personen mit eigenem Passwort ändert nur, wer selbst verwalten darf.
      // Ausnahme: das Verwalter-Recht geben (falls sich der Inhaber ohne Häkchen eingerichtet hat); danach verwaltet das Team nie wieder.
      const locked = d.team && p.eingerichtet;
      const promote = locked && !p.admin && p.status === "aktiv";
      const li = el("li", null,
        el("span", { class: "pn" }, p.name + (p.admin ? " · verwaltet" : "") + (self ? " (du)" : "")),
        el("span", { class: "ps", "data-s": p.status }, st));
      const ren = el("button", { class: "btn", type: "button", onclick: () => renameRow(li, p) }, "Umbenennen");
      li.append(self ? el("span", { class: "pa" }, ren) : promote ? el("span", { class: "pa" },
        el("button", { class: "btn", type: "button", onclick: (ev) => confirmClick(ev.currentTarget, `Ja, ich bin ${p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name}`, () =>
          teamAct({ aktion: "admin_setzen", person: p.id, admin: true }, () => {
            teamDlg.close(); checkMe();
            toast(`${p.name} verwaltet jetzt. Zum Verwalten mit dem eigenen Namen anmelden.`);
          })) }, "Verwalten an"))
        : locked ? el("span", { class: "pa note" }, "Ändern nur mit eigenem Verwalter-Zugang") : el("span", { class: "pa" },
        el("button", { class: "btn", type: "button", onclick: (ev) => {
          const go = () => teamAct({ aktion: "neuer_code", person: p.id }, (r) => showCode(p.name, r.code, r.bis));
          if (p.status === "aktiv") confirmClick(ev.currentTarget, "Altes Passwort sperren?", go); else go();
        } }, p.status === "neu" ? "Code erzeugen" : "Neuer Code"),
        p.status === "gesperrt" || p.status === "neu" ? null : el("button", { class: "btn", type: "button",
          onclick: (ev) => confirmClick(ev.currentTarget, "Wirklich sperren?", () => teamAct({ aktion: "sperren", person: p.id }, () => toast(`${p.name} ist gesperrt`))) }, "Sperren"),
        el("button", { class: "btn", type: "button", onclick: () => teamAct({ aktion: "admin_setzen", person: p.id, admin: !p.admin }) }, p.admin ? "Verwalten aus" : "Verwalten an"),
        ren,
        el("button", { class: "btn danger", type: "button",
          onclick: (ev) => confirmClick(ev.currentTarget, "Wirklich entfernen?", () => teamAct({ aktion: "entfernen", person: p.id }, () => toast(`${p.name} ist entfernt, die Termine bleiben`))) }, "Entfernen")));
      return li;
    }) : [el("li", { class: "empty" }, "Noch niemand angelegt. Lege zuerst dich selbst an und erlaube dir das Verwalten.")]));
    // Mit dem Team-Passwort: Schritt für Schritt zum eigenen Verwalter-Zugang
    $("teamStart").hidden = !d.team;
    $("adminTip").hidden = !ich;
    $("logBtn").hidden = !ich;
    offOk = !!ich && !!d.team_aktiv;
    $("teamOff").hidden = !d.team_aktiv;
    $("teamOffBtn").disabled = !offOk;
    const alt = d.personen.filter(p => p.team_code).map(p => p.name);
    $("teamOffHint").textContent = !ich ? "Das gemeinsame Team-Passwort funktioniert noch. Abschalten kann es nur, wer mit dem eigenen Namen angemeldet ist und verwalten darf."
      : "Das gemeinsame Team-Passwort funktioniert noch. Schalte es ab, sobald du nicht mehr darauf angewiesen bist. Wer es kennt, kommt danach nicht mehr hinein."
        + (alt.length ? ` Die offenen Codes aus der Team-Phase (${alt.join(", ")}) werden dabei ungültig; erzeuge danach neue.` : "");
  }
  async function loadTeam() {
    const gen = teamGen;
    let d;
    try { d = await teamCall({ aktion: "liste" }); } catch (e) { if (gen === teamGen) teamFail(e); return; }
    if (gen !== teamGen || !teamDlg.open || isLocked()) return;
    teamData = d;
    drawTeam();
  }
  $("teamBtn").addEventListener("click", () => {
    $("teamErr").textContent = ""; hideCode(); $("people").replaceChildren(); $("teamOff").hidden = true; $("adminTip").hidden = true;
    $("teamStart").hidden = true; $("logBtn").hidden = true; teamData = null;
    disarm($("teamOffBtn")); offOk = false; $("teamOffBtn").disabled = true;
    teamDlg.showModal(); loadTeam();
  });
  $("teamClose").addEventListener("click", () => teamDlg.close());
  // Codes und Namen nur so lange auf dem Bildschirm, wie das Fenster offen ist
  teamDlg.addEventListener("close", () => {
    teamGen++; hideCode(); $("people").replaceChildren(); $("addForm").reset(); disarm($("teamOffBtn")); teamData = null;
    if (logDlg.open) logDlg.close();
  });

  // ---------- Änderungsprotokoll (nur Verwalter mit eigenem Zugang) ----------
  const logDlg = $("logDlg");
  const FELD = { title: "Titel", date: "Datum", all_day: "Ganztägig", start_time: "Beginn", end_time: "Ende", person: "Eingetragen von", note: "Notiz", cat: "Art", projekt_id: "Projekt" };
  const dmy = (s) => /^\d{4}-\d\d-\d\d$/.test(s || "") ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : (s || "");
  const wert = (k, v) => v == null || v === "" ? "–" : k === "date" ? dmy(v) : k === "all_day" ? (v ? "ja" : "nein") : k === "cat" ? catLabel(v)
    : k === "projekt_id" ? (state.projekte.has(v) ? state.projekte.get(v).titel : state.projLoaded ? "gelöschtes Projekt" : "Projekt (nicht geladen)") : String(v);
  const PFELD = { titel: "Kunde und Projekt", art: "Art", unterschrieben_am: "Unterschrieben am", auftragsnr: "Auftragsnummer", verantwortlich: "Verantwortlich", notiz: "Notiz", status: "Stand" };
  const pwert = (k, v) => v == null || v === "" ? "–" : k === "unterschrieben_am" ? dmy(v) : k === "art" ? artLabel(v) : k === "status" ? (STAND[v] || String(v)) : String(v);
  const diff = (felder, alt, neu, w) => Object.keys(felder).filter(k => JSON.stringify(alt?.[k] ?? null) !== JSON.stringify(neu?.[k] ?? null))
    .map(k => `${felder[k]}: ${w(k, alt?.[k])} → ${w(k, neu?.[k])}`);
  // Ein Eintrag als Text: Zeit, wer, was. Bei Änderungen die Felder vorher → nachher, beim Anlegen und Löschen der ganze Termin
  // (damit sich ein gelöschter Termin mit Uhrzeit und Notiz wieder eintragen lässt)
  function logText(x) {
    if (x.art === "projekt") {
      const t = x.nachher || x.vorher || {};
      const was = `Projekt „${t.titel || "–"}“ ${x.aktion}`;
      if (x.aktion === "geändert") return { was, details: diff(PFELD, x.vorher, x.nachher, pwert) };
      const details = Object.keys(PFELD).filter(k => k !== "titel" && t[k] != null && t[k] !== "").map(k => `${PFELD[k]}: ${pwert(k, t[k])}`);
      if (Array.isArray(t.schritte) && t.schritte.length) details.push("Schritte: " + t.schritte.map(s => s.titel + (s.erledigt ? " (erledigt)" : "")).join(", "));
      return { was, details };
    }
    if (x.art === "schritt") {
      const t = x.nachher || x.vorher || {}, a = x.vorher || {}, n = x.nachher || {};
      const wie = x.aktion === "angelegt" ? "hinzugefügt" : x.aktion === "gelöscht" ? "gestrichen"
        : a.erledigt !== n.erledigt ? (n.erledigt ? "erledigt" : "wieder offen") : "geändert";
      return { was: `Projekt „${t.projekt || "–"}“: Schritt „${t.titel || "–"}“ ${wie}`, details: a.titel && n.titel && a.titel !== n.titel ? [`Schritt: ${a.titel} → ${n.titel}`] : [] };
    }
    if (x.art !== "termin") return { was: "Zugang" + (x.person ? ` ${x.person}` : "") + `: ${x.aktion}`, details: [] };
    const t = x.nachher || x.vorher || {};
    const was = `Termin „${t.title || "–"}“ am ${dmy(t.date)} ${x.aktion}`;
    if (x.aktion === "geändert") {
      return { was, details: diff(FELD, x.vorher, x.nachher, wert) };
    }
    const zeit = t.all_day ? "ganztägig" : `${t.start_time || "–"} bis ${t.end_time || "–"} Uhr`;
    return { was, details: [`Zeit: ${zeit}`, `${FELD.cat}: ${wert("cat", t.cat)}`, `${FELD.person}: ${wert("person", t.person)}`]
      .concat(t.note ? [`${FELD.note}: ${t.note}`] : [], t.projekt_id ? [`${FELD.projekt_id}: ${wert("projekt_id", t.projekt_id)}`] : []) };
  }
  let logGen = 0, logLast = null, logBusy = false;
  async function logPage(vor, anzahl) {
    let r;
    try { r = await within(sb.rpc("kalender_protokoll", { p_vor_am: vor ? vor.am : null, p_vor_k: vor ? vor.k : null, p_anzahl: anzahl }), 20000); }
    catch { throw { status: 0 }; }
    if (r.error) throw loggedOut(r.error) ? { status: 401 } : { status: 0 };
    if (!Array.isArray(r.data)) throw { status: 403 };
    return r.data;
  }
  function logFail(e) {
    if (e && e.status === 401) { lockOut("Die Anmeldung ist abgelaufen. Bitte erneut anmelden."); return; }
    $("logErr").textContent = e && e.status === 403 ? "Das Protokoll sehen nur Verwalter mit eigenem Zugang." : "Das Protokoll konnte nicht geladen werden. Prüfe die Verbindung.";
  }
  async function loadLog(more) {
    if (logBusy) return;
    const gen = logGen;
    logBusy = true; $("logErr").textContent = ""; $("logMore").disabled = true;
    try {
      const rows = await logPage(more ? logLast : null, 100);
      if (gen !== logGen || !logDlg.open) return;
      if (!more) $("logList").replaceChildren();
      for (const x of rows) {
        const { was, details } = logText(x);
        $("logList").append(el("li", null, el("span", { class: "lt num" }, fmtStamp(x.am)), el("span", { class: "lw" }, x.wer),
          el("span", { class: "la" }, was), ...details.map(d => el("span", { class: "ld" }, d))));
      }
      if (!more && !rows.length) $("logList").append(el("li", { class: "empty" }, "Noch keine Einträge."));
      logLast = rows.length ? rows[rows.length - 1] : logLast;
      $("logMore").hidden = rows.length < 100;
    } catch (e) { if (gen === logGen) logFail(e); }
    finally { logBusy = false; $("logMore").disabled = false; }
  }
  // Als Tabelle (CSV, öffnet in Excel): alle Einträge, neueste zuerst
  const zelle = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  async function saveLog() {
    if (logBusy) return;
    const gen = logGen;
    logBusy = true; $("logCsv").disabled = true; $("logErr").textContent = "";
    try {
      const all = [];
      for (let vor = null; ;) {
        const rows = await logPage(vor, 500);
        if (gen !== logGen || !logDlg.open) return;
        all.push(...rows);
        if (rows.length < 500) break;
        vor = rows[rows.length - 1];
      }
      const lines = [["Zeit", "Wer", "Was", "Änderungen"].map(zelle).join(";")];
      for (const x of all) { const { was, details } = logText(x); lines.push([fmtWhen(x.am), x.wer, was, details.join(" | ")].map(zelle).join(";")); }
      const now = new Date();
      const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const a = el("a", { href: url, download: `Teamkalender_Protokoll_${ymd(now)}.csv` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast("Protokoll wird gespeichert. Vertraulich, enthält Kundendaten.");
    } catch (e) { if (gen === logGen) logFail(e); }
    finally { logBusy = false; $("logCsv").disabled = false; }
  }
  $("logBtn").addEventListener("click", () => {
    logGen++; logLast = null; $("logList").replaceChildren(); $("logErr").textContent = ""; $("logMore").hidden = true;
    logDlg.showModal(); loadLog(false);
  });
  $("logMore").addEventListener("click", () => loadLog(true));
  $("logCsv").addEventListener("click", saveLog);
  $("logClose").addEventListener("click", () => logDlg.close());
  // Kundendaten nur so lange auf dem Bildschirm, wie das Fenster offen ist
  logDlg.addEventListener("close", () => { logGen++; logBusy = false; $("logList").replaceChildren(); logLast = null; });
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
