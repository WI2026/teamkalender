/* Hintergrund „Sonnentag“ für den PentaWerk Teamkalender.
   Ein Einfamilienhaus wie ein weißes Architekturmodell: PV-Module auf der Südseite des Dachs, an der Hausecke eine
   Luft-Wasser-Wärmepumpe (Monoblock), deren großer Ventilator sich ruhig dreht. Wir schauen von Südsüdwesten auf das Haus,
   also nach Nordnordost: Osten liegt rechts, Westen links, die Sonne steht tagsüber meist hinter uns. Licht und Schatten
   kommen genau aus der Richtung, in der die Sonne über München gerade steht; ihr Schein fällt vom passenden Bildrand herein.
   Liefert die PV Strom, läuft ein grüner Impuls vom Modulfeld an der Hausecke ins Haus (Wechselrichter, Verteilung) und von
   dort über die Wanddurchführung zur Wärmepumpe. Abends leuchten Fenster warm, die Wärmepumpe läuft weiter.
   Zeichnung mit three.js (r128): Landschaft, Haus und Himmel werden nur bei Änderung (etwa einmal pro Minute) gezeichnet und
   gespeichert; pro Bild entstehen nur Wolken, Sonnen- und Mondscheibe und die kleinen bewegten Teile.
   Ohne WebGL dieselbe Szene als 2D-Zeichnung. */
(() => {
  "use strict";
  const RAD = Math.PI / 180, LAT = 48.14, LON = 11.58;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const fract = (x) => x - Math.floor(x);
  const hx = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const scl3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const mulv = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const nrm = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const css = (c, a) => `rgba(${Math.round(clamp(c[0], 0, 1) * 255)},${Math.round(clamp(c[1], 0, 1) * 255)},${Math.round(clamp(c[2], 0, 1) * 255)},${a === undefined ? 1 : clamp(a, 0, 1)})`;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const dirOf = (az, el) => { const a = az * RAD, e = el * RAD; return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)]; };
  const isLocked = () => !!(document.body && document.body.classList.contains("locked"));   // Anmeldeseite der App

  /* ---------- Kamera: fest im Südsüdwesten, waagerecht (senkrechte Kanten bleiben senkrecht), Ausschnitt per Objektivverschiebung ---------- */
  const CAM_AZ = 210, VIEW_AZ = 30;        // Kamera steht vom Haus aus in Richtung 210°, schaut also nach 30° (Nordnordost)
  const ANCHOR = [-0.6, 0, 2.0], CAM_D = 36, CAM_H = 11;
  const CAM = add(ANCHOR, [Math.sin(CAM_AZ * RAD) * CAM_D, CAM_H, -Math.cos(CAM_AZ * RAD) * CAM_D]);
  const FWD = [-Math.sin(CAM_AZ * RAD), 0, Math.cos(CAM_AZ * RAD)];
  const RIGHT = [-FWD[2], 0, FWD[0]];

  /* ---------- Hausmaße (m): 11 × 8 m, Traufe 5,8 m, Satteldach 35°, First Ost-West ---------- */
  const W2 = 5.5, D2 = 4, HE = 5.8, PITCH = 35 * RAD, HR = HE + D2 * Math.tan(PITCH), THK = 0.24, OVE = 0.55, OVG = 0.45;
  const LS = (D2 + OVE) / Math.cos(PITCH), EAVE_Y = HR - (D2 + OVE) * Math.tan(PITCH);
  const R0 = [0, HR, 0], NS = [0, Math.cos(PITCH), Math.sin(PITCH)], SS = [0, -Math.sin(PITCH), Math.cos(PITCH)];
  const onRoof = (x, s, lift) => [x, R0[1] + NS[1] * lift + SS[1] * s, R0[2] + NS[2] * lift + SS[2] * s];
  // PV: 2 Reihen × 9 Module hochkant (1,13 × 1,72 m), auf Schienen über der Dachhaut
  const MW = 1.134, ML = 1.722, GAP = 0.02, COLS = 9, PV_X0 = -(COLS * MW + (COLS - 1) * GAP) / 2, PV_LIFT = THK + 0.11, PV_S0 = 0.85, PV_S1 = 0.85 + 2 * ML + GAP;
  // Wärmepumpe (Monoblock mit großem Ventilator): 1,10 × 1,34 × 0,50 m auf Bodenkonsole, 0,42 m vor der Südwand nahe der Westecke
  const HP_X = -3.85, HP_Z0 = D2 + 0.42, HP_Z1 = D2 + 0.92, HP_Y0 = 0.24, HP_Y1 = 1.58;
  const FAN = [HP_X - 0.1, 1.0, HP_Z1], FAN_R = 0.34;

  function project(L, p, out) {
    const d0 = p[0] - CAM[0], d1 = p[1] - CAM[1], d2 = p[2] - CAM[2];
    const z = d0 * FWD[0] + d2 * FWD[2], x = d0 * RIGHT[0] + d2 * RIGHT[2];
    out[0] = L.cx + L.f * x / z; out[1] = L.cy - L.f * d1 / z; out[2] = z; return out;
  }
  function projN(p) { const d0 = p[0] - CAM[0], d1 = p[1] - CAM[1], d2 = p[2] - CAM[2]; const z = d0 * FWD[0] + d2 * FWD[2]; return [(d0 * RIGHT[0] + d2 * RIGHT[2]) / z, -d1 / z]; }
  // Umriss von Haus und Wärmepumpe in Kameraeinheiten (Brennweite 1, optische Mitte 0)
  const BOX = (() => {
    const pts = [[HP_X - 0.85, 0, HP_Z1 + 0.42], [HP_X + 0.85, 0, HP_Z1 + 0.42]];
    for (const sx of [-1, 1]) pts.push([sx * (W2 + OVG), HR + 0.3, 0], [sx * (W2 + OVG), EAVE_Y - 0.2, D2 + OVE + 0.16], [sx * (W2 + OVG), EAVE_Y - 0.2, -D2 - OVE], [sx * W2, 0, D2 + 0.05], [sx * W2, 0, -D2]);
    let l = 1e9, r = -1e9, t = 1e9, b = -1e9;
    for (const p of pts) { const q = projN(p); l = Math.min(l, q[0]); r = Math.max(r, q[0]); t = Math.min(t, q[1]); b = Math.max(b, q[1]); }
    return { left: l, right: r, top: t, bottom: b };
  })();

  /* Bildaufteilung nach der festen Geometrie der App (CSS-Pixel), nicht nur nach dem Seitenverhältnis:
     breit (ab 961 px): Haus in der freien Ecke rechts unter der Tagesliste; der Dachfirst bleibt unter h − 245 px
     und unter 560 px, bei niedrigen Fenstern wird das Haus kleiner statt höher.
     hoch, Anmeldung: Haus ganz unter der Anmeldekarte (Kartenunterkante ≈ Mitte + 209 px).
     hoch, Kalender: etwa 1,35-mal so groß, mittig hinter der Tagesliste, damit es durch das Glas als klare Form wirkt. */
  function layout(w, h, locked) {
    let top, bottom, cxT, maxW;
    if (w >= 961 && locked) {
      // Anmeldung am Desktop: rechts neben der Karte ist viel Platz, das Haus darf größer sein
      const left = w / 2 + 210, right = w - 16;
      bottom = h - 22; top = Math.max(h * 0.4, h - 440);
      cxT = (left + right) / 2; maxW = right - left;
    } else if (w >= 961) {
      const appR = Math.min(w - 24, (w + 1320) / 2), left = appR - 350, right = w - 14;
      bottom = h - 20; top = Math.max(560, h - 220 - 0.2 * Math.max(0, h - 900));
      if (bottom - top < 90) top = bottom - 90;
      cxT = (left + right) / 2; maxW = right - left;
    } else if (w > h * 1.1) {
      bottom = h - 10; top = h - Math.min(0.5 * h, 260);
      const left = locked ? w / 2 + 192 : w * 0.42, right = w - 12;
      cxT = (left + right) / 2; maxW = Math.max(120, right - left);
    } else if (locked) {
      bottom = h - 12; top = Math.max(h / 2 + 224, bottom - 0.3 * h);
      if (bottom - top < 70) top = bottom - 70;
      cxT = w / 2; maxW = w - 24;
    } else {
      bottom = h - 10; top = bottom - Math.min(1.35 * Math.max(110, h / 2 - 237), 0.3 * h);
      cxT = w / 2; maxW = w + 30;
    }
    const f = Math.min((bottom - top) / (BOX.bottom - BOX.top), maxW / (BOX.right - BOX.left));
    const cy = bottom - f * BOX.bottom, cx = cxT - f * (BOX.left + BOX.right) / 2;
    return { w, h, f, cx, cy, locked, top: 0, sunR: clamp(Math.min(w, h) * 0.02, 12, 18) };
  }

  /* Sonne und Mond am Bildrand: Richtung relativ zur Blickrichtung. Steht der Himmelskörper vor uns, liegt die Scheibe im Bild
     (Winkel zur Blickachse 0…90° → Bildmitte bis Rand), steht er hinter uns, sitzt sie auf dem Bildrand auf der Seite, von der
     das Licht kommt (vormittags rechts oben, nachmittags links oben, abends links tief). out[2]: Winkel zur Blickachse. */
  function skyPos(L, az, el, out) {
    const rel = ((((az - VIEW_AZ) % 360) + 540) % 360 - 180) * RAD, e = el * RAD;
    const x = Math.sin(rel) * Math.cos(e), y = Math.sin(e), z = Math.cos(rel) * Math.cos(e);
    const g = Math.acos(clamp(z, -1, 1)) / RAD, bl = Math.hypot(x, y);
    const bx = bl > 1e-5 ? x / bl : 0, by = bl > 1e-5 ? y / bl : 1;
    const ex = L.w * 0.5, eu = Math.max(40, L.cy - L.top), ed = Math.max(40, L.h - L.cy);
    const t = Math.min(Math.abs(bx) > 1e-5 ? ex / Math.abs(bx) : 1e9, Math.abs(by) > 1e-5 ? (by > 0 ? eu : ed) / Math.abs(by) : 1e9);
    const s = g <= 90 ? g / 90 : 1;
    out[0] = ex + bx * t * s; out[1] = L.cy - by * t * s; out[2] = g;
    return out;
  }
  // Scheibe zeigen, solange der Himmelskörper vor uns oder tief am Rand steht; hoch hinter uns nur sein Schein
  const discVis = (g, el) => 1 - sstep(105, 135, g) * sstep(5, 15, el);

  /* ---------- Mond (vereinfachte Bahn, auf etwa 1° genau) ---------- */
  function moonAt(date) {
    const d = (date.getTime() - 946728000000) / 86400000;
    const L = (218.316 + 13.176396 * d) * RAD, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD;
    const lam = L + 6.289 * RAD * Math.sin(M), bet = 5.128 * RAD * Math.sin(F), e = 23.439 * RAD;
    const ra = Math.atan2(Math.sin(lam) * Math.cos(e) - Math.tan(bet) * Math.sin(e), Math.cos(lam));
    const dec = Math.asin(Math.sin(bet) * Math.cos(e) + Math.cos(bet) * Math.sin(e) * Math.sin(lam));
    const H = ((18.697374558 + 24.06570982441908 * d) * 15 + LON) * RAD - ra, lat = LAT * RAD;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
    const g = (357.529 + 0.98560028 * d) * RAD, ls = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g)) * RAD;
    let elong = ((lam - ls) / RAD) % 360; if (elong < 0) elong += 360;
    return { elevation: el / RAD, azimuth: (az / RAD + 360) % 360, elong, phase: elong > 180 ? 360 - elong : elong, illum: (1 - Math.cos(elong * RAD)) / 2 };
  }

  /* ---------- Farben ---------- */
  // Laub nach Monat: zurückhaltendes Salbei/Oliv, Herbst nur als leichter Ockerton (wenig Sättigung, liest sich durch das Glas nicht als Kategorie-Orange).
  // Dezember bis März: Laubbäume kahl (nur Äste), Säulen-Eiben bleiben grün.
  const CANOPY = [null, null, null, "#b9c6a1", "#abc194", "#a2b98c", "#9fb588", "#a3b487", "#abb489", "#b5b28e", "#b0ab95", null];
  const winterOf = (month) => month === 11 || month <= 2;
  function albedo(month) {
    return {
      wall: "#f7f5f0", plinth: "#d4d0c8", roof: "#80848f", fascia: "#efede8", soffit: "#e2e0db", ridge: "#70747e",
      frame: "#4f535c", sill: "#dddbd5", door: "#6d645b", gutter: "#b7b9c0", duct: "#dcdde1", pvFrame: "#c6c9d0",
      hpCase: "#f2f2f4", hpLid: "#e2e3e7", hpSide: "#a5aab2", hpDark: "#2c2f36", hpFeet: "#9a9790", pad: "#cfccc4", pipe: "#2b2e33", cable: "#3d4047",
      trunk: "#8a7b6d", canopy: CANOPY[month] || "#a9ac99", ever: "#94a78f", shrub: "#a3b293",
      terrace: "#ebe7df", path: "#e4dfd5", lawn: "#c6cdb2", f1: "#cbd1b2", f2: "#d2cdb4", f3: "#bfcaae", f4: "#cdc8b3",
      skirt: "#c6cdb6", hill1: "#b4bfaa", hill2: "#aab6a8", treeline: "#97a593", farWall: "#f0eee9", farRoof: "#8a8d97",
    };
  }
  const DARK_TINT = hx("#1a2140"), VEG_TINT = hx("#1c4630");
  const VEG = { lawn: 1, f1: 1, f2: 1, f3: 1, f4: 1, skirt: 1, hill1: 1, hill2: 1, treeline: 1, canopy: 1, ever: 1, shrub: 1 };
  const BRIGHT = { wall: 1, plinth: 1, fascia: 1, soffit: 1, sill: 1, terrace: 1, path: 1, hpCase: 1, hpLid: 1, pad: 1, duct: 1, pvFrame: 1, gutter: 1 };
  // Dunkles Design: helle Flächen gedämpft (bleiben im Sonnenlicht warm), Vegetation nach Oliv/Grün, Rest abgedunkelt und ins Nachtblau gezogen
  const darkOf = (k, c) => VEG[k] ? mix3(mulv(c, [0.5, 0.66, 0.5]), VEG_TINT, 0.1) : BRIGHT[k] ? mix3(scl3(c, 0.7), DARK_TINT, 0.1) : mix3(scl3(c, 0.56), DARK_TINT, 0.2);
  const paletteOf = (month, dark) => { const a = albedo(month), pal = {}; for (const k in a) { const c = hx(a[k]); pal[k] = dark ? darkOf(k, c) : c; } return pal; };

  /* Himmel und Licht über der Sonnenhöhe; „dusk“ ersetzt Werte am Abend (morgens warm, abends golden/rosé).
     Helles Design: der obere Himmel bleibt immer mindestens so hell wie mittags (dunkle Schrift bleibt lesbar), Nacht nur als Lavendelton.
     Dunkles Design: Tag als tiefes Tagesblau mit warmem Sonnenschein, Nacht fast schwarz mit Sternen. */
  const KEYS_LIGHT = [
    { el: -18, top: "#cbcfea", mid: "#cccce6", hor: "#c3bfdc", sunC: "#c2cbf2", sunI: 0, hS: "#dcdef0", hG: "#bcbbd0", hI: 0.84, glowC: "#e9d8ea", glowA: 0, haze: "#d6cce4", hazeA: 0.12, stars: 0 },
    { el: -9, top: "#cbd0eb", mid: "#cecde7", hor: "#d4c9df", sunC: "#c2cbf2", sunI: 0, hS: "#dedff0", hG: "#bebdcf", hI: 0.82, glowC: "#f0d2dc", glowA: 0.14, haze: "#e2cfdc", hazeA: 0.16, stars: 0 },
    { el: -4, top: "#c8d1ed", mid: "#d6d5ea", hor: "#f0d5cf", sunC: "#ffc9a8", sunI: 0, hS: "#e4e3f0", hG: "#c9c4cb", hI: 0.78, glowC: "#ffd2b8", glowA: 0.3, haze: "#f6d6c8", hazeA: 0.2, stars: 0,
      dusk: { hor: "#f1cbc9", mid: "#d9cfe4", glowC: "#ffc4bc", haze: "#f4c8c4" } },
    { el: 0, top: "#c6d3ef", mid: "#dddcea", hor: "#f7dcc7", sunC: "#ffc49a", sunI: 0.5, hS: "#e9e9f2", hG: "#d2c8b9", hI: 0.64, glowC: "#ffd6ae", glowA: 0.4, haze: "#fadcc0", hazeA: 0.22, stars: 0,
      dusk: { hor: "#f8cfbe", mid: "#e2d3df", sunC: "#ffb48c", glowC: "#ffc4a2", haze: "#f8c8b4" } },
    { el: 5, top: "#c3d6f0", mid: "#e0e4ec", hor: "#f7e3cf", sunC: "#ffd5ad", sunI: 0.58, hS: "#eef0f6", hG: "#d9d2c1", hI: 0.64, glowC: "#ffe7cc", glowA: 0.34, haze: "#fbe4cc", hazeA: 0.16, stars: 0,
      dusk: { hor: "#f8dbc6", mid: "#e6dde4", sunC: "#ffc898", glowC: "#ffdcbc", haze: "#f8d6c0" } },
    { el: 14, top: "#b9d2ef", mid: "#d8e5f2", hor: "#eff0ea", sunC: "#fff0dc", sunI: 0.38, hS: "#f1f4f9", hG: "#dbdccc", hI: 0.78, glowC: "#fff6e6", glowA: 0.24, haze: "#fbf3e4", hazeA: 0.08, stars: 0 },
    { el: 35, top: "#b3cff0", mid: "#d3e4f4", hor: "#ecf1f3", sunC: "#fff7ea", sunI: 0.36, hS: "#f3f6fb", hG: "#dadecf", hI: 0.8, glowC: "#fffaf0", glowA: 0.24, haze: "#fbf6ec", hazeA: 0.06, stars: 0 },
  ];
  const KEYS_DARK = [
    { el: -18, top: "#04060e", mid: "#080b19", hor: "#11152a", sunC: "#8fa2e6", sunI: 0, hS: "#4e5c9c", hG: "#141826", hI: 0.85, glowC: "#1a1c35", glowA: 0, haze: "#1c2140", hazeA: 0.3, stars: 1 },
    { el: -9, top: "#060919", mid: "#0c112b", hor: "#1b1c39", sunC: "#8fa2e6", sunI: 0, hS: "#4e5c9c", hG: "#151826", hI: 0.82, glowC: "#3a2a50", glowA: 0.2, haze: "#2a2446", hazeA: 0.32, stars: 0.75 },
    { el: -4, top: "#091027", mid: "#161b3c", hor: "#3a2c4a", sunC: "#ffb488", sunI: 0, hS: "#4a5690", hG: "#17192a", hI: 0.78, glowC: "#6a4050", glowA: 0.32, haze: "#5a3a4c", hazeA: 0.32, stars: 0.3,
      dusk: { hor: "#43293f", glowC: "#6e3a48", haze: "#5a3044" } },
    { el: 0, top: "#0b132e", mid: "#1c2244", hor: "#523a48", sunC: "#ffb07c", sunI: 0.62, hS: "#46508a", hG: "#1d1d2b", hI: 0.72, glowC: "#b8704a", glowA: 0.38, haze: "#8a5548", hazeA: 0.32, stars: 0.05,
      dusk: { hor: "#5a3240", sunC: "#ff9f78", glowC: "#b05a4a", haze: "#844a4a" } },
    { el: 5, top: "#0c1838", mid: "#1f2c55", hor: "#4e4a5a", sunC: "#ffc898", sunI: 0.92, hS: "#46568f", hG: "#262a2a", hI: 0.7, glowC: "#d48c52", glowA: 0.34, haze: "#a07050", hazeA: 0.28, stars: 0,
      dusk: { hor: "#553a46", glowC: "#c8704e", haze: "#94584c" } },
    { el: 14, top: "#0e2659", mid: "#1b407c", hor: "#3c6294", sunC: "#ffd9a6", sunI: 1.05, hS: "#4a5f98", hG: "#2d3529", hI: 0.72, glowC: "#ffcf7a", glowA: 0.3, haze: "#c89a5e", hazeA: 0.16, stars: 0 },
    { el: 35, top: "#0f2a63", mid: "#1c4685", hor: "#3d6aa0", sunC: "#ffe2b6", sunI: 1.08, hS: "#4b629d", hG: "#2d3529", hI: 0.72, glowC: "#ffd27e", glowA: 0.28, haze: "#c8a06a", hazeA: 0.14, stars: 0 },
  ];
  const parseKeys = (list) => list.map((k) => { const o = {}; for (const f in k) { if (f === "dusk") { o.dusk = {}; for (const g in k.dusk) o.dusk[g] = hx(k.dusk[g]); } else o[f] = typeof k[f] === "string" ? hx(k[f]) : k[f]; } return o; });
  const KL = parseKeys(KEYS_LIGHT), KD = parseKeys(KEYS_DARK);
  const FIELDS = ["top", "mid", "hor", "sunC", "sunI", "hS", "hG", "hI", "glowC", "glowA", "haze", "hazeA", "stars"];
  function sampleKeys(keys, el, w) {
    let i = 0; while (i < keys.length - 2 && el > keys[i + 1].el) i++;
    const a = keys[i], b = keys[i + 1], t = sstep(0, 1, (el - a.el) / (b.el - a.el));
    const v = (k, f) => { const base = k[f], d = k.dusk && k.dusk[f]; return d ? mix3(base, d, w) : base; };
    const o = {};
    for (const f of FIELDS) { const va = v(a, f), vb = v(b, f); o[f] = typeof va === "number" ? lerp(va, vb, t) : mix3(va, vb, t); }
    return o;
  }

  // Fenstergruppen: 0 Wohnen/Essen (EG), 1 Kinder/Schlafen (OG), 2 Küche (EG West), 3 Bad/Treppe. Werte 0…1 nach Uhrzeit und Helligkeit
  function windowTargets(now, sunEl) {
    const h = now.getHours() + now.getMinutes() / 60, dk = 1 - sstep(-3, 5, sunEl);
    const on = (a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);
    return [
      dk * (on(16.5, 23) || on(6.5, 7.75) ? 1 : 0),
      dk * (on(19, 21.25) || on(6.25, 7) ? 1 : 0),
      dk * (on(17, 21.5) || on(5.75, 7.5) ? 1 : 0),
      dk * (on(18, 22.25) || on(6, 6.75) ? 0.5 : 0),
    ];
  }

  // Alles, was sich aus Sonne, Mond, Uhrzeit, Monat und Design ergibt (einmal pro Minute berechnet)
  function computeLook(st) {
    const sun = st.sun, el = sun.elevation, dark = st.dark, month = st.now.getMonth();
    const dusk = sstep(150, 210, sun.azimuth);
    const k = sampleKeys(dark ? KD : KL, el, dusk);
    const moon = moonAt(st.now);
    const night = 1 - sstep(-8, 2, el);
    const moonUp = sstep(-1, 4, moon.elevation);
    const moonI = moonUp * night * (0.25 + 0.75 * moon.illum);
    const L = { dark, el, az: sun.azimuth, k, moon, night, moonUp, moonI, month, winter: winterOf(month) };
    // Licht: Sonne, nachts der Mond (kühl und schwach)
    const sunI = k.sunI * sstep(-0.6, 2.4, el);
    if (sunI > 0.02 || moonI < 0.05) { L.lightDir = dirOf(sun.azimuth, Math.max(el, 1.5)); L.lightC = k.sunC; L.lightI = sunI; L.shadowOn = sunI > 0.02; L.shadowStep = 0.2; }
    else { L.lightDir = dirOf(moon.azimuth, Math.max(moon.elevation, 6)); L.lightC = dark ? hx("#8fa2e6") : hx("#c9d0f0"); L.lightI = moonI * (dark ? 0.3 : 0.22); L.shadowOn = true; L.shadowStep = 1; }
    L.pv = sstep(1, 16, el);                       // PV-Leistung folgt der Sonnenhöhe
    L.windows = windowTargets(st.now, el);
    L.windowC = dark ? hx("#e9b98a") : hx("#ffcf96");
    L.windowI = dark ? 0.68 : 0.9;
    L.glassDay = mix3(k.top, k.hor, 0.4);
    // Wolken: helle Oberseite, flache Unterseite; im dunklen Design nur wenig heller als der Himmel
    if (dark) { L.cloudLit = scl3(mix3(k.mid, k.hor, 0.7), lerp(1.14, 1.08, night)); L.cloudBase = mix3(k.top, k.mid, 0.8); L.cloudA = lerp(0.42, 0.3, night); }
    else { L.cloudLit = mix3(mix3([1, 1, 1], k.sunC, 0.22 * (1 - night)), k.hor, night * 0.45); L.cloudBase = scl3(mix3(k.top, k.mid, 0.45), 0.965); L.cloudA = lerp(0.8, 0.5, night); }
    // Sonne: kleiner heller Kern, zweistufiger warmer Schein
    const low = 1 - sstep(4, 20, el);
    L.sunCore = dark ? mix3(hx("#fff8ea"), k.sunC, 0.35 * low) : mix3([1, 1, 1], k.sunC, 0.55 * low);
    L.corona = dark ? 0.34 : lerp(0.12, 0.26, low);
    L.sunA = sstep(-1.2, 0.6, el);
    L.glowR = lerp(1, 1.7, low);
    L.glowA = k.glowA * sstep(-10, -1, el + 9 * (1 - night)); L.glowA2 = L.glowA * 0.42;
    // Mond
    L.moonA = moonUp * sstep(0.15, 0.9, night);
    L.moonC = dark ? hx("#e6eaf5") : hx("#fcfcff");
    L.moonGlow = L.moonA * (dark ? 0.07 : 0.05);
    // Energie, Luft, Glanz
    L.beadC = dark ? hx("#7fd08a") : hx("#2c9a47");
    L.pvBase = dark ? 0.26 : 0.22;
    L.flowC = dark ? hx("#86aedd") : hx("#cfe6fb");
    L.flowA = dark ? 0.42 : 0.62;
    L.sheenA = dark ? 0.11 : 0.13;
    L.fanW = 0.75 + 0.55 * L.pv;                  // läuft rund um die Uhr, tagsüber mit PV-Strom etwas kräftiger
    L.vapour = (month >= 10 || month <= 2) && (night > 0.3 || el < 8);   // sichtbarer Dampf nur in kalten Monaten
    L.vapC = dark ? hx("#8ea4c8") : hx("#ffffff");
    L.vapA = dark ? 0.14 : 0.32;
    return L;
  }

  /* ---------- Szene als Flächenliste (gemeinsam für WebGL und 2D, Reihenfolge = Malreihenfolge für 2D) ---------- */
  const UV4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const ICO = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(nrm);
    const T = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].map((f) => f.map((i) => V[i]));
    const split = (L) => { const o = []; for (const [a, b, c] of L) { const ab = nrm(add(a, b)), bc = nrm(add(b, c)), ca = nrm(add(c, a)); o.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); } return o; };
    const s1 = split(T);
    return { 0: T, 1: s1, 2: split(s1) };
  })();

  function buildWorld(det) {
    const W = { cast: [], ground: [], far: [], pv: [], glass: [[], [], [], []], ao: [], shadowCasters: [], ridges: [], farObjs: [] };
    let cur = W.cast, tag = null;
    const face = (m, p, uv, list) => { const n = nrm(crs(sub(p[1], p[0]), sub(p[2], p[0]))); const f = { m, p, n, uv: uv || null }; if (tag) f.tag = tag; (list || cur).push(f); return f; };
    const faceOut = (m, p, inside) => { let n = nrm(crs(sub(p[1], p[0]), sub(p[2], p[0]))); const c = p.reduce((s, q) => add(s, mul(q, 1 / p.length)), [0, 0, 0]); if (dot(n, sub(c, inside)) < 0) { p = p.slice().reverse(); n = mul(n, -1); } const f = { m, p, n, uv: null }; if (tag) f.tag = tag; cur.push(f); return f; };
    // Quader mit beliebigen (rechtshändigen) Achsen; m: Material oder sechs Materialien [+X,-X,+Y,-Y,+Z,-Z]
    function obox(m, c, ax, ay, az, h1, h2, h3, skip) {
      const ms = Array.isArray(m) ? m : [m, m, m, m, m, m];
      const defs = [[ax, h1, ay, h2, az, h3], [mul(ax, -1), h1, az, h3, ay, h2], [ay, h2, az, h3, ax, h1], [mul(ay, -1), h2, ax, h1, az, h3], [az, h3, ax, h1, ay, h2], [mul(az, -1), h3, ay, h2, ax, h1]];
      for (let i = 0; i < 6; i++) {
        if (skip && skip.indexOf(i) >= 0) continue;
        const d = defs[i], cc = add(c, mul(d[0], d[1])), a = mul(d[2], d[3]), b = mul(d[4], d[5]);
        const f = face(ms[i], [sub(sub(cc, a), b), sub(add(cc, a), b), add(add(cc, a), b), add(sub(cc, a), b)], UV4);
        f.mi = i;
        if (ms[i] === "pv") { f.gl = false; W.pv.push(f); }
      }
    }
    const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
    const box = (m, x0, y0, z0, x1, y1, z1, skip) => obox(m, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], X, Y, Z, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, skip);
    function stick(m, a, b, r) {   // vierkantiger Ast von a nach b
      const d = nrm(sub(b, a)), u = nrm(Math.abs(d[1]) < 0.95 ? crs(d, Y) : crs(d, X)), v = crs(u, d);
      obox(m, mul(add(a, b), 0.5), u, d, v, r, len3(sub(b, a)) / 2, r);
    }
    function ellipsoid(m, c, rx, ry, rz) {
      for (const tri of ICO[det]) {
        const f = face(m, tri.map((q) => [c[0] + q[0] * rx, c[1] + q[1] * ry, c[2] + q[2] * rz]));
        if (det > 1) f.vn = tri.map((q) => nrm([q[0] / rx, q[1] / ry, q[2] / rz]));
      }
    }
    function trunk(m, c, h, r0, r1) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, b = ((i + 1) / 6) * Math.PI * 2;
        faceOut(m, [[c[0] + Math.cos(a) * r0, 0, c[2] + Math.sin(a) * r0], [c[0] + Math.cos(b) * r0, 0, c[2] + Math.sin(b) * r0], [c[0] + Math.cos(b) * r1, h, c[2] + Math.sin(b) * r1], [c[0] + Math.cos(a) * r1, h, c[2] + Math.sin(a) * r1]], [c[0], h / 2, c[2]]);
      }
    }
    // Eine Baumsprache passend zum Modellhaus: glatte, matte Formen. decid = Laubbaum (Ovoid, im Winter kahl), ever = Säulen-Eibe, shrub = Strauch
    function tree(c, h, rx, ry, kind, seed) {
      const start = cur.length, cy = h - ry;
      if (kind === "decid") {
        trunk("trunk", c, cy - ry * 0.3, rx * 0.075, rx * 0.05);
        tag = "crown"; ellipsoid("canopy", [c[0], cy, c[2]], rx, ry, rx); tag = null;
        tag = "bare";
        const R = rng(seed), base = [c[0], cy - ry * 0.3, c[2]];
        stick("trunk", base, [c[0], cy + ry * 0.6, c[2]], rx * 0.035);
        for (let i = 0; i < 6; i++) {
          const a = seed + i * 2.39996, r = rx * (0.55 + 0.25 * R()), up = ry * (-0.1 + 0.75 * R());
          const a0 = [c[0], cy - ry * 0.25 + i * ry * 0.12, c[2]];
          stick("trunk", a0, [c[0] + Math.cos(a) * r, cy + up, c[2] + Math.sin(a) * r], rx * 0.022);
        }
        tag = null;
      } else if (kind === "ever") {
        trunk("trunk", c, ry * 0.3, rx * 0.12, rx * 0.1);
        ellipsoid("ever", [c[0], cy, c[2]], rx, ry, rx);
      } else ellipsoid("shrub", [c[0], ry * 0.82, c[2]], rx, ry, rx);
      W.ao.push({ x: c[0], z: c[2], sx: rx * 2.3, sz: rx * 2.3, a: 0.45 });
      for (let i = start; i < cur.length; i++) if (cur[i].m !== "trunk" || cur[i].tag !== "bare") W.shadowCasters.push(cur[i]);
    }
    function gableHouse(m, mr, x, z, w2, d2, he, rot) {
      const hr = he + d2 * Math.tan(PITCH), c = Math.cos(rot), s = Math.sin(rot), o = 0.45;
      const P = (u, y, v) => [x + u * c - v * s, y, z + u * s + v * c];
      const inside = P(0, he * 0.5, 0);
      faceOut(m, [P(-w2, 0, d2), P(w2, 0, d2), P(w2, he, d2), P(-w2, he, d2)], inside);
      faceOut(m, [P(-w2, 0, -d2), P(w2, 0, -d2), P(w2, he, -d2), P(-w2, he, -d2)], inside);
      faceOut(m, [P(-w2, 0, -d2), P(-w2, 0, d2), P(-w2, he, d2), P(-w2, hr, 0), P(-w2, he, -d2)], inside);
      faceOut(m, [P(w2, 0, -d2), P(w2, 0, d2), P(w2, he, d2), P(w2, hr, 0), P(w2, he, -d2)], inside);
      const ey = he - o * Math.tan(PITCH);
      faceOut(mr, [P(-w2 - o, ey, d2 + o), P(w2 + o, ey, d2 + o), P(w2 + o, hr + 0.15, 0), P(-w2 - o, hr + 0.15, 0)], P(0, 0, 0));
      faceOut(mr, [P(-w2 - o, ey, -d2 - o), P(w2 + o, ey, -d2 - o), P(w2 + o, hr + 0.15, 0), P(-w2 - o, hr + 0.15, 0)], P(0, 0, 0));
    }

    /* Ferne: Hügel, Waldstreifen, Felder, Nachbarhäuser (ohne Schatten) */
    cur = W.far;
    const fwdAng = Math.atan2(FWD[0], -FWD[2]);
    const camFace = (m, p) => { const nn = nrm(crs(sub(p[1], p[0]), sub(p[2], p[0]))); const q = dot(nn, sub(CAM, p[0])) < 0 ? p.slice().reverse() : p; const f = face(m, q); f.ridge = true; f.n = m === "treeline" ? [0, 1, 0] : nrm(add(f.n, [0, 1.6, 0])); return f; };
    function hills(r, depth, hmax, seed, m, span) {
      const n = 64, T = [], B = [];
      for (let i = 0; i <= n; i++) {
        const a = fwdAng + (i / n - 0.5) * span * RAD;
        const hgt = hmax * (0.55 + 0.25 * Math.sin(i * 0.37 + seed) + 0.2 * Math.sin(i * 0.11 + seed * 2.1) + 0.1 * Math.sin(i * 0.83 + seed * 0.7));
        const dir = [Math.sin(a), 0, -Math.cos(a)];
        B.push(add(CAM, [dir[0] * (r - depth), -CAM[1] - 1, dir[2] * (r - depth)])); T.push(add(CAM, [dir[0] * r, hgt - CAM[1], dir[2] * r]));
        if (i) camFace(m, [B[i - 1], B[i], T[i], T[i - 1]]);
      }
      W.ridges.push({ m, t: T, b: B, d: r });
    }
    // Waldstreifen: weiche, gedämpfte Baumreihen auf dem flachen Land vor den Hügeln
    function treeline(r, hmin, hmax, span, seed, m) {
      const n = 900; let T = null, B = null;
      const flush = () => { if (T && T.length > 2) W.ridges.push({ m, t: T, b: B, d: r }); T = B = null; };
      for (let i = 0; i <= n; i++) {
        const u = i / n, a = fwdAng + (u - 0.5) * span * RAD;
        const wood = Math.sin(u * 9.3 + seed) + 0.6 * Math.sin(u * 23.1 + seed * 1.7);
        if (wood < 0.2) { flush(); continue; }
        const crowns = u * 150 + 2.2 * Math.sin(u * 37 + seed) + 1.1 * Math.sin(u * 91 + seed * 1.3), ci = Math.floor(crowns);
        const cr = Math.sqrt(Math.abs(Math.sin(crowns * Math.PI))), hv = fract(Math.sin(ci * 12.9898 + seed * 7.1) * 43758.5);   // runde Baumkronen, unterschiedlich hoch
        const bump = (0.7 + cr * (0.18 + 0.3 * hv)) * (0.88 + 0.12 * Math.sin(u * 63 + seed * 2.3));
        const hh = lerp(hmin, hmax, sstep(0.2, 1.0, wood)) * bump * sstep(0.2, 0.32, wood);
        const dir = [Math.sin(a), 0, -Math.cos(a)];
        const t = add(CAM, [dir[0] * r, hh - CAM[1], dir[2] * r]), b = add(CAM, [dir[0] * (r - 4), -0.6 - CAM[1], dir[2] * (r - 4)]);
        if (!T) { T = []; B = []; }
        if (T.length) camFace(m, [B[B.length - 1], b, t, T[T.length - 1]]);
        T.push(t); B.push(b);
      }
      flush();
    }
    hills(720, 260, 46, 1.3, "hill2", 170);
    hills(420, 160, 22, 4.1, "hill1", 170);
    treeline(330, 9, 15, 150, 2.2, "treeline");
    treeline(215, 8, 13, 130, 5.9, "treeline");
    // Felder (fern, große Schläge) und Rasen am Haus (nah, empfängt Schatten)
    const R = rng(11), cell = 90;
    for (let i = -12; i < 12; i++) for (let j = -20; j < 2; j++) {
      const x0 = i * cell, z0 = j * cell, x1 = x0 + cell, z1 = z0 + cell;
      const r = R(), m = r < 0.3 ? "f1" : r < 0.5 ? "f2" : r < 0.75 ? "f3" : "f4";
      if (x0 >= -180 && x1 <= 180 && z0 >= -180 && z1 <= 180) {
        for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) { const u0 = x0 + a * 10, v0 = z0 + b * 10; face("lawn", [[u0, 0, v0 + 10], [u0 + 10, 0, v0 + 10], [u0 + 10, 0, v0], [u0, 0, v0]], null, W.ground); }
      } else face(m, [[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0]], null, W.far);
    }
    face("skirt", [[-6000, -1.5, 600], [6000, -1.5, 600], [6000, -1.5, -6000], [-6000, -1.5, -6000]], null, W.far).skirt = true;
    // Nachbarhäuser mit Satteldach in derselben Neigung (Position als Bildrichtung a und Entfernung D)
    for (const [a, D, rot] of [[-0.62, 215, 0.12], [0.2, 250, -0.18], [-1.25, 170, 0.3], [-0.98, 290, -0.05]]) {
      const dir = nrm(add(FWD, mul(RIGHT, a))), p = add(CAM, mul(dir, D));
      const start = W.far.length;
      gableHouse("farWall", "farRoof", p[0], p[2], 5, 4, 5.4, rot);
      W.farObjs.push({ d: D, faces: W.far.slice(start) });
    }

    /* Nahbereich: Terrasse, Wege (empfangen Schatten) */
    cur = W.ground;
    box("terrace", 0.1, 0, 4.0, 4.9, 0.08, 7.0, [3]);
    box("path", -9.5, 0, -2.75, -5.5, 0.03, -1.55, [3]);
    box("path", -9.5, 0, -2.75, -8.3, 0.03, 13, [3]);

    // Nahe Objekte nach Entfernung von der Kamera sortiert (für die 2D-Malreihenfolge)
    cur = W.cast;
    const near = [];
    const camDist = (x, z) => Math.hypot(x - CAM[0], z - CAM[2]);
    const treeAt = (x, z, h, rx, ry, kind, seed) => near.push({ d: camDist(x, z), f: () => tree([x, 0, z], h, rx, ry, kind, seed) });
    treeAt(3.2, -10.5, 11.6, 3.0, 3.6, "decid", 3);   // hinter dem Haus, ragt über den First
    treeAt(-10.2, -5.5, 8.4, 2.3, 2.7, "decid", 7);
    treeAt(-8.3, 0.6, 7.2, 0.95, 3.0, "ever", 0);
    treeAt(-9.1, 2.6, 5.4, 0.78, 2.2, "ever", 0);
    treeAt(8.4, 6.2, 5.8, 1.75, 1.95, "decid", 5);
    treeAt(6.3, 5.1, 0, 0.8, 0.6, "shrub", 0);
    treeAt(-6.6, -4.9, 0, 0.75, 0.55, "shrub", 0);

    near.push({ d: camDist(0, 0), f: () => {
      const inside = [0, 2, 0], start = cur.length;
      faceOut("wall", [[-W2, 0, D2], [W2, 0, D2], [W2, HE, D2], [-W2, HE, D2]], inside);
      faceOut("wall", [[-W2, 0, -D2], [W2, 0, -D2], [W2, HE, -D2], [-W2, HE, -D2]], inside);
      faceOut("wall", [[-W2, 0, -D2], [-W2, 0, D2], [-W2, HE, D2], [-W2, HR, 0], [-W2, HE, -D2]], inside);
      faceOut("wall", [[W2, 0, -D2], [W2, 0, D2], [W2, HE, D2], [W2, HR, 0], [W2, HE, -D2]], inside);
      box("plinth", -W2 - 0.03, 0, -D2 - 0.03, W2 + 0.03, 0.38, D2 + 0.03, [2, 3]);
      W.ao.push({ x: 0, z: 0, sx: 2 * W2 + 2.2, sz: 2 * D2 + 2.2, a: 0.55, rect: true });
      // Dachflächen
      const Ls = LS, nN = [0, Math.cos(PITCH), -Math.sin(PITCH)], sN = [0, -Math.sin(PITCH), -Math.cos(PITCH)];
      obox(["fascia", "fascia", "roof", "soffit", "fascia", "roof"], add(add(R0, mul(SS, Ls / 2)), mul(NS, THK / 2)), X, NS, SS, W2 + OVG, THK / 2, Ls / 2);
      obox(["fascia", "fascia", "roof", "soffit", "fascia", "roof"], add(add(R0, mul(sN, Ls / 2)), mul(nN, THK / 2)), [-1, 0, 0], nN, sN, W2 + OVG, THK / 2, Ls / 2);
      box("ridge", -W2 - OVG - 0.02, HR + 0.06, -0.2, W2 + OVG + 0.02, HR + 0.3, 0.2, [3]);
      // Dachrinne und Fallrohr an der Westecke
      box("gutter", -W2 - OVG, EAVE_Y - 0.2, D2 + OVE - 0.02, W2 + OVG, EAVE_Y - 0.04, D2 + OVE + 0.16, [3]);
      box("gutter", -W2 + 0.12, 0.1, D2 + 0.03, -W2 + 0.22, EAVE_Y - 0.35, D2 + 0.13, [3]);
      W.shadowCasters.push(...cur.slice(start).filter((f) => f.m === "wall" || f.m === "fascia" || f.m === "roof" || f.m === "ridge"));
      // PV-Module
      for (let r = 0; r < 2; r++) for (let c = 0; c < COLS; c++) {
        const sc = PV_S0 + r * (ML + GAP) + ML / 2, xc = PV_X0 + c * (MW + GAP) + MW / 2;
        obox(["pvFrame", "pvFrame", "pv", "pvFrame", "pvFrame", "pvFrame"], add(onRoof(xc, sc, PV_LIFT), [0, 0, 0]), X, NS, SS, MW / 2, 0.02, ML / 2, [3]);
      }
      // Kabelkanal: vom Modulfeld übers Dach zur Traufe, dann neben dem Fallrohr die Wand hinunter bis zum Hausanschlussraum
      const sMid = (PV_S1 + LS - 0.1) / 2;
      obox("duct", onRoof(-4.96, sMid, THK + 0.025), X, NS, SS, 0.04, 0.025, (LS - 0.1 - PV_S1) / 2, [3]);
      box("duct", -5.08, 1.2, D2, -5.0, EAVE_Y - 0.25, D2 + 0.05, [3]);
      box("duct", -5.11, 1.1, D2, -4.97, 1.3, D2 + 0.07, [3]);
      // Fenster, Türen: auf Wandflächen (u waagerecht, v senkrecht, n nach außen); Glas vor dem Rahmen (2D-Reihenfolge)
      const southW = { o: [0, 0, D2], u: X, v: Y, n: Z }, westW = { o: [-W2, 0, 0], u: Z, v: Y, n: [-1, 0, 0] };
      const WP = (w, a, b, off) => add(add(add(w.o, mul(w.u, a)), mul(w.v, b)), mul(w.n, off));
      function opening(w, u0, u1, v0, v1, gi, opt) {
        opt = opt || {};
        const pts = [WP(w, u0, v0, 0.015), WP(w, u1, v0, 0.015), WP(w, u1, v1, 0.015), WP(w, u0, v1, 0.015)];
        if (gi === "door") face("door", pts);
        else { const f = face("glass", pts, UV4); f.gl = false; f.g = gi; W.glass[gi].push(f); }
        const t = 0.07, dp = 0.05, fb = (a0, a1, b0, b1) => obox("frame", WP(w, (a0 + a1) / 2, (b0 + b1) / 2, dp / 2), w.u, w.v, w.n, (a1 - a0) / 2, (b1 - b0) / 2, dp / 2, [5]);
        fb(u0 - t, u1 + t, v1, v1 + t); fb(u0 - t, u0, v0, v1); fb(u1, u1 + t, v0, v1);
        if (opt.sill) obox("sill", WP(w, (u0 + u1) / 2, v0 - 0.04, 0.07), w.u, w.v, w.n, (u1 - u0) / 2 + 0.1, 0.04, 0.07, [5]);
        else fb(u0 - t, u1 + t, v0 - t, v0);
        for (const m of opt.mull || []) fb(m - 0.035, m + 0.035, v0, v1);
      }
      opening(southW, -2.0, -0.7, 0.95, 2.3, 0, { sill: true });
      opening(southW, 0.45, 3.65, 0.12, 2.35, 0, { mull: [2.05] });
      opening(southW, -4.15, -2.95, 3.55, 4.85, 1, { sill: true });
      opening(southW, -2.0, -0.7, 3.55, 4.85, 3, { sill: true });
      opening(southW, 0.45, 3.65, 3.55, 4.85, 1, { sill: true, mull: [1.52, 2.58] });
      opening(westW, 0.6, 2.4, 0.95, 2.3, 2, { sill: true, mull: [1.5] });
      opening(westW, 0.6, 2.4, 3.55, 4.85, 1, { sill: true, mull: [1.5] });
      opening(westW, -2.75, -1.65, 3.55, 4.85, 3, { sill: true });
      opening(westW, -0.45, 0.45, 6.25, 7.25, 1, { sill: true });
      opening(westW, -2.75, -1.65, 0.12, 2.35, "door", {});
      opening(westW, -2.55, -1.85, 1.55, 2.15, 3, {});     // Lichtausschnitt in der Haustür
      obox("fascia", WP(westW, -2.2, 2.62, 0.55), westW.u, westW.v, westW.n, 0.95, 0.06, 0.55);   // Vordach

      /* Wärmepumpe: Kiesbett, Betonsockel, Gehäuse; Ventilator vorn, Lufteintritt (Verdampfer) an der Seite */
      const hs = cur.length;
      box("pad", HP_X - 0.85, 0, HP_Z0 - 0.3, HP_X + 0.85, 0.06, HP_Z1 + 0.42, [3]);
      W.ao.push({ x: HP_X, z: (HP_Z0 + HP_Z1) / 2, sx: 1.9, sz: 1.3, a: 0.5, rect: true });
      box("hpFeet", HP_X - 0.5, 0.06, HP_Z0 - 0.03, HP_X - 0.34, HP_Y0, HP_Z1 + 0.03, [3]);
      box("hpFeet", HP_X + 0.34, 0.06, HP_Z0 - 0.03, HP_X + 0.5, HP_Y0, HP_Z1 + 0.03, [3]);
      box(["hpCase", "hpSide", "hpLid", "hpCase", "hpCase", "hpCase"], HP_X - 0.55, HP_Y0, HP_Z0, HP_X + 0.55, HP_Y1, HP_Z1);
      W.shadowCasters.push(...cur.slice(hs + 6 * 3 - 18 + 1).filter((f) => f.m === "hpCase" || f.m === "hpSide" || f.m === "hpLid"));
      box("hpLid", HP_X - 0.575, HP_Y1, HP_Z0 - 0.025, HP_X + 0.575, HP_Y1 + 0.04, HP_Z1 + 0.025, [3]);
      box("hpDark", HP_X + 0.3, HP_Y0 + 0.08, HP_Z1, HP_X + 0.315, HP_Y1 - 0.08, HP_Z1 + 0.006, [3, 5]);      // Fuge der Serviceklappe
      for (let y = HP_Y0 + 0.16; y < HP_Y1 - 0.12; y += 0.11) box("hpDark", HP_X - 0.557, y, HP_Z0 + 0.06, HP_X - 0.55, y + 0.022, HP_Z1 - 0.06, [0, 2, 3]);   // Lamellen
      // Hydraulik (zwei gedämmte Leitungen) und Stromleitung von der Geräteseite durch die Wand ins Haus
      const zc = (HP_Z0 + HP_Z1) / 2;
      for (const y of [0.4, 0.54]) { box("pipe", HP_X - 0.84, y, zc - 0.04, HP_X - 0.55, y + 0.08, zc + 0.04); box("pipe", HP_X - 0.84, y, D2, HP_X - 0.76, y + 0.08, zc + 0.04); }
      box("cable", HP_X - 0.79, 0.8, zc - 0.018, HP_X - 0.55, 0.835, zc + 0.018); box("cable", HP_X - 0.79, 0.8, D2, HP_X - 0.755, 0.835, zc + 0.018);
      box("plinth", HP_X - 0.9, 0.34, D2, HP_X - 0.7, 0.88, D2 + 0.04, [3]);   // Wanddurchführung
    } });
    near.sort((a, b) => b.d - a.d).forEach((o) => o.f());

    // Leitungsweg für den Energieimpuls. Abschnitt 1: Modulfeld → Dach → Traufe → Wand neben dem Fallrohr → ins Haus.
    // Abschnitt 2: aus der Wanddurchführung an der Wärmepumpe entlang der Stromleitung ins Gerät. vis 0 = verdeckt (unter dem Dachüberstand).
    W.path1 = [onRoof(-4.96, PV_S1 + 0.02, THK + 0.07), onRoof(-4.96, LS - 0.14, THK + 0.07), [-5.04, EAVE_Y + 0.25, D2 + OVE + 0.24], [-5.04, EAVE_Y - 0.3, D2 + 0.09],
      [-5.04, EAVE_Y - 0.6, D2 + 0.09], [-5.04, 1.22, D2 + 0.09], [-5.04, 1.2, D2 + 0.01]];
    W.vis1 = [1, 1, 0, 0, 1, 1, 0];
    const zc = (HP_Z0 + HP_Z1) / 2;
    W.path2 = [[HP_X - 0.77, 0.82, D2 + 0.0], [HP_X - 0.77, 0.82, D2 + 0.12], [HP_X - 0.77, 0.82, zc], [HP_X - 0.56, 0.82, zc], [HP_X - 0.5, 0.82, zc]];
    W.vis2 = [0, 1, 1, 1, 0];
    // Luftstrom aus dem Ventilator: drei leicht gebogene, nach vorn auslaufende Linien
    W.flow = [[-0.17, 0.13], [0.02, -0.02], [0.2, -0.15]].map(([dx, dy], k) => {
      const pts = []; for (let i = 0; i <= 10; i++) { const u = (i / 10) * 1.7; pts.push([FAN[0] + dx * (1 + 0.45 * u) - 0.05 * u, FAN[1] + dy * (1 + 0.2 * u) - 0.06 * u * u + 0.02 * k, FAN[2] + 0.06 + u]); }
      return pts;
    });
    // Glanzfläche über dem Modulfeld
    W.pvQuad = [onRoof(PV_X0, PV_S0, PV_LIFT + 0.05), onRoof(-PV_X0, PV_S0, PV_LIFT + 0.05), onRoof(-PV_X0, PV_S1, PV_LIFT + 0.05), onRoof(PV_X0, PV_S1, PV_LIFT + 0.05)];
    return W;
  }
  // Bogenlängen eines Linienzugs
  function arcs(P) { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + len3(sub(P[i], P[i - 1]))); return s; }

  /* ---------- Texturen (einmal per Canvas erzeugt) ---------- */
  function canvasOf(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function pvCanvas() {
    // u (Breite) = entlang der Dachneigung (10 Zellen), v (Höhe) = quer (6 Zellen); dünner Silberrahmen
    const c = canvasOf(256, 128), g = c.getContext("2d");
    g.fillStyle = "#c9ccd3"; g.fillRect(0, 0, 256, 128);
    const fr = 5, cw = (256 - 2 * fr) / 10, ch = (128 - 2 * fr) / 6;
    g.fillStyle = "#3a4a74"; g.fillRect(fr, fr, 256 - 2 * fr, 128 - 2 * fr);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) {
      const x = fr + i * cw + 0.8, y = fr + j * ch + 0.8, gr = g.createLinearGradient(x, y, x + cw, y + ch);
      gr.addColorStop(0, "#22325c"); gr.addColorStop(1, "#1a2749"); g.fillStyle = gr; g.fillRect(x, y, cw - 1.6, ch - 1.6);
    }
    g.fillStyle = "rgba(150,165,205,0.18)"; for (let j = 0; j < 6; j++) for (const k of [0.33, 0.66]) g.fillRect(fr, fr + j * ch + ch * k, 256 - 2 * fr, 0.8);
    g.fillStyle = "#dfe1e6"; g.fillRect(0, 0, 256, 2); g.fillRect(0, 0, 2, 128);
    return c;
  }
  function softCanvas(n, stops) { const c = canvasOf(n, n), g = c.getContext("2d"), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`)); g.fillStyle = gr; g.fillRect(0, 0, n, n); return c; }
  function aoCanvas() {
    const n = 64, c = canvasOf(n, n), g = c.getContext("2d"), img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = sstep(0, 0.42, Math.min(x + 0.5, n - x - 0.5) / n), fy = sstep(0, 0.42, Math.min(y + 0.5, n - y - 0.5) / n), i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * fx * fy);
    }
    g.putImageData(img, 0, 0); return c;
  }
  // Ventilatorflügel: drei breite, gesichelte Blätter (Einheitskreis)
  function fanBladePolys(r) {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const base = k * 2 * Math.PI / 3, lead = [], trail = [], n = 10;
      for (let i = 0; i <= n; i++) {
        const u = i / n, rr = r * (0.2 + 0.8 * u), sw = 0.55 * u, wd = 0.5 + 0.55 * u - 0.3 * u * u * u;
        lead.push([Math.cos(base + sw) * rr, Math.sin(base + sw) * rr]);
        trail.push([Math.cos(base + sw - wd) * rr, Math.sin(base + sw - wd) * rr]);
      }
      out.push(lead.concat(trail.reverse()));
    }
    return out;
  }
  function rotorCanvas() {
    const n = 256, c = canvasOf(n, n), g = c.getContext("2d"), r = n / 2;
    g.translate(r, r); g.fillStyle = "#ffffff";
    for (const poly of fanBladePolys(r * 0.93)) { g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
    g.beginPath(); g.arc(0, 0, r * 0.22, 0, Math.PI * 2); g.fill();
    return c;
  }
  function grilleCanvas() {
    // Schutzgitter: Ringe und vier Streben (weiß, eingefärbt über das Material)
    const n = 256, c = canvasOf(n, n), g = c.getContext("2d"), r = n / 2;
    g.strokeStyle = "#ffffff"; g.lineWidth = 2.6;
    for (let k = 0.24; k < 0.99; k += 0.105) { g.beginPath(); g.arc(r, r, r * k, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 5; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.moveTo(r + Math.cos(a) * r * 0.16, r + Math.sin(a) * r * 0.16); g.lineTo(r + Math.cos(a) * r * 0.99, r + Math.sin(a) * r * 0.99); g.stroke(); }
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(r, r, r * 0.17, 0, Math.PI * 2); g.fill();
    return c;
  }
  function winCanvas() {
    // Fensterlicht: oben heller (Deckenlampe), zur Brüstung dunkler, ein Vorhang am Rand
    const c = canvasOf(32, 64), g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#d9d9d9"); gr.addColorStop(0.7, "#9a9a9a"); gr.addColorStop(1, "#6e6e6e");
    g.fillStyle = gr; g.fillRect(0, 0, 32, 64);
    g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(0, 0, 5, 64);
    return c;
  }
  // Wolken (nahtlos in x): R = Licht von oben, G = Dichte. Quellungen mit flacher Unterseite
  function cloudData() {
    const W = 1024, H = 256, den = new Float32Array(W * H), lit = new Float32Array(W * H), R = rng(42);
    const puff = (cx, cy, r, base) => {
      const y0 = Math.max(0, Math.floor(cy - r - 2)), y1 = Math.min(H - 1, Math.ceil(Math.min(cy + r, base + 3)));
      for (let y = y0; y <= y1; y++) for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
        const d = Math.hypot(x - cx, y - cy) / r; if (d >= 1.04) continue;
        const v = (1 - sstep(0.7, 1.04, d)) * (1 - sstep(base - 3, base + 2.5, y));
        const i = y * W + (((x % W) + W) % W); if (v > den[i]) den[i] = v;
      }
    };
    for (const [cx, base, w, h] of [[170, 196, 300, 78], [520, 112, 110, 30], [790, 222, 210, 58], [990, 128, 64, 18]]) {
      const n = Math.round(4 + w / 28);
      for (let i = 0; i < n; i++) {
        const u = (i / (n - 1)) * 2 - 1, k = 1 - u * u;
        const r = h * (0.32 + 0.46 * k) * (0.85 + 0.3 * R());
        puff(cx + u * w * 0.5, base - r * 0.5 - k * h * 0.32 + (R() - 0.5) * 4, r, base);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (den[i] <= 0) continue;
      let above = 0; for (const dy of [5, 12, 21, 32, 46]) { const yy = y - dy; if (yy >= 0) above += den[yy * W + x]; }
      lit[i] = clamp(1 - (above / 5) * 0.85, 0, 1);   // Eigenschatten: oben hell, zur flachen Unterseite allmählich dunkler
    }
    return { W, H, den, lit };
  }
  function cloudCanvas(cd) {
    const c = canvasOf(cd.W, cd.H), g = c.getContext("2d"), img = g.createImageData(cd.W, cd.H);
    for (let i = 0; i < cd.W * cd.H; i++) { img.data[i * 4] = Math.round(cd.lit[i] * 255); img.data[i * 4 + 1] = Math.round(cd.den[i] * 255); img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0); return c;
  }

  /* ---------- Shader ---------- */
  const QUAD_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  // Himmel (wird mit dem Ruhenden gespeichert; Alpha 0 markiert Himmel für die Wolken)
  const BAKE_FS = `
    precision highp float;
    uniform vec2 uRes; uniform float uHor, uDpr;
    uniform vec3 uTop, uMid, uHorC;
    uniform vec2 uSun; uniform float uGlowA, uGlowA2, uGlowR1, uGlowR2; uniform vec3 uGlowC;
    uniform vec3 uHaze; uniform float uHazeA;
    uniform vec2 uMoon; uniform float uMoonGlow, uMoonGR; uniform vec3 uMoonC;
    uniform float uStars;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec2 p = gl_FragCoord.xy;
      float h = clamp((p.y - uHor) / max(uRes.y - uHor, 1.0), 0.0, 1.0);
      vec3 c = mix(uHorC, uMid, smoothstep(0.0, 0.42, h));
      c = mix(c, uTop, smoothstep(0.32, 1.0, h));
      float side = exp(-abs(p.x - uSun.x) / (uRes.x * 0.55));
      c += uHaze * uHazeA * exp(-h / 0.18) * (0.4 + 0.6 * side);
      if (uStars > 0.003) {
        float cs = 46.0 * uDpr; vec2 cell = floor(p / cs); float r = hash(cell);
        if (r > 0.88) {
          vec2 sp = (cell + 0.2 + 0.6 * vec2(hash(cell + 3.1), hash(cell + 7.7))) * cs;
          float s = 1.0 - smoothstep(0.35 * uDpr, 1.35 * uDpr, length(p - sp));
          float hdr = 1.0 - smoothstep(uRes.y - 190.0 * uDpr, uRes.y - 130.0 * uDpr, p.y);   // nicht hinter Kopfzeile und Knöpfen
          c = mix(c, vec3(1.0), s * uStars * hdr * smoothstep(0.12, 0.55, h) * (0.3 + 5.0 * (r - 0.88)));
        }
      }
      if (uMoonGlow > 0.002) c += uMoonC * uMoonGlow * exp(-length(p - uMoon) / uMoonGR);
      float sd = length(p - uSun);
      c += uGlowC * (uGlowA * exp(-sd / uGlowR1) + uGlowA2 * exp(-sd / uGlowR2));
      c += (hash(p * 0.731) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 0.0);
    }`;
  // Zusammensetzen: gespeichertes Bild, darüber am Himmel Sonnen-/Mondscheibe und zwei Wolkenebenen (ein Vollbilddurchgang)
  const COMP_FS = `
    precision highp float;
    uniform sampler2D tCache, tCloud;
    uniform vec2 uRes; uniform float uHor, uDpr;
    uniform vec4 uC1, uC2; uniform float uCloudA; uniform vec3 uCloudLit, uCloudBase;
    uniform vec2 uSun; uniform float uSunR, uSunA, uCorona; uniform vec3 uSunCore;
    uniform vec2 uMoon; uniform float uMoonR, uMoonA; uniform vec3 uMoonL, uMoonC;
    varying vec2 vUv;
    vec4 cloud(vec4 P, vec2 p, float h){
      vec2 uv = vec2(p.x * P.x + P.y, (h - P.z) * P.w);
      if (uv.y <= 0.002 || uv.y >= 0.998) return vec4(0.0);
      return texture2D(tCloud, uv);
    }
    void main(){
      vec4 cc = texture2D(tCache, vUv);
      vec3 c = cc.rgb;
      float sky = 1.0 - cc.a;
      if (sky > 0.004) {
        vec2 p = gl_FragCoord.xy;
        vec3 s = c;
        if (uSunA > 0.003) {
          float sd = length(p - uSun);
          if (sd < uSunR * 6.0) {
            s += uSunCore * uSunA * uCorona * exp(-max(sd - uSunR, 0.0) / (uSunR * 0.8));
            s = mix(s, uSunCore, uSunA * (1.0 - smoothstep(uSunR - uDpr, uSunR + uDpr, sd)));
          }
        }
        if (uMoonA > 0.003) {
          vec2 m = (p - uMoon) / uMoonR; float mr = length(m);
          if (mr < 1.1) {
            float z = sqrt(max(0.0, 1.0 - mr * mr));
            float lit = smoothstep(-0.03, 0.06, dot(vec3(m, z), uMoonL));
            float edge = 1.0 - smoothstep(1.0 - 0.9 / uMoonR, 1.0 + 0.4 / uMoonR, mr);
            vec3 mc = mix(s + uMoonC * 0.025, uMoonC * (0.9 + 0.1 * z), lit);
            s = mix(s, mc, edge * uMoonA);
          }
        }
        if (uCloudA > 0.003) {
          float h = (p.y - uHor) / max(uRes.y - uHor, 1.0);
          vec4 t2 = cloud(uC2, p, h);
          s = mix(s, mix(uCloudBase, uCloudLit, t2.r), smoothstep(0.08, 0.7, t2.g) * uCloudA * 0.45);
          vec4 t1 = cloud(uC1, p, h);
          s = mix(s, mix(uCloudBase, uCloudLit, t1.r), smoothstep(0.08, 0.7, t1.g) * uCloudA);
        }
        c = mix(c, s, sky);
      }
      gl_FragColor = vec4(c, 1.0);
    }`;
  // Energieimpuls (Abschnitt 1 und 2) und Luftstrom als Bänder, quer zur Blickrichtung
  const RIB_VS = "attribute float aS; attribute float aV; attribute float aLeg; attribute float aVis; varying float vS; varying float vV; varying float vLeg; varying float vVis; void main(){ vS = aS; vV = aV; vLeg = aLeg; vVis = aVis; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
  const RIB_FS = `
    precision highp float;
    uniform float uH1, uH2, uPv, uBase, uTrail, uFlow, uFlowA, uBoost;
    uniform vec3 uC, uFlowC;
    varying float vS; varying float vV; varying float vLeg; varying float vVis;
    void main(){
      float x = 1.0 - abs(vV);
      float core = smoothstep(0.5, 0.95, x), halo = x * x;
      vec3 col; float a;
      if (vLeg < 1.5) {
        float d = (vLeg < 0.5 ? uH1 : uH2) - vS;
        float pulse = smoothstep(-0.2, 0.0, d) * exp(-max(d, 0.0) / uTrail);
        a = uPv * (uBase * (0.25 * halo + 0.75 * core) + pulse * (0.85 * halo + 0.6 * core));
        col = mix(uC, uC * 0.6 + 0.4, core * pulse * 0.35);
      } else {
        float ph = fract(vS * 1.15 - uFlow);
        float dash = smoothstep(0.0, 0.3, ph) * (1.0 - smoothstep(0.38, 0.8, ph));
        a = uFlowA * (1.0 + uBoost) * dash * halo * smoothstep(0.02, 0.25, vS) * (1.0 - smoothstep(0.6, 1.65, vS));
        col = uFlowC;
      }
      gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * vVis);
    }`;
  const SHEEN_FS = "precision mediump float; uniform float uPos, uA; uniform vec3 uC; varying vec2 vUv; void main(){ float x = vUv.x * 0.78 + vUv.y * 0.4 - uPos; gl_FragColor = vec4(uC, uA * exp(-x * x / 0.006)); }";
  const SHEEN_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

  // Takt des Energieimpulses (8 s): Abschnitt 1 in 3 s vom Dach ins Haus, kurze Pause, Abschnitt 2 in 1,1 s zur Wärmepumpe
  const PULSE_T = 8;
  function pulseHeads(t, still, L1, L2, out) {
    if (still) { out[0] = L1 * 0.62; out[1] = -5; out[2] = 0; return out; }
    const ph = t % PULSE_T, q1 = clamp(ph / 3.0, 0, 1), e1 = q1 < 0.5 ? 2 * q1 * q1 : 1 - Math.pow(-2 * q1 + 2, 2) / 2;
    out[0] = -0.3 + e1 * (L1 + 2.4);
    const q2 = clamp((ph - 3.6) / 1.1, 0, 1), e2 = 1 - (1 - q2) * (1 - q2);
    out[1] = q2 <= 0 ? -5 : -0.2 + e2 * (L2 + 1.8);
    out[2] = ph > 4.5 ? Math.exp(-(ph - 4.5) / 1.4) : 0;   // Ankunft an der Wärmepumpe
    return out;
  }

  /* ---------- WebGL-Szene ---------- */
  function createGL({ canvas3d, THREE }) {
    // Bildpuffer bleibt erhalten: zwischen den Wolkenschritten wird nur der kleine Bereich um Wärmepumpe, Leitung und Module neu gezeichnet
    const attrs = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "low-power" };
    let ctx = null;
    try { ctx = canvas3d.getContext("webgl2", attrs); } catch (e) { ctx = null; }
    if (!ctx) { try { ctx = canvas3d.getContext("webgl", attrs); } catch (e) { ctx = null; } }
    if (!ctx || (ctx.isContextLost && ctx.isContextLost())) throw new Error("kein WebGL");
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas3d, context: ctx, alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "low-power" });
      return glScene(renderer, THREE, canvas3d);
    } catch (e) {
      try { if (renderer) renderer.dispose(); } catch (e2) { /* nichts */ }
      throw e;
    }
  }

  function glScene(renderer, THREE, canvas3d) {
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    const disposables = [];
    const keep = (o) => { disposables.push(o); return o; };
    let lost = false;
    const onLost = () => { lost = true; };
    canvas3d.addEventListener("webglcontextlost", onLost);
    const world = buildWorld(2);
    // Gespeichert (nur bei Änderung): Himmel + Landschaft + Haus. Pro Bild: Zusammensetzen mit Wolken, dann die bewegten Teile.
    const msaa = !!(renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget);
    const scene = new THREE.Scene(), dyn = new THREE.Scene(), bakeSc = new THREE.Scene(), comp = new THREE.Scene();
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const camera = new THREE.PerspectiveCamera(30, 1, 2, 8000);
    camera.position.set(CAM[0], CAM[1], CAM[2]);
    camera.lookAt(CAM[0] + FWD[0], CAM[1], CAM[2] + FWD[2]);
    camera.updateMatrixWorld();
    scene.fog = new THREE.Fog(0xffffff, 90, 950);

    const quad = keep(new THREE.PlaneGeometry(2, 2));
    const V2 = () => ({ value: new THREE.Vector2() }), C3 = () => ({ value: new THREE.Color() }), F = (v) => ({ value: v });
    const uRes = V2(), uHor = F(0), uDpr = F(1);
    const BU = { uRes, uHor, uDpr, uTop: C3(), uMid: C3(), uHorC: C3(), uSun: V2(), uGlowA: F(0), uGlowA2: F(0), uGlowR1: F(80), uGlowR2: F(240), uGlowC: C3(),
      uHaze: C3(), uHazeA: F(0), uMoon: V2(), uMoonGlow: F(0), uMoonGR: F(60), uMoonC: C3(), uStars: F(0) };
    const bakeMat = keep(new THREE.ShaderMaterial({ uniforms: BU, vertexShader: QUAD_VS, fragmentShader: BAKE_FS, depthTest: false, depthWrite: false }));
    const bakeMesh = new THREE.Mesh(quad, bakeMat); bakeMesh.frustumCulled = false; bakeSc.add(bakeMesh);
    const cloudTex = keep(new THREE.CanvasTexture(cloudCanvas(cloudData()))); cloudTex.wrapS = THREE.RepeatWrapping;
    const CU = { tCache: F(null), tCloud: F(cloudTex), uRes, uHor, uDpr, uC1: { value: new THREE.Vector4() }, uC2: { value: new THREE.Vector4() }, uCloudA: F(0), uCloudLit: C3(), uCloudBase: C3(),
      uSun: V2(), uSunR: F(16), uSunA: F(0), uCorona: F(0.1), uSunCore: C3(), uMoon: V2(), uMoonR: F(14), uMoonA: F(0), uMoonL: { value: new THREE.Vector3(0, 0, 1) }, uMoonC: C3() };
    const compMat = keep(new THREE.ShaderMaterial({ uniforms: CU, vertexShader: QUAD_VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false, blending: THREE.NoBlending }));
    const compMesh = new THREE.Mesh(quad, compMat); compMesh.frustumCulled = false; comp.add(compMesh);
    let rt = null;

    // Licht: Himmel + gerichtete Sonne (bzw. Mond) mit weichen Schatten; Schattenkarte 1024 eng um Haus und nahe Bäume
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1); scene.add(hemi);
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    const sc = light.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 60; sc.far = 170;
    light.shadow.bias = -0.0008; light.shadow.normalBias = 0.03; light.shadow.radius = 1.6;
    light.target.position.set(0, 0, 1); scene.add(light); scene.add(light.target);

    // Geometrie aus Flächenlisten; Farben pro Fläche als Vertexfarben (ein Draw Call je Gruppe)
    function geomOf(faces, withUV) {
      let n = 0; for (const f of faces) n += f.p.length - 2;
      const pos = new Float32Array(n * 9), nor = new Float32Array(n * 9), col = new Float32Array(n * 9), uv = withUV ? new Float32Array(n * 6) : null;
      let k = 0;
      for (const f of faces) for (let i = 1; i < f.p.length - 1; i++) for (const j of [0, i, i + 1]) {
        pos.set(f.p[j], k * 3); nor.set(f.vn ? f.vn[j] : f.n, k * 3); if (uv) uv.set(f.uv ? f.uv[j] : [0, 0], k * 2); k++;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      if (uv) g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      return keep(g);
    }
    const VARY = { lawn: 1, f1: 1, f2: 1, f3: 1, f4: 1, hill1: 1, hill2: 1, treeline: 1 };
    function paint(geo, faces, pal) {
      const col = geo.attributes.color.array; let k = 0;
      for (const f of faces) {
        const c = pal[f.m] || [1, 0, 1], v = VARY[f.m];
        for (let i = 1; i < f.p.length - 1; i++) for (const j of [0, i, i + 1]) {
          const q = f.p[j], n = v ? 1 + 0.045 * Math.sin(q[0] * 0.045 + q[2] * 0.031) * Math.cos(q[2] * 0.057 - q[0] * 0.021) + 0.022 * Math.sin(q[0] * 0.19 + q[2] * 0.13) : 1;
          col[k++] = c[0] * n; col[k++] = c[1] * n; col[k++] = c[2] * n;
        }
      }
      geo.attributes.color.needsUpdate = true;
    }
    const solidMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const groups = [
      [world.cast.filter((f) => f.gl !== false && !f.tag), true, true],
      [world.cast.filter((f) => f.tag === "crown"), true, true],
      [world.cast.filter((f) => f.tag === "bare"), true, true],
      [world.ground, false, true],
      [world.far, false, false],
    ].map(([faces, cast, recv]) => { const geo = geomOf(faces); const m = new THREE.Mesh(geo, solidMat); m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return { faces, geo, mesh: m }; });
    const crownMesh = groups[1].mesh, bareMesh = groups[2].mesh;

    const pvTex = keep(new THREE.CanvasTexture(pvCanvas())); pvTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const pvMat = keep(new THREE.MeshPhongMaterial({ map: pvTex, specular: 0x5a6a90, shininess: 46 }));
    const mPV = new THREE.Mesh(geomOf(world.pv, true), pvMat); mPV.receiveShadow = true; mPV.castShadow = true; scene.add(mPV);

    const winTex = keep(new THREE.CanvasTexture(winCanvas()));
    const glassMats = [0, 1, 2, 3].map(() => keep(new THREE.MeshLambertMaterial({ color: 0x41506a, emissive: 0x000000, emissiveMap: winTex })));
    world.glass.forEach((fs, i) => { const m = new THREE.Mesh(geomOf(fs, true), glassMats[i]); m.receiveShadow = true; scene.add(m); });

    // Bodenschatten (weiche Kontaktschatten unter Haus, Wärmepumpe, Bäumen)
    const aoTex = keep(new THREE.CanvasTexture(aoCanvas()));
    const aoMat = keep(new THREE.MeshBasicMaterial({ map: aoTex, color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    scene.add(new THREE.Mesh(geomOf(world.ao.map((a) => ({ m: "ao", n: [0, 1, 0], uv: UV4, p: [[a.x - a.sx / 2, 0.1, a.z + a.sz / 2], [a.x + a.sx / 2, 0.1, a.z + a.sz / 2], [a.x + a.sx / 2, 0.1, a.z - a.sz / 2], [a.x - a.sx / 2, 0.1, a.z - a.sz / 2]] })), true), aoMat));

    // Ventilator: dunkler Schacht und heller Ring ruhen, Flügel und Schutzgitter bewegen sich bzw. liegen darüber
    const cavMat = keep(new THREE.MeshLambertMaterial({ color: 0x1d2026 })), rimMat = keep(new THREE.MeshLambertMaterial({ color: 0xf6f6f8 })), gapMat = keep(new THREE.MeshLambertMaterial({ color: 0x8a8e96 }));
    const cav = new THREE.Mesh(keep(new THREE.CircleGeometry(FAN_R, 40)), cavMat); cav.position.set(FAN[0], FAN[1], FAN[2] + 0.004); scene.add(cav);
    const gap = new THREE.Mesh(keep(new THREE.RingGeometry(FAN_R * 0.99, FAN_R * 1.04, 48)), gapMat); gap.position.set(FAN[0], FAN[1], FAN[2] + 0.008); scene.add(gap);
    const rim = new THREE.Mesh(keep(new THREE.RingGeometry(FAN_R * 1.04, FAN_R * 1.16, 48)), rimMat); rim.position.set(FAN[0], FAN[1], FAN[2] + 0.012); scene.add(rim);
    const rotorTex = keep(new THREE.CanvasTexture(rotorCanvas())), grilleTex = keep(new THREE.CanvasTexture(grilleCanvas()));
    const rotorMat = keep(new THREE.MeshBasicMaterial({ map: rotorTex, transparent: true, depthTest: false, depthWrite: false }));
    const grilleMat = keep(new THREE.MeshBasicMaterial({ map: grilleTex, transparent: true, depthTest: false, depthWrite: false }));
    const fanGeo = keep(new THREE.PlaneGeometry(FAN_R * 2, FAN_R * 2));
    const rotor = new THREE.Mesh(fanGeo, rotorMat); rotor.position.set(FAN[0], FAN[1], FAN[2] + 0.01); rotor.renderOrder = 1; dyn.add(rotor);
    const grille = new THREE.Mesh(fanGeo, grilleMat); grille.position.set(FAN[0], FAN[1], FAN[2] + 0.018); grille.renderOrder = 2; dyn.add(grille);

    // Lichtschein der Wohnzimmerfenster auf der Terrasse
    const softTex = keep(new THREE.CanvasTexture(softCanvas(64, [[0, 0.9], [0.4, 0.45], [1, 0]])));
    const spillMat = keep(new THREE.MeshBasicMaterial({ map: softTex, transparent: true, depthWrite: false, opacity: 0, color: 0xffc070, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const spill = new THREE.Mesh(keep(new THREE.PlaneGeometry(5.6, 4.2)), spillMat); spill.rotation.x = -Math.PI / 2; spill.position.set(2.05, 0.1, 5.6); scene.add(spill);

    // Bänder: Energieweg (zwei Abschnitte) und Luftstrom, eine Geometrie, ein Draw Call; nur Uniforms ändern sich pro Bild
    const lines = [{ pts: world.path1, vis: world.vis1, leg: 0, w: 0.46 }, { pts: world.path2, vis: world.vis2, leg: 1, w: 0.4 }, ...world.flow.map((p) => ({ pts: p, vis: null, leg: 2, w: 0.1 }))];
    const ribGeo = (() => {
      const pos = [], aS = [], aV = [], aLeg = [], aVis = [], idx = [];
      for (const ln of lines) {
        const P = ln.pts, n = P.length, S = arcs(P), b0 = pos.length / 3;
        for (let i = 0; i < n; i++) {
          const tA = i > 0 ? nrm(sub(P[i], P[i - 1])) : null, tB = i < n - 1 ? nrm(sub(P[i + 1], P[i])) : null;
          const t = nrm(tA && tB ? add(tA, tB) : (tA || tB)), v = nrm(sub(CAM, P[i]));
          const side = nrm(crs(t, v)); let k = 1;
          if (tA && tB) k = 1 / Math.max(0.6, Math.abs(dot(side, nrm(crs(tA, v)))));
          for (const sg of [-1, 1]) { pos.push(...add(P[i], mul(side, sg * ln.w * 0.5 * k))); aS.push(S[i]); aV.push(sg); aLeg.push(ln.leg); aVis.push(ln.vis ? ln.vis[i] : 1); }
          if (i) { const a = b0 + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
        ln.len = S[n - 1];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("aS", new THREE.Float32BufferAttribute(aS, 1)); g.setAttribute("aV", new THREE.Float32BufferAttribute(aV, 1));
      g.setAttribute("aLeg", new THREE.Float32BufferAttribute(aLeg, 1)); g.setAttribute("aVis", new THREE.Float32BufferAttribute(aVis, 1)); g.setIndex(idx);
      return keep(g);
    })();
    const L1 = lines[0].len, L2 = lines[1].len;
    const RU = { uH1: F(-5), uH2: F(-5), uPv: F(0), uBase: F(0.22), uTrail: F(1.0), uFlow: F(0), uFlowA: F(0.5), uBoost: F(0), uC: C3(), uFlowC: C3() };
    const ribMat = keep(new THREE.ShaderMaterial({ uniforms: RU, vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthTest: false, depthWrite: false }));
    const ribbon = new THREE.Mesh(ribGeo, ribMat); ribbon.frustumCulled = false; ribbon.renderOrder = 4; dyn.add(ribbon);
    // Glanz, der langsam über das Modulfeld zieht, solange die Sonne scheint
    const SU = { uPos: F(-1), uA: F(0), uC: { value: new THREE.Color(1, 1, 1) } };
    const sheenGeo = (() => { const g = new THREE.BufferGeometry(), q = world.pvQuad; g.setAttribute("position", new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[3]], 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]); return keep(g); })();
    const sheen = new THREE.Mesh(sheenGeo, keep(new THREE.ShaderMaterial({ uniforms: SU, vertexShader: SHEEN_VS, fragmentShader: SHEEN_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    sheen.frustumCulled = false; sheen.renderOrder = 3; dyn.add(sheen);
    // Dampf aus der Ausblasluft (nur an kalten Tagen), steigt langsam auf
    const vap = [0, 1].map(() => { const m = keep(new THREE.SpriteMaterial({ map: softTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 })); const s = new THREE.Sprite(m); s.renderOrder = 5; s.visible = false; dyn.add(s); return s; });

    // statische Objekte: keine Matrix-Neuberechnung pro Bild
    [scene, dyn].forEach((s0) => s0.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; }));
    rotor.matrixAutoUpdate = true; vap.forEach((s) => { s.matrixAutoUpdate = true; });

    let L = null, look = null, lookKey = -1, palKey = "", dpr = 1, dirty = true, lastT = 0, fanAng = 0.6, lastSt = null, needFull = true, lastSkyT = -1;
    const SKY_DT = 0.5;   // Wolken: 2 Schritte pro Sekunde reichen bei 2,4 px/s
    const dynPts = [...world.pvQuad, ...world.path1, ...world.path2, ...world.flow.flat()];
    for (const dx of [-1, 1]) for (const dy of [-0.4, 1.9]) for (const dz of [0, 1]) dynPts.push([FAN[0] + dx * (FAN_R + 0.7), FAN[1] + dy, FAN[2] + dz]);
    const dynR = [0, 0, 1, 1], skyR = [0, 0, 1, 1], pq = [0, 0, 0];
    let shadowDir = null, observer = null;
    const winCur = [-1, -1, -1, -1], winBaked = [-1, -1, -1, -1];
    const bufSize = new THREE.Vector2(), sp = [0, 0, 0], mp = [0, 0, 0], heads = [0, 0, 0];
    let cloudW1 = 1400, cloudW2 = 900;

    function applyPalette(dark, month) {
      const pal = paletteOf(month, dark);
      for (const g of groups) paint(g.geo, g.faces, pal);
      const winter = winterOf(month); crownMesh.visible = !winter; bareMesh.visible = winter;
      glassMats.forEach((m) => m.color.setRGB(...(dark ? hx("#121a29") : hx("#2c3649"))));
      pvMat.color.setRGB(...(dark ? [0.62, 0.66, 0.78] : [1, 1, 1]));
      pvMat.specular.setRGB(...(dark ? [0.26, 0.3, 0.4] : [0.36, 0.42, 0.56]));
      cavMat.color.setRGB(...(dark ? hx("#0b0d11") : hx("#1b1e24")));
      rimMat.color.setRGB(...(dark ? darkOf("hpCase", hx("#fbfbfc")) : hx("#fbfbfc")));
      gapMat.color.setRGB(...(dark ? hx("#30343c") : hx("#7d828b")));
      aoMat.opacity = dark ? 0.32 : 0.16;
    }
    function setGlass() {
      const day = scl3(look.glassDay, look.dark ? 0.16 : 0.26);
      for (let i = 0; i < 4; i++) {
        const g = winBaked[i], gd = (1 - g) * (1 - g), gw = Math.min(1, g * 1.6) * look.windowI;
        glassMats[i].emissive.setRGB(day[0] * gd + look.windowC[0] * gw, day[1] * gd + look.windowC[1] * gw, day[2] * gd + look.windowC[2] * gw);
      }
      spillMat.opacity = winBaked[0] * (look.dark ? 0.24 : 0.26);
    }
    function updateLook(st) {
      look = computeLook(st);
      const k = look.k, dark = look.dark;
      const pk = (dark ? "d" : "l") + look.month;
      if (pk !== palKey) { palKey = pk; applyPalette(dark, look.month); }
      BU.uTop.value.setRGB(...k.top); BU.uMid.value.setRGB(...k.mid); BU.uHorC.value.setRGB(...k.hor);
      BU.uGlowC.value.setRGB(...k.glowC); BU.uGlowA.value = look.glowA; BU.uGlowA2.value = look.glowA2;
      BU.uHaze.value.setRGB(...k.haze); BU.uHazeA.value = k.hazeA; BU.uStars.value = k.stars;
      BU.uMoonC.value.setRGB(...look.moonC); BU.uMoonGlow.value = look.moonGlow;
      CU.uCloudA.value = look.cloudA; CU.uCloudLit.value.setRGB(...look.cloudLit); CU.uCloudBase.value.setRGB(...look.cloudBase);
      CU.uSunCore.value.setRGB(...look.sunCore); CU.uCorona.value = look.corona; CU.uMoonC.value.setRGB(...look.moonC);
      scene.fog.color.setRGB(...k.hor);
      hemi.color.setRGB(...k.hS); hemi.groundColor.setRGB(...k.hG); hemi.intensity = k.hI;
      light.color.setRGB(...look.lightC); light.intensity = look.lightI;
      const d = look.lightDir; light.position.set(d[0] * 110, 1 + d[1] * 110, 1 + d[2] * 110 - 1); light.position.set(d[0] * 110, d[1] * 110, 1 + d[2] * 110);
      light.updateMatrix(); light.updateMatrixWorld();
      if (look.shadowOn && (!shadowDir || dot(d, shadowDir) < Math.cos(look.shadowStep * RAD))) { renderer.shadowMap.needsUpdate = true; shadowDir = d; }
      pvMat.emissive.setRGB(...scl3(look.glassDay, (dark ? 0.1 : 0.16) * (1 - look.night * 0.7)));
      spillMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      RU.uC.value.setRGB(...look.beadC); RU.uBase.value = look.pvBase; RU.uFlowC.value.setRGB(...look.flowC); RU.uFlowA.value = look.flowA;
      rotorMat.color.setRGB(...scl3(dark ? hx("#646b78") : hx("#9ba1ab"), lerp(1, dark ? 0.55 : 0.8, look.night)));
      grilleMat.color.setRGB(...(dark ? hx("#0c0e12") : hx("#25282e")));
      vap.forEach((s) => s.material.color.setRGB(...look.vapC));
      if (winCur[0] >= 0) setGlass();
      positionGlow();
      dirty = true;
    }
    function positionGlow() {
      if (!L || !look) return;
      skyPos(L, look.az, look.el, sp); BU.uSun.value.set(sp[0] * dpr, (L.h - sp[1]) * dpr);
      const m = Math.min(L.w, L.h) * dpr;
      BU.uGlowR1.value = 0.1 * m * look.glowR; BU.uGlowR2.value = 0.34 * m * look.glowR;
      skyPos(L, look.moon.azimuth, look.moon.elevation, mp); BU.uMoon.value.set(mp[0] * dpr, (L.h - mp[1]) * dpr); BU.uMoonGR.value = 0.09 * m;
    }
    function applyLayout(w, h) {
      L = layout(w, h, isLocked());
      camera.aspect = w / h; camera.fov = 2 * Math.atan((h / 2) / L.f) / RAD; camera.updateProjectionMatrix();
      const e = camera.projectionMatrix.elements; e[8] = 1 - 2 * L.cx / w; e[9] = 2 * L.cy / h - 1;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      uRes.value.set(w * dpr, h * dpr); uHor.value = (h - L.cy) * dpr; uDpr.value = dpr;
      CU.uSunR.value = L.sunR * dpr; CU.uMoonR.value = L.sunR * 0.9 * dpr;
      // Wolken: im Hochformat größer skaliert, damit einzelne Wolken statt eines Bandes zu sehen sind
      cloudW1 = clamp(w, 1100, 1600); cloudW2 = cloudW1 * 0.6;
      const skyH = Math.max(1, L.cy);
      CU.uC1.value.set(1 / (cloudW1 * dpr), 0, 0.12, skyH / (cloudW1 / 4));
      CU.uC2.value.set(-1 / (cloudW2 * dpr), 0, 0.04, skyH / (cloudW2 / 4));   // gespiegelt, damit die ferne Ebene keine Kopie zeigt
      // Wolkenband (nur dort ändert sich der Himmel zwischen den gespeicherten Bildern)
      const hTop = Math.min(1, Math.max(0.12 + cloudW1 / 4 / skyH, 0.04 + cloudW2 / 4 / skyH)), yT = Math.max(0, Math.floor(L.cy * (1 - hTop)) - 3), yB = Math.min(h, Math.ceil(L.cy * (1 - 0.035)) + 3);
      skyR[0] = 0; skyR[1] = h - yB; skyR[2] = w; skyR[3] = Math.max(1, yB - yT);
      renderer.getDrawingBufferSize(bufSize);
      if (!rt) {
        const opt = { format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
        rt = msaa ? new THREE.WebGLMultisampleRenderTarget(bufSize.x, bufSize.y, opt) : new THREE.WebGLRenderTarget(bufSize.x, bufSize.y, opt);
        if (msaa) rt.samples = 4;
        CU.tCache.value = rt.texture;
      } else if (rt.width !== bufSize.x || rt.height !== bufSize.y) rt.setSize(bufSize.x, bufSize.y);
      // Bereich der bewegten Teile (CSS-Pixel, Ursprung unten links wie beim Scissor-Test)
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of dynPts) { project(L, q, pq); x0 = Math.min(x0, pq[0]); x1 = Math.max(x1, pq[0]); y0 = Math.min(y0, pq[1]); y1 = Math.max(y1, pq[1]); }
      x0 = Math.max(0, Math.floor(x0 - 12)); y0 = Math.max(0, Math.floor(y0 - 12)); x1 = Math.min(w, Math.ceil(x1 + 12)); y1 = Math.min(h, Math.ceil(y1 + 12));
      dynR[0] = x0; dynR[1] = h - y1; dynR[2] = Math.max(1, x1 - x0); dynR[3] = Math.max(1, y1 - y0);
      positionGlow();
      dirty = true; needFull = true;
    }
    function bake() {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
      renderer.render(bakeSc, ortho);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      dirty = false;
    }
    // Anmeldeseite ↔ Kalender: Bildaufteilung wechselt mit (auch bei „Bewegung reduzieren“ sofort)
    if (document.body && window.MutationObserver) {
      observer = new MutationObserver(() => { if (!L || lost || L.locked === isLocked()) return; applyLayout(L.w, L.h); if (lastSt && lastSt.still) api.frame(lastSt); });
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    const api = {
      stillT: 13.5,
      get fps() { return look && look.night > 0.85 && !look.vapour ? 8 : 12; },
      resize(st) {
        if (lost) return;
        dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.4e6 / Math.max(1, st.w * st.h)));
        renderer.setPixelRatio(dpr); renderer.setSize(st.w, st.h, false);
        applyLayout(st.w, st.h);
      },
      frame(st) {
        if (lost || !L) return;
        lastSt = st;
        const mk = (st.dark ? 1e9 : 0) + Math.floor(st.now.getTime() / 60000);
        if (mk !== lookKey) { lookKey = mk; updateLook(st); }
        const t = st.t, still = st.still, dt = clamp(t - lastT, 0, 0.25); lastT = t;
        // Fenster: Licht geht sanft an und aus (beim Start sofort im richtigen Zustand)
        let wchg = false;
        for (let i = 0; i < 4; i++) {
          const tgt = look.windows[i];
          let v = winCur[i] < 0 || still ? tgt : winCur[i] + (tgt - winCur[i]) * (1 - Math.exp(-dt * 1.2));
          if (Math.abs(v - tgt) < 0.01) v = tgt;
          winCur[i] = v;
          if (Math.abs(v - winBaked[i]) > 0.04 || (v === tgt && winBaked[i] !== tgt)) { winBaked[i] = v; wchg = true; }
        }
        if (wchg) { setGlass(); dirty = true; }
        // Vollbild nur nach neuem gespeicherten Bild (etwa einmal pro Minute), Größenänderung oder Standbild;
        // sonst zweimal pro Sekunde das Wolkenband und in jedem Bild nur der Bereich der bewegten Teile
        const full = needFull || still || dirty, skyStep = !full && (t - lastSkyT >= SKY_DT || t < lastSkyT);
        if (full) {
          needFull = false;
          // Sonnen- und Mondscheibe (rücken mit dem gespeicherten Bild weiter, etwa 2 px pro Minute); der weite Schein ist gespeichert
          skyPos(L, st.sun.azimuth, st.sun.elevation, sp);
          CU.uSun.value.set(sp[0] * dpr, (L.h - sp[1]) * dpr); CU.uSunA.value = look.sunA * discVis(sp[2], st.sun.elevation);
          skyPos(L, look.moon.azimuth, look.moon.elevation, mp);
          CU.uMoon.value.set(mp[0] * dpr, (L.h - mp[1]) * dpr); CU.uMoonA.value = look.moonA * discVis(mp[2], look.moon.elevation);
          if (CU.uMoonA.value > 0.003) {   // beleuchtete Seite zeigt zur Sonne (auch wenn sie schon untergegangen ist)
            let dx = sp[0] - mp[0], dy = mp[1] - sp[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            const E = look.moon.phase * RAD; CU.uMoonL.value.set(dx * Math.sin(E), dy * Math.sin(E), -Math.cos(E));
          }
        }
        if (full || skyStep) {
          lastSkyT = t;
          // Wolken: zwei Ebenen, die ferne langsamer (Versatz auf der CPU, damit es auch nach Tagen genau bleibt)
          CU.uC1.value.y = fract((still ? 13.5 : t) * 2.4 / cloudW1 + 0.13); CU.uC2.value.y = fract((still ? 13.5 : t) * 1.3 / cloudW2 + 0.61);
        }
        // Energieimpuls PV → Haus → Wärmepumpe
        pulseHeads(t, still, L1, L2, heads);
        RU.uPv.value = look.pv; RU.uH1.value = heads[0]; RU.uH2.value = heads[1]; RU.uBoost.value = heads[2] * look.pv * 0.6;
        RU.uFlow.value = still ? 0.35 : fract(t * 0.5);
        // Ventilator: ruhig, mit PV-Strom und nach Ankunft des Impulses etwas schneller
        fanAng = still ? 0.6 : (fanAng + dt * look.fanW * (1 + 0.35 * heads[2] * look.pv)) % (Math.PI * 2);
        rotor.rotation.z = -fanAng;
        // Glanz über dem Modulfeld (alle 11 s, 2,8 s lang)
        const sh = (t + 6) % 11;
        SU.uA.value = still || look.pv < 0.02 || sh > 2.8 ? 0 : look.pv * look.sheenA * Math.sin(Math.PI * sh / 2.8);
        SU.uPos.value = -0.4 + (sh / 2.8) * 2.0; sheen.visible = SU.uA.value > 0.002;
        // Dampf (kalte Monate): steigt auf
        for (let i = 0; i < 2; i++) {
          const s = vap[i]; s.visible = !!look.vapour && !still;
          if (!s.visible) continue;
          const p = (t / 4.6 + i / 2) % 1, e = 1 - Math.pow(1 - p, 1.8);
          s.position.set(FAN[0] + 0.1 * e, FAN[1] + 0.1 + 0.95 * e, FAN[2] + 0.4 + 0.35 * e);
          const z = 0.45 + 0.95 * e; s.scale.set(z * 1.3, z, 1);
          s.material.opacity = look.vapA * Math.pow(Math.sin(Math.PI * p), 1.5);
        }
        if (dirty) bake();
        if (full) { renderer.render(comp, ortho); renderer.render(dyn, camera); return; }
        renderer.setScissorTest(true);
        if (skyStep) { renderer.setScissor(skyR[0], skyR[1], skyR[2], skyR[3]); renderer.render(comp, ortho); }
        renderer.setScissor(dynR[0], dynR[1], dynR[2], dynR[3]);
        renderer.render(comp, ortho);
        renderer.render(dyn, camera);
        renderer.setScissorTest(false);
      },
      dispose() {
        canvas3d.removeEventListener("webglcontextlost", onLost);
        if (observer) observer.disconnect();
        if (lost) return;   // Kontext verloren: nur Verweise loslassen, keine GL-Aufrufe
        try { if (rt) rt.dispose(); } catch (e) { /* nichts */ }
        try { if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; } } catch (e) { /* nichts */ }
        disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* nichts */ } });
        try { renderer.dispose(); } catch (e) { /* nichts */ }
      },
    };
    return api;
  }

  /* ---------- 2D-Ersatz ohne WebGL: dieselbe Szene, flach schattiert ---------- */
  function create2D({ canvas2d }) {
    const g = canvas2d.getContext("2d");
    if (!g) return null;
    const world = buildWorld(1);
    const mk = () => { const c = canvasOf(2, 2); return [c, c.getContext("2d")]; };
    const [sky, skyG] = mk(), [land, landG] = mk(), [stat, statG] = mk(), [shc, shG] = mk(), [spr, sprG] = mk(), [cl, clG] = mk();
    const cd = cloudData();
    let L = null, dpr = 1, look = null, mKey = -1, lKey = "", pal = null, palKey = "", clKey = "", full = true, lastSt = null, fanAng = 0.6, lastT = 0, observer = null;
    const pr = [0, 0, 0], sp = [0, 0, 0], mp = [0, 0, 0], heads = [0, 0, 0];
    const stars = (() => { const R = rng(9), a = []; for (let i = 0; i < 70; i++) a.push([R(), R(), R()]); return a; })();
    const blades = fanBladePolys(0.93);
    // vorab projizierte Wege (pro Bildaufteilung)
    const P1 = world.path1, P2 = world.path2, S1 = arcs(P1), S2 = arcs(P2), Lp1 = S1[S1.length - 1], Lp2 = S2[S2.length - 1];
    let scr1 = null, scr2 = null, flowScr = null, fanC = null, fanX = null, fanY = null, pvScr = null, rect = null;
    const lambert = (n, base) => {
      const k = look.k, up = n[1] * 0.5 + 0.5, hemiC = mix3(k.hG, k.hS, up);
      const nl = Math.max(0, dot(n, look.lightDir)) * look.lightI;
      return [base[0] * (hemiC[0] * k.hI + look.lightC[0] * nl), base[1] * (hemiC[1] * k.hI + look.lightC[1] * nl), base[2] * (hemiC[2] * k.hI + look.lightC[2] * nl)];
    };
    const seasonOk = (f) => !f.tag || (f.tag === "bare") === look.winter;
    function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
    function projPts(ps) { const o = []; for (const p of ps) { project(L, p, pr); if (pr[2] < 1) return null; o.push(pr[0], pr[1]); } return o; }
    function glassColor(f) {
      const g0 = look.windows[f.g], base = look.dark ? hx("#121a29") : hx("#2c3649"), day = scl3(look.glassDay, look.dark ? 0.16 : 0.26);
      return add(mul(lambert(f.n, base), 1 - g0), add(mul(day, (1 - g0) * (1 - g0)), mul(look.windowC, Math.min(1, g0 * 1.6) * look.windowI)));
    }
    function drawFace(c, f, fog) {
      if (f.m === "soffit" || f.ridge || f.skirt || !seasonOk(f)) return;
      if (dot(f.n, sub(CAM, f.p[0])) <= 0) return;
      const pts = projPts(f.p); if (!pts) return;
      if (f.m === "glass") {
        const col = glassColor(f), gr = c.createLinearGradient(0, Math.min(pts[1], pts[5]), 0, Math.max(pts[1], pts[5]));
        const lit = look.windows[f.g];
        gr.addColorStop(0, css(add(col, scl3(look.windowC, 0.12 * lit)))); gr.addColorStop(1, css(scl3(col, 1 - 0.35 * lit)));
        c.fillStyle = gr; poly(c, pts); c.fill(); return;
      }
      if (f.m === "pv") {
        const base = look.dark ? [0.1, 0.13, 0.22] : [0.14, 0.2, 0.36];
        c.fillStyle = css(add(lambert(f.n, base), scl3(look.glassDay, 0.12))); poly(c, pts); c.fill();
        // Zellraster 10 × 6 in beiden Richtungen, dann der Silberrahmen
        c.strokeStyle = look.dark ? "rgba(140,150,180,0.22)" : "rgba(205,210,220,0.42)"; c.lineWidth = 0.5; c.beginPath();
        for (let i = 1; i < 10; i++) { const t = i / 10; c.moveTo(lerp(pts[0], pts[2], t), lerp(pts[1], pts[3], t)); c.lineTo(lerp(pts[6], pts[4], t), lerp(pts[7], pts[5], t)); }
        for (let i = 1; i < 6; i++) { const t = i / 6; c.moveTo(lerp(pts[0], pts[6], t), lerp(pts[1], pts[7], t)); c.lineTo(lerp(pts[2], pts[4], t), lerp(pts[3], pts[5], t)); }
        c.stroke();
        c.strokeStyle = look.dark ? "rgba(150,155,168,0.8)" : "#c9ccd3"; c.lineWidth = 0.9; poly(c, pts); c.stroke();
        return;
      }
      let col = lambert(f.n, pal[f.m] || [1, 0, 1]);
      if (fog) { const d = Math.hypot(f.p[0][0] - CAM[0], f.p[0][2] - CAM[2]); col = mix3(col, look.k.hor, sstep(90, 950, d)); }
      c.fillStyle = css(col); c.strokeStyle = c.fillStyle; c.lineWidth = 0.6;
      poly(c, pts); c.fill(); c.stroke();
    }
    function drawRidge(c, r) {
      const pts = [];
      for (const p of r.t) { project(L, p, pr); pts.push(pr[0], pr[1]); }
      for (let i = r.b.length - 1; i >= 0; i--) { project(L, r.b[i], pr); pts.push(pr[0], pr[1]); }
      let n = [0, 1, 0];
      if (r.m !== "treeline") { n = nrm(sub(CAM, r.t[Math.floor(r.t.length / 2)])); n[1] = 0.25; n = nrm(n); }
      c.fillStyle = css(mix3(lambert(n, pal[r.m]), look.k.hor, sstep(90, 950, r.d)));
      poly(c, pts); c.fill();
    }
    // Himmel mit Sonne, Mond, Sternen und Wolken (jede Minute)
    function renderSky() {
      const w = L.w, h = L.h, k = look.k, c = skyG;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gr = c.createLinearGradient(0, 0, 0, L.cy);
      gr.addColorStop(0, css(k.top)); gr.addColorStop(0.55, css(mix3(k.top, k.mid, 0.8))); gr.addColorStop(0.85, css(k.mid)); gr.addColorStop(1, css(k.hor));
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      const hz = c.createLinearGradient(0, L.cy - 0.25 * L.cy, 0, L.cy);
      hz.addColorStop(0, css(k.haze, 0)); hz.addColorStop(1, css(k.haze, k.hazeA * 0.8));
      c.fillStyle = hz; c.fillRect(0, 0, w, L.cy);
      if (k.stars > 0.01) for (const [x, y, b] of stars) { const sy = 190 + y * (L.cy * 0.85 - 190); if (sy < 190) continue; c.fillStyle = `rgba(255,255,255,${(0.3 + 0.7 * b) * k.stars})`; c.beginPath(); c.arc(x * w, sy, 0.6 + b * 0.7, 0, 7); c.fill(); }
      // Wolken (ruhend), eingefärbt nach Design und Licht
      const ck = (look.dark ? "d" : "l") + Math.round(look.el / 4) + "/" + Math.round(look.night * 4);
      if (ck !== clKey) {
        clKey = ck; cl.width = cd.W; cl.height = cd.H;
        const img = clG.createImageData(cd.W, cd.H), A = look.cloudA;
        for (let i = 0; i < cd.W * cd.H; i++) { const d = sstep(0.08, 0.7, cd.den[i]); if (d <= 0) continue; const col = mix3(look.cloudBase, look.cloudLit, cd.lit[i]); img.data[i * 4] = col[0] * 255; img.data[i * 4 + 1] = col[1] * 255; img.data[i * 4 + 2] = col[2] * 255; img.data[i * 4 + 3] = d * A * 255; }
        clG.putImageData(img, 0, 0);
      }
      const cw = clamp(w, 1100, 1600), ch = cw / 4, cy0 = L.cy - (0.12 * L.cy) - ch;
      c.drawImage(cl, -0.13 * cw, cy0, cw, ch); c.drawImage(cl, 0.87 * cw, cy0, cw, ch);
      // Sonne: weiter Schein, Scheibe
      skyPos(L, look.az, look.el, sp);
      const m = Math.min(w, h), R1 = 0.1 * m * look.glowR * 2.2, R2 = 0.34 * m * look.glowR * 2.2;
      for (const [rr, a] of [[R2, look.glowA2], [R1, look.glowA]]) {
        if (a < 0.003) continue;
        const gl = c.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], rr);
        gl.addColorStop(0, css(k.glowC, a)); gl.addColorStop(0.35, css(k.glowC, a * 0.4)); gl.addColorStop(1, css(k.glowC, 0));
        c.fillStyle = gl; c.fillRect(0, 0, w, L.cy + 10);
      }
      const sA = look.sunA * discVis(sp[2], look.el);
      if (sA > 0.01) {
        const R = L.sunR, sc = c.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], R * 3.2);
        sc.addColorStop(0, css(look.sunCore, sA)); sc.addColorStop(0.3, css(look.sunCore, sA)); sc.addColorStop(0.34, css(look.sunCore, sA * look.corona));
        sc.addColorStop(0.6, css(look.sunCore, sA * look.corona * 0.35)); sc.addColorStop(1, css(look.sunCore, 0));
        c.fillStyle = sc; c.beginPath(); c.arc(sp[0], sp[1], R * 3.2, 0, 7); c.fill();
      }
      // Mond: weicher Hof (Verlauf bis 0), Phase zur Sonne gedreht
      skyPos(L, look.moon.azimuth, look.moon.elevation, mp);
      const mA = look.moonA * discVis(mp[2], look.moon.elevation);
      if (look.moonA > 0.01) {
        const r = L.sunR * 0.9, hg = c.createRadialGradient(mp[0], mp[1], 0, mp[0], mp[1], r * 6);
        hg.addColorStop(0, css(look.moonC, look.moonGlow * 2.2)); hg.addColorStop(1, css(look.moonC, 0));
        c.fillStyle = hg; c.beginPath(); c.arc(mp[0], mp[1], r * 6, 0, 7); c.fill();
        if (mA > 0.01) {
          const E = look.moon.phase * RAD, kx = Math.cos(E), ang = Math.atan2(sp[1] - mp[1], sp[0] - mp[0]);
          c.save(); c.translate(mp[0], mp[1]); c.rotate(ang); c.globalAlpha = mA; c.fillStyle = css(look.moonC);
          c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); c.ellipse(0, 0, Math.abs(kx) * r, r, 0, Math.PI / 2, -Math.PI / 2, kx > 0); c.fill(); c.restore();
        }
      }
    }
    // Landschaft, Haus, Schatten (alle 5 Minuten); Himmel bleibt durchsichtig
    function renderLand() {
      const w = L.w, h = L.h, k = look.k, c = landG;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, land.width, land.height); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const lawn = lambert([0, 1, 0], pal.lawn);
      const gg = c.createLinearGradient(0, L.cy, 0, h);
      gg.addColorStop(0, css(k.hor)); gg.addColorStop(0.2, css(mix3(k.hor, lawn, 0.6))); gg.addColorStop(1, css(lawn));
      c.fillStyle = gg; c.fillRect(0, L.cy - 1, w, h - L.cy + 1);
      for (const f of world.far) if (/^f\d$/.test(f.m)) drawFace(c, f, true);
      const objs = world.ridges.map((r) => ({ d: r.d, r })).concat(world.farObjs.map((o) => ({ d: o.d, o })));
      objs.sort((a, b) => b.d - a.d);
      for (const o of objs) { if (o.r) drawRidge(c, o.r); else for (const f of o.o.faces) drawFace(c, f, true); }
      for (const f of world.ground) if (f.m !== "lawn") drawFace(c, f, false);
      // Schlagschatten (Haus, Wärmepumpe, Bäume) auf den Boden
      if (look.lightI > 0.05) {
        if (shc.width !== land.width || shc.height !== land.height) { shc.width = land.width; shc.height = land.height; }
        shG.setTransform(1, 0, 0, 1, 0, 0); shG.clearRect(0, 0, shc.width, shc.height); shG.setTransform(dpr, 0, 0, dpr, 0, 0); shG.fillStyle = "#000";
        const d = look.lightDir;
        for (const f of world.shadowCasters) {
          if (!seasonOk(f)) continue;
          shG.beginPath();
          f.p.forEach((p, i) => { const t = p[1] / Math.max(d[1], 0.05); project(L, [p[0] - d[0] * t, 0.01, p[2] - d[2] * t], pr); if (i) shG.lineTo(pr[0], pr[1]); else shG.moveTo(pr[0], pr[1]); });
          shG.closePath(); shG.fill();
        }
        c.save(); c.globalAlpha = (look.dark ? 0.38 : 0.22) * clamp(look.lightI * 1.4, 0, 1); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(shc, 0, 0); c.restore();
      }
      for (const f of world.cast) drawFace(c, f, false);
      if (look.windows[0] > 0.02) { project(L, [2.05, 0.1, 5.6], pr); const r = L.f * 2.6 / pr[2]; const gw = c.createRadialGradient(pr[0], pr[1], 0, pr[0], pr[1], r); gw.addColorStop(0, css(look.windowC, 0.26 * look.windows[0])); gw.addColorStop(1, css(look.windowC, 0)); c.fillStyle = gw; c.beginPath(); c.ellipse(pr[0], pr[1], r, r * 0.45, 0, 0, 7); c.fill(); }
      // Ventilatorschacht und Ring (ruhend)
      c.save(); c.setTransform(dpr * fanX[0], dpr * fanX[1], dpr * fanY[0], dpr * fanY[1], dpr * fanC[0], dpr * fanC[1]);
      c.fillStyle = css(look.dark ? hx("#30343c") : hx("#7d828b")); c.beginPath(); c.arc(0, 0, 1.16, 0, 7); c.fill();
      c.fillStyle = css(look.dark ? darkOf("hpCase", hx("#fbfbfc")) : lambert([0, 0, 1], hx("#fbfbfc"))); c.beginPath(); c.arc(0, 0, 1.16, 0, 7); c.arc(0, 0, 1.04, 0, 7, true); c.fill();
      c.restore();
    }
    function prepLayout() {
      const sc = (P) => P.map((p) => { project(L, p, pr); return [pr[0], pr[1]]; });
      scr1 = sc(P1); scr2 = sc(P2); flowScr = world.flow.map(sc); pvScr = sc(world.pvQuad);
      project(L, FAN, pr); fanC = [pr[0], pr[1]];
      project(L, add(FAN, [FAN_R, 0, 0]), pr); fanX = [pr[0] - fanC[0], pr[1] - fanC[1]];
      project(L, add(FAN, [0, -FAN_R, 0]), pr); fanY = [pr[0] - fanC[0], pr[1] - fanC[1]];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of [...scr1, ...scr2, ...pvScr, ...flowScr.flat()]) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      const fr = Math.hypot(fanX[0], fanX[1]) + Math.hypot(fanY[0], fanY[1]);
      x0 = Math.min(x0, fanC[0] - fr) - 10; y0 = Math.min(y0, fanC[1] - fr) - 10; x1 = Math.max(x1, fanC[0] + fr) + 10; y1 = Math.max(y1, fanC[1] + fr) + 10;
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(L.w, Math.ceil(x1)); y1 = Math.min(L.h, Math.ceil(y1));
      rect = [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
    }
    function glowSprite() {   // vorgerenderter Lichtpunkt für den Energieimpuls
      spr.width = spr.height = 32; sprG.setTransform(1, 0, 0, 1, 0, 0); sprG.clearRect(0, 0, 32, 32);
      const gr = sprG.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, css([0.94, 1, 0.95], 1)); gr.addColorStop(0.3, css(look.beadC, 0.85)); gr.addColorStop(1, css(look.beadC, 0));
      sprG.fillStyle = gr; sprG.fillRect(0, 0, 32, 32);
    }
    function applyLayout(w, h) {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.4e6 / Math.max(1, w * h)));
      L = layout(w, h, isLocked());
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      for (const c of [canvas2d, sky, land, stat]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      prepLayout(); mKey = -1; lKey = "";
    }
    function pathAt(P, S, scr, vis, s, out) {   // Punkt und Sichtbarkeit bei Bogenlänge s
      if (s < 0 || s > S[S.length - 1]) return 0;
      let i = 1; while (i < S.length - 1 && S[i] < s) i++;
      const t = (s - S[i - 1]) / ((S[i] - S[i - 1]) || 1);
      out[0] = lerp(scr[i - 1][0], scr[i][0], t); out[1] = lerp(scr[i - 1][1], scr[i][1], t);
      return lerp(vis[i - 1], vis[i], t);
    }
    function strokePath(scr, vis, a) {
      g.beginPath();
      for (let i = 1; i < scr.length; i++) if (vis[i - 1] > 0 && vis[i] > 0) { g.moveTo(scr[i - 1][0], scr[i - 1][1]); g.lineTo(scr[i][0], scr[i][1]); }
      g.globalAlpha = a; g.stroke(); g.globalAlpha = 1;
    }
    function stamps(P, S, scr, vis, head, Lp) {
      const sz = Math.max(2.5, L.f * 0.2 / 34);
      for (let b = 0; b < 16; b++) {
        const s = head - b * 0.12; if (s < 0 || s > Lp) continue;
        const v = pathAt(P, S, scr, vis, s, pr); if (v <= 0.01) continue;
        const a = look.pv * v * Math.exp(-b * 0.12 / 1.0) * (b === 0 ? 0.8 : 1);
        g.globalAlpha = clamp(a, 0, 1); g.drawImage(spr, pr[0] - sz, pr[1] - sz, sz * 2, sz * 2);
      }
      g.globalAlpha = 1;
    }
    if (document.body && window.MutationObserver) {
      observer = new MutationObserver(() => { if (!L || L.locked === isLocked()) return; applyLayout(L.w, L.h); if (lastSt && lastSt.still) api.frame(lastSt); });
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    const api = {
      stillT: 13.5,
      get fps() { return look && look.night > 0.85 ? 8 : 12; },
      resize(st) { applyLayout(st.w, st.h); },
      frame(st) {
        if (!L) return;
        lastSt = st;
        const now = st.now.getTime(), mk = (st.dark ? 1e9 : 0) + Math.floor(now / 60000);
        if (mk !== mKey) {
          mKey = mk; look = computeLook(st);
          const pk = (st.dark ? "d" : "l") + look.month;
          if (pk !== palKey) { palKey = pk; pal = paletteOf(look.month, st.dark); glowSprite(); }
          const lk = pk + "/" + Math.floor(now / 300000) + "/" + look.windows.join(",");
          if (lk !== lKey) { lKey = lk; renderLand(); }
          renderSky();
          statG.setTransform(1, 0, 0, 1, 0, 0); statG.drawImage(sky, 0, 0); statG.drawImage(land, 0, 0);
          full = true;
        }
        const t = st.t, still = st.still, dt = clamp(t - lastT, 0, 0.25); lastT = t;
        g.setTransform(1, 0, 0, 1, 0, 0);
        const [rx, ry, rw, rh] = rect, D = dpr;
        if (full) { g.drawImage(stat, 0, 0); full = false; }
        else g.drawImage(stat, rx * D, ry * D, rw * D, rh * D, rx * D, ry * D, rw * D, rh * D);
        g.save(); g.setTransform(D, 0, 0, D, 0, 0); g.beginPath(); g.rect(rx, ry, rw, rh); g.clip();
        // Glanz über dem Modulfeld
        const sh = (t + 6) % 11;
        if (!still && look.pv > 0.02 && sh < 2.8) {
          const a = look.pv * look.sheenA * Math.sin(Math.PI * sh / 2.8), pos = -0.4 + (sh / 2.8) * 2.0, q = pvScr;
          g.save(); g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) g.lineTo(q[i][0], q[i][1]); g.closePath(); g.clip();
          const ax = q[0][0], ay = q[0][1], bx = q[2][0], by = q[2][1], gr = g.createLinearGradient(ax, ay, bx, by), c0 = clamp((pos - 0.09) / 1.18, 0, 1), c1 = clamp(pos / 1.18, 0, 1), c2 = clamp((pos + 0.09) / 1.18, 0, 1);
          gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(c0, "rgba(255,255,255,0)"); gr.addColorStop(c1, `rgba(255,255,255,${a})`); gr.addColorStop(c2, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,0)");
          g.globalCompositeOperation = "lighter"; g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); g.restore();
        }
        // Energieweg: ruhige Linie, darüber der Impuls
        pulseHeads(t, still, Lp1, Lp2, heads);
        if (look.pv > 0.01) {
          g.strokeStyle = css(look.beadC); g.lineWidth = Math.max(1.2, L.f * 0.09 / 32); g.lineCap = "round";
          strokePath(scr1, world.vis1, look.pv * look.pvBase * 1.6); strokePath(scr2, world.vis2, look.pv * look.pvBase * 1.6);
          stamps(P1, S1, scr1, world.vis1, heads[0], Lp1); stamps(P2, S2, scr2, world.vis2, heads[1], Lp2);
        }
        // Ventilator: Schacht, Flügel, Gitter (in der schräg gesehenen Ebene des Geräts)
        fanAng = still ? 0.6 : (fanAng + dt * look.fanW * (1 + 0.35 * heads[2] * look.pv)) % (Math.PI * 2);
        g.save(); g.transform(fanX[0], fanX[1], fanY[0], fanY[1], fanC[0], fanC[1]);
        g.fillStyle = look.dark ? "#0b0d11" : "#1b1e24"; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill();
        g.fillStyle = css(scl3(look.dark ? hx("#646b78") : hx("#9ba1ab"), lerp(1, look.dark ? 0.55 : 0.8, look.night)));
        const ca = Math.cos(fanAng), sa = Math.sin(fanAng);
        for (const pl of blades) { g.beginPath(); pl.forEach(([x, y], i) => { const X = x * ca - y * sa, Y = x * sa + y * ca; if (i) g.lineTo(X, -Y); else g.moveTo(X, -Y); }); g.closePath(); g.fill(); }
        g.beginPath(); g.arc(0, 0, 0.2, 0, 7); g.fill();
        g.strokeStyle = look.dark ? "rgba(12,14,18,0.9)" : "rgba(37,40,46,0.85)"; g.lineWidth = 0.035;
        for (let r = 0.24; r < 0.99; r += 0.105) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
        g.restore();
        // Luftstrom: kurze, nach vorn wandernde Striche
        g.strokeStyle = css(look.flowC); g.lineWidth = Math.max(1, L.f * 0.05 / 32); g.lineCap = "round";
        const fl = still ? 0.35 : fract(t * 0.5);
        for (const fs of flowScr) {
          for (let i = 0; i < fs.length - 1; i++) {
            const s = (i + 0.5) * 0.17, ph = fract(s * 1.15 - fl), dash = sstep(0, 0.3, ph) * (1 - sstep(0.38, 0.8, ph));
            const a = look.flowA * (1 + heads[2] * look.pv * 0.6) * dash * sstep(0.02, 0.25, s) * (1 - sstep(0.6, 1.65, s)) * 0.8;
            if (a < 0.02) continue;
            g.globalAlpha = clamp(a, 0, 1); g.beginPath(); g.moveTo(fs[i][0], fs[i][1]); g.lineTo(fs[i + 1][0], fs[i + 1][1]); g.stroke();
          }
        }
        g.globalAlpha = 1; g.restore();
      },
      dispose() { if (observer) observer.disconnect(); for (const c of [sky, land, stat, shc, spr, cl]) c.width = c.height = 1; },
    };
    return api;
  }

  window.PWBG = window.PWBG || {};
  window.PWBG["sonnentag"] = {
    title: "Sonnentag",
    create(opts) {
      const { canvas2d, canvas3d, THREE } = opts;
      if (THREE) {
        try {
          const s = createGL(opts);
          canvas2d.style.display = "none"; canvas3d.style.display = "";
          return s;
        } catch (e) { if (window.PWBG_PREVIEW) console.warn("Sonnentag: WebGL nicht verfügbar, 2D-Ersatz", e); }
      }
      canvas3d.style.display = "none"; canvas2d.style.display = "";
      try { return create2D(opts); } catch (e) { if (window.PWBG_PREVIEW) console.warn("Sonnentag: 2D fehlgeschlagen", e); return null; }
    },
  };
})();
