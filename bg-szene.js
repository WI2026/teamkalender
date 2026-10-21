/* Wärmebild: Hintergrund für den PentaWerk-Teamkalender.
   Grundriss wie durch die Wärmebildkamera gesehen: Räume mit Fußbodenheizung (bifilare Heizschnecken, Vor- und
   Rücklauf abwechselnd, in der Mitte ein S-Bogen), der Heizkreisverteiler, und draußen vor der Außenwand das
   Außengerät der Luft-Wasser-Wärmepumpe (Ventilator oben, kalte Abluft) neben einem Garagendach mit PV-Modulen.
   Vor- und Rücklauf kommen vom Außengerät durch die Außenwand zum Verteiler; warmes Wasser zieht als ruhige
   Wärmewelle vom Außengerät über den Verteiler in die Räume und kühlt dabei ab.
   Tageszeit: In der Sonne werden die Module warm, die Wärmepumpe läuft mit Sonnenstrom kräftiger, durchs
   Südfenster fällt ein warmer Sonnenfleck. Nachts sind die Module kälter als die Umgebung, alles läuft ruhiger.
   Aufbau: Geometrie und Rohr-Wärmefeld einmal je Fenstergröße (kleine Textur), pro Bild ein Shader (WebGL)
   bzw. ein grobes Raster mit Linien darüber (2D-Ersatz ohne WebGL). */
(() => {
  "use strict";
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const DEF_PAL = { navy: "#414d86", leaf: "#75c17d", blue: "#1349a8", green: "#96b452", red: "#ad0004", orange: "#df4505", silver: "#b7b6bc" };

  /* ---------------- Geometrie ---------------- */

  // Ein Arm der Schnecke im lokalen Rahmen (u, v). Jede Seite rückt s/2 nach innen; Arm B (Rücklauf, um s
  // versetzt) liegt dadurch überall zwischen den Bahnen von Arm A (Vorlauf).
  function snailArm(Wl, Hl, s, off) {
    const pos = (n) => { const k = n & 3, d = n * s / 2 + off; return k === 1 ? Wl - d : k === 2 ? Hl - d : d; };
    const pts = [];
    for (let n = 0; n < 2000; n++) {
      pts.push((n & 1) === 0 ? [pos(n + 1), pos(n)] : [pos(n), pos(n + 1)]);
      const next = ((n + 1) & 1 ? Hl : Wl) - (n + 1) * s - 2 * off;
      if (next < s * 0.999) break;
    }
    return pts;
  }
  // Ganzer Heizkreis: Vorlauf spiralt hinein, Rücklauf dazwischen hinaus. Die Kurzseite wird so gerundet, dass
  // sich beide Arme in der Mitte auf einer Linie treffen: das ergibt zwei 180°-Bögen mit r = s/2 (echter S-Bogen).
  function snailLocal(Wl, Hl, s) {
    if (Wl >= Hl) Hl = 2 * Math.floor(Hl / (2 * s) + 1e-6) * s;
    else Wl = (2 * Math.floor((Wl / s - 1) / 2 + 1e-6) + 1) * s;
    if (Math.min(Wl, Hl) < 4 * s) return null;
    const A = snailArm(Wl, Hl, s, 0), B = snailArm(Wl, Hl, s, s);
    if (A.length < 3 || B.length < 3) return null;
    const a1 = A[A.length - 2], a2 = A[A.length - 1], b1 = B[B.length - 2], b2 = B[B.length - 1];
    const eq = (p, q) => Math.abs(p - q) < 1e-4 * s;
    const one = (eq(a1[1], a2[1]) && eq(a2[1], b1[1]) && eq(b1[1], b2[1])) || (eq(a1[0], a2[0]) && eq(a2[0], b1[0]) && eq(b1[0], b2[0]));
    const pts = one ? A.slice(0, -1).concat(B.slice(0, -1).reverse()) : A.concat(B.reverse());
    return { pts, Wl, Hl };
  }
  const frameMap = (ox, oy, eu, ev) => (q) => [ox + q[0] * eu[0] + q[1] * ev[0], oy + q[0] * eu[1] + q[1] * ev[1]];
  // doppelte und gerade durchlaufende Stützpunkte entfernen (sonst entstehen Bögen ohne Ecke)
  function clean(pts) {
    const out = [];
    for (const p of pts) {
      const n = out.length;
      if (n && Math.hypot(p[0] - out[n - 1][0], p[1] - out[n - 1][1]) < 0.5) continue;
      if (n >= 2) {
        const a = out[n - 2], b = out[n - 1];
        const cr = (b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0]);
        const dt = (b[0] - a[0]) * (p[0] - b[0]) + (b[1] - a[1]) * (p[1] - b[1]);
        if (Math.abs(cr) < 1e-6 * (1 + Math.abs(dt)) && dt > 0) out.pop();
      }
      out.push(p);
    }
    return out;
  }

  // Querformat (Desktop): Süden unten. Zwei Räume mit je einem Heizkreis, Verteilerschrank in der Innenwand,
  // Außengerät davor, links das Garagendach mit Modulen, rechts das Terrassenfenster.
  function landscape(G) {
    const { w, h } = G;
    const s = clamp(h * 0.029, 18, 34), ppm = s / 0.15;            // Rohrabstand 15 cm
    const tW = 0.30 * ppm, tI = 0.17 * ppm, eE = 0.10 * ppm;
    const yWo = h - 1.0 * ppm, yWi = yWo - tW, xWo = w - 0.12 * ppm, xWi = xWo - tW;
    const yT = yWi - 5.0 * ppm;                                     // Raumtiefe 5 m
    const xI1 = xWi - 3.6 * ppm, xI0 = xI1 - tI, xc = (xI0 + xI1) / 2;
    const yA = yWi - 0.25 * ppm, yB = yWi - 0.13 * ppm;              // Anbindeleitungen an der Außenwand
    const xs = xc - 0.035 * ppm, xr = xc + 0.035 * ppm;             // Vorlauf- und Rücklaufbalken
    const H0 = yA - (yT + eE) + s;                                  // Schnecke reicht von der Anbindung bis zur Rückwand
    const xL = Math.max(xI0 - 4.6 * ppm, -0.3 * ppm);
    const loops = [];
    // Je Raum eine Schnecke, Zuleitung von unten aus der Anbindung; Vor- und Rücklauf gehen am Verteiler ab
    const room = (xa, xb, toRight) => {
      const W0 = (xb - eE) - (xa + eE) + 2 * s;
      if (W0 < 7 * s) return;
      const sn = snailLocal((2 * Math.floor((W0 / s - 1) / 2 + 1e-6) + 1) * s, H0, s);
      if (!sn) return;
      const r = (W0 - sn.Wl) / 2;
      // Eintritt am verteilerseitigen Ende der Schnecke (lokal u = W)
      const ox = toRight ? (xb - eE) + 1.5 * s - r : (xa + eE) - 1.5 * s + r;
      const pts = sn.pts.map(frameMap(ox, yA, [toRight ? -1 : 1, 0], [0, -1]));
      const e = pts[pts.length - 1];
      loops.push(clean([[xs, yA]].concat(pts, [[e[0], yB], [xr, yB]])));
    };
    room(xI1, xWi, true);
    room(xL, xI0, false);
    G.int = [xI0, xI1, xL > 0 ? xL - tI : -1e5, xL > 0 ? xL : -1e5 + 1];
    G.wall = [yWi, yWo, xWi, xWo];
    G.win = [Math.max(xI1 + 0.4 * ppm, xWi - 1.75 * ppm), xWi - 0.35 * ppm, 0];
    const yBar = yA - 0.1 * ppm;
    G.cab = [xc - 0.11 * ppm, yBar - 0.07 * ppm, xc + 0.11 * ppm, yWi];
    G.barS = [xs, yBar, xs, yWi]; G.barR = [xr, yBar, xr, yWi];
    const Lu = 1.0 * ppm, Du = 0.7 * ppm, ux0 = xs - 0.2 * ppm, uy0 = yWo + 0.12 * ppm;
    G.unit = [ux0, uy0, ux0 + Lu, uy0 + Du]; G.fan = [ux0 + 0.64 * Lu, uy0 + 0.5 * Du, 0.28 * ppm];
    const yu = uy0 + 0.16 * ppm;
    const rx1 = ux0 - 0.28 * ppm, mw = 1.7 * ppm, mh = 1.0 * ppm, gap = 0.025 * ppm;
    const n = Math.max(1, Math.ceil((rx1 + 0.2 * ppm) / (mw + gap)));
    G.roof = [-1e5, yWo, rx1, 1e5];
    G.pv = [rx1 - 0.2 * ppm - n * (mw + gap) + gap, yWo + 0.22 * ppm, mw, mh]; G.pv2 = [n, 2, gap, 1];
    G.supply = [[xs, yu], [xs, yA]];
    G.supplyStub = [[xs, yA], [xs, yBar]];
    G.loops = loops;
    G.ret = [[xr, yB], [xr, yu]];
    G.retStub = [[xr, yB], [xr, yBar]];
    Object.assign(G, { s, ppm, header: 196 });
  }

  // Hochformat (Telefon): ein Raum über die ganze Breite, Süden rechts (Fenster in der rechten Wand),
  // unten die Außenwand mit Verteiler, davor das Außengerät und das Garagendach mit Modulen.
  function portrait(G) {
    const { w, h } = G;
    const s = clamp(w * 0.056, 18, 26), ppm = s / 0.15;
    const tW = 0.30 * ppm, eE = 0.08 * ppm;
    const yWo = h - 1.1 * ppm, yWi = yWo - tW, xWo = w + 0.18 * ppm, xWi = xWo - tW;
    const xI1 = 0.06 * ppm, xI0 = xI1 - 0.17 * ppm;
    const yT = yWi - 4.8 * ppm;
    const span = (xWi - eE) - (xI1 + eE), W0 = span + 2 * s;
    const OyP = yWi - 0.27 * ppm;
    const sn = snailLocal((2 * Math.floor((W0 / s - 1) / 2 + 1e-6) + 1) * s, OyP - (yT + 0.1 * ppm) + s, s);
    const OxP = (xWi - eE) + 1.5 * s - (sn ? (W0 - sn.Wl) / 2 : 0);
    const xA = sn ? OxP - sn.Wl + 0.5 * s : xI1 + eE, xB = xA + s;
    const ySb = yWi - 0.14 * ppm, yRb = yWi - 0.06 * ppm;
    const xhs = xB + 0.26 * ppm, xhr = xhs + 0.08 * ppm;
    G.int = [xI0, xI1, -1e5, -1e5 + 1];
    G.wall = [yWi, yWo, xWi, xWo];
    const w0 = clamp(0.47 * h, 0.3 * h, yWi - 1.5 * ppm);
    G.win = [w0, w0 + 1.1 * ppm, 1];
    G.cab = [Math.max(xI1, xA - 0.12 * ppm), yWi - 0.21 * ppm, xhr + 0.12 * ppm, yWi];
    G.barS = [xA - 0.08 * ppm, ySb, xhs, ySb]; G.barR = [xA - 0.08 * ppm, yRb, xhr, yRb];
    const Lu = 0.82 * ppm, Du = 0.62 * ppm, ux0 = xhs - 0.2 * ppm, uy0 = yWo + 0.12 * ppm;
    G.unit = [ux0, uy0, ux0 + Lu, uy0 + Du]; G.fan = [ux0 + 0.62 * Lu, uy0 + 0.5 * Du, 0.25 * ppm];
    const yu = uy0 + 0.16 * ppm;
    const rx0 = ux0 + Lu + 0.14 * ppm, gap = 0.025 * ppm;
    G.roof = [rx0, yWo, 1e5, 1e5];
    G.pv = [rx0 + 0.12 * ppm, yWo + 0.15 * ppm, 1.7 * ppm, 1.0 * ppm]; G.pv2 = [3, 2, gap, 1];
    G.supply = [[xhs, yu], [xhs, ySb], [xA, ySb]];
    G.supplyStub = [[xA, ySb], [xA - 0.08 * ppm, ySb]];
    G.loops = sn ? [clean([[xA, ySb]].concat(sn.pts.map(frameMap(OxP, OyP, [-1, 0], [0, -1])), [[xB, yRb]]))] : [];
    G.ret = [[xB, yRb], [xhr, yRb], [xhr, yu]];
    G.retStub = [[xB, yRb], [xA - 0.08 * ppm, yRb]];
    Object.assign(G, { s, ppm, header: 262 });
  }

  function layout(w, h) {
    const G = { w, h, portrait: h > w * 1.1 };
    if (G.portrait) portrait(G); else landscape(G);
    return G;
  }

  // Polylinie mit runden 90°-Bögen ablaufen. fn(x, y, a) je Stützpunkt, Rückgabe: Gesamtlänge.
  function walk(pts, r, step, fn) {
    const n = pts.length, seg = [];
    if (n < 2) return 0;
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy);
      seg.push({ l, ux: l ? dx / l : 0, uy: l ? dy / l : 0 });
    }
    const t = new Array(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
      const l1 = seg[i - 1].l * (i - 1 === 0 ? 1 : 0.5), l2 = seg[i].l * (i + 1 === n - 1 ? 1 : 0.5);
      t[i] = Math.max(0, Math.min(r, l1, l2));
    }
    let a = 0;
    for (let i = 0; i < n - 1; i++) {
      const S = seg[i], sx = pts[i][0] + S.ux * t[i], sy = pts[i][1] + S.uy * t[i];
      const L = S.l - t[i] - t[i + 1];
      if (fn) for (let q = 0; q < L; q += step) fn(sx + S.ux * q, sy + S.uy * q, a + q);
      a += Math.max(0, L);
      const k = i + 1;
      if (k < n - 1 && t[k] > 0) {
        const R = t[k], T = seg[k];
        const cx = pts[k][0] - S.ux * R + T.ux * R, cy = pts[k][1] - S.uy * R + T.uy * R;
        const arc = R * Math.PI / 2;
        if (fn) for (let q = 0; q < arc; q += step) {
          const th = q / R;
          fn(cx - T.ux * R * Math.cos(th) + S.ux * R * Math.sin(th), cy - T.uy * R * Math.cos(th) + S.uy * R * Math.sin(th), a + q);
        }
        a += arc;
      }
    }
    return a;
  }

  /* ---------------- Wärmefeld der Rohre (einmal je Fenstergröße) ---------------- */

  // Gaußsche Unschärfe als drei Kastenfilter: so verteilt der Estrich die Wärme der Rohre
  function boxRadii(sigma) {
    const n = 3, wi = Math.sqrt(12 * sigma * sigma / n + 1);
    let wl = Math.floor(wi); if (wl % 2 === 0) wl--;
    const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    return [0, 1, 2].map((i) => ((i < m ? wl : wl + 2) - 1) / 2);
  }
  function boxH(src, dst, w, h, r) {
    const inv = 1 / (2 * r + 1);
    for (let j = 0; j < h; j++) {
      const o = j * w, first = src[o], last = src[o + w - 1];
      let acc = (r + 1) * first;
      for (let k = 0; k < r; k++) acc += k < w ? src[o + k] : last;
      for (let i = 0; i < w; i++) {
        const ia = i + r, ib = i - r - 1;
        acc += (ia < w ? src[o + ia] : last) - (ib >= 0 ? src[o + ib] : first);
        dst[o + i] = acc * inv;
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    const inv = 1 / (2 * r + 1), lo = (h - 1) * w;
    for (let i = 0; i < w; i++) {
      const first = src[i], last = src[lo + i];
      let acc = (r + 1) * first;
      for (let k = 0; k < r; k++) acc += k < h ? src[k * w + i] : last;
      for (let j = 0; j < h; j++) {
        const ja = j + r, jb = j - r - 1;
        acc += (ja < h ? src[ja * w + i] : last) - (jb >= 0 ? src[jb * w + i] : first);
        dst[j * w + i] = acc * inv;
      }
    }
  }
  function gauss(src, w, h, sigma, tmp) {
    const out = Float32Array.from(src);
    for (const r of boxRadii(sigma)) if (r >= 1) { boxH(out, tmp, w, h, r); boxV(tmp, out, w, h, r); }
    return out;
  }
  // ruhige Estrich-Struktur: zwei Lagen Wertrauschen auf einem kleinen Gitter
  function lattice(cw, ch, cell, seed) {
    const nx = Math.ceil(cw / cell) + 2, ny = Math.ceil(ch / cell) + 2, v = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const t = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; v[j * nx + i] = t - Math.floor(t); }
    return (x, y) => {
      const gx = x / cell, gy = y / cell, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      const u = fx * fx * (3 - 2 * fx), q = fy * fy * (3 - 2 * fy), o = j * nx + i;
      return mix(mix(v[o], v[o + 1], u), mix(v[o + nx], v[o + nx + 1], u), q);
    };
  }

  // Feld als zwei RGBA-Bilder:
  //  d1: Abstand zum nächsten Rohr, Temperatur dieses Rohrs (1 = Vorlauf am Verteiler … 0 = Rücklauf am Ende),
  //      Estrichwärme gleichmäßig / Verlauf (weich verteilt)
  //  d2: Strömungsphase des nächsten Rohrs cos / sin (für die Wärmewelle), Estrich-Struktur, großräumige Bodenwärme
  function buildField(G) {
    const s = G.s, pad = Math.ceil(1.5 * s);
    const x0 = -pad, y0 = -Math.ceil(0.15 * G.h) - pad;            // oben Reserve, falls das Fenster höher wird
    const cw = G.w + 2 * pad, ch = G.h - y0 + pad;
    const tx = Math.max(2, Math.sqrt(cw * ch / 70000));
    const fw = Math.ceil(cw / tx), fh = Math.ceil(ch / tx), N = fw * fh;
    const U = new Float32Array(N), V = new Float32Array(N);
    const Rm = 0.75 * s, D = new Float32Array(N).fill(Rm), Gt = new Float32Array(N), C = new Float32Array(N), S = new Float32Array(N);
    const step = tx * 0.5, r = 0.5 * s, ri = Math.ceil(Rm / tx);
    const k0 = TAU / (12 * G.ppm);                                  // eine Welle je 12 m Rohr
    const lens = G.loops.map((P) => walk(P, r, 1, null));
    const Ld = 0.75 * Math.max(1000, ...lens);
    const aS = walk(G.supply, r, 1, null), aR = aS + (lens[0] || 0);
    const put = (x, y, g, th, dm) => {
      const fx = (x - x0) / tx - 0.5, fy = (y - y0) / tx - 0.5;
      if (fx < -ri || fy < -ri || fx > fw + ri || fy > fh + ri) return;
      // weiche Wärme im Estrich: Linie bilinear eintragen, später weichzeichnen
      if (fx >= 0 && fy >= 0 && fx < fw - 1 && fy < fh - 1) {
        const ix = fx | 0, iy = fy | 0, rx = fx - ix, ry = fy - iy, o = iy * fw + ix;
        const w00 = (1 - rx) * (1 - ry) * 0.5, w10 = rx * (1 - ry) * 0.5, w01 = (1 - rx) * ry * 0.5, w11 = rx * ry * 0.5;
        U[o] += w00; V[o] += w00 * g; U[o + 1] += w10; V[o + 1] += w10 * g;
        U[o + fw] += w01; V[o + fw] += w01 * g; U[o + fw + 1] += w11; V[o + fw + 1] += w11 * g;
      }
      // Abstandsfeld: jedes Texel merkt sich das nächste Rohr
      const cc = Math.cos(th) * dm, ss = Math.sin(th) * dm;
      const i0 = Math.max(0, Math.ceil(fx - ri)), i1 = Math.min(fw - 1, Math.floor(fx + ri));
      const j0 = Math.max(0, Math.ceil(fy - ri)), j1 = Math.min(fh - 1, Math.floor(fy + ri));
      for (let j = j0; j <= j1; j++) {
        const dy = (j - fy) * tx, dy2 = dy * dy, o = j * fw;
        for (let i = i0; i <= i1; i++) {
          const dx = (i - fx) * tx, d2 = dx * dx + dy2, q = o + i;
          if (d2 < D[q] * D[q]) { D[q] = Math.sqrt(d2); Gt[q] = g; C[q] = cc; S[q] = ss; }
        }
      }
    };
    walk(G.supply, r, step, (x, y, a) => put(x, y, 1.05, k0 * a, 1));
    walk(G.supplyStub, r, step, (x, y, a) => put(x, y, 1.0, k0 * (aS + a), 0.6));
    G.loops.forEach((P, i) => { const len = lens[i]; walk(P, r, step, (x, y, a) => put(x, y, 1 - a / len, k0 * (aS + a), Math.exp(-a / Ld))); });
    walk(G.ret, r, step, (x, y, a) => put(x, y, 0, k0 * (aR + a), 0.15));
    walk(G.retStub, r, step, (x, y) => put(x, y, 0, 0, 0));

    const tmp = new Float32Array(N), sw = 0.85 * s / tx;
    const wU = gauss(U, fw, fh, sw, tmp), wV = gauss(V, fw, fh, sw, tmp);
    const big = gauss(wU, fw, fh, 2.2 * s / tx, tmp);              // großräumig: warm über den Heizflächen
    const nW = s / tx;
    const n1 = lattice(cw, ch, 1.3 * G.ppm, 1), n2 = lattice(cw, ch, 0.45 * G.ppm, 2);
    const d1 = new Uint8Array(N * 4), d2 = new Uint8Array(N * 4);
    const q8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);
    // weiche Sättigung, damit sich Rohre am Verteiler nicht zu grellen Flecken aufaddieren
    const knee = (x, a, m) => a + (m - a) * (1 - Math.exp(-(x - a) / (m - a)));
    for (let j = 0; j < fh; j++) {
      const ly = (j + 0.5) * tx;
      for (let i = 0; i < fw; i++) {
        const o = j * fw + i, p = o * 4, lx = (i + 0.5) * tx;
        const u1 = wU[o] * nW, k1 = u1 > 0.85 ? knee(u1, 0.85, 1.2) / u1 : 1;
        d1[p] = q8(D[o] / Rm); d1[p + 1] = q8(Gt[o] / 1.05);
        d1[p + 2] = q8(u1 * k1 / 1.5); d1[p + 3] = q8(wV[o] * nW * k1 / 1.5);
        d2[p] = q8(0.5 + 0.5 * C[o]); d2[p + 1] = q8(0.5 + 0.5 * S[o]);
        d2[p + 2] = q8(0.62 * n1(lx, ly) + 0.38 * n2(lx, ly));
        const b = big[o] * nW * 1.1; d2[p + 3] = q8(b >= 1 ? 1 : b * b * (3 - 2 * b));
      }
    }
    return { fw, fh, tx, x0, y0, cw: fw * tx, ch: fh * tx, d1, d2, still: (k0 * (aS + 3.2 * G.ppm)) % TAU };
  }

  /* ---------------- Farben: Wärmebild-Skala aus den Markenfarben (OKLCH) ---------------- */
  // kalt = Navy/Blau, mittel = Schiefer, warm = Rot → Orange → helles Bernstein. Kein Magenta (Farbton 300–350°).
  // Zeile: [t, L, C, Farbton] – Farbton als Grad oder als Name einer Markenfarbe.
  const RAMP = {
    dark: [[0, 0.11, 0.03, "navy"], [0.15, 0.16, 0.048, "navy"], [0.28, 0.21, 0.064, "navy"], [0.38, 0.245, 0.072, "blue"],
      [0.46, 0.27, 0.05, 255], [0.54, 0.31, 0.03, 15], [0.62, 0.36, 0.075, "red"], [0.70, 0.42, 0.10, "red"],
      [0.78, 0.49, 0.115, 33], [0.86, 0.57, 0.12, "orange"], [0.93, 0.67, 0.11, 55], [1, 0.78, 0.085, 70]],
    light: [[0, 0.80, 0.06, "blue"], [0.12, 0.85, 0.05, "blue"], [0.24, 0.895, 0.036, "blue"], [0.34, 0.93, 0.022, "blue"],
      [0.42, 0.955, 0.012, "navy"], [0.47, 0.966, 0.008, 70], [0.52, 0.958, 0.024, 58], [0.58, 0.94, 0.045, 52],
      [0.65, 0.915, 0.064, "orange"], [0.73, 0.88, 0.082, 45], [0.82, 0.835, 0.098, 42], [0.91, 0.78, 0.112, "orange"], [1, 0.72, 0.13, "orange"]],
  };
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  function hexLab(hex) {
    const n = parseInt(hex.slice(1), 16), r = toLin((n >> 16 & 255) / 255), g = toLin((n >> 8 & 255) / 255), b = toLin((n & 255) / 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function labByte(L, a, b, out, o) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const c = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    for (let k = 0; k < 3; k++) out[o + k] = clamp(Math.round(toSrgb(clamp(c[k], 0, 1)) * 255), 0, 255);
  }
  // Tag, Dämmerung (warm → bernstein), Nacht (warm → rosé, kalt → lavendel), jeweils für hell und dunkel
  function rowShift(dark, row, t, L, C, h) {
    const warm = sstep(0.42, 0.56, t), cold = 1 - sstep(0.36, 0.48, t);
    if (row === 1) { h += 9 * warm + (dark ? 5 : 10) * cold; C *= 1 + 0.04 * warm; }
    else if (row === 2) {
      h += -7 * warm + (dark ? -4 : 14) * cold; C *= 1 - 0.08 * warm;
      L -= dark ? 0.012 * warm + 0.008 * cold : 0.006;
    }
    return [L, C, Math.min(h, 296)];
  }
  function makeLut(dark, pal) {
    const hueOf = (k) => { const [, a, b] = hexLab(pal[k] || DEF_PAL[k]); return ((Math.atan2(b, a) / RAD) + 360) % 360; };
    const stops = (dark ? RAMP.dark : RAMP.light).map(([t, L, C, h]) => [t, L, C, typeof h === "string" ? hueOf(h) : h]);
    const out = new Uint8Array(256 * 4 * 4);
    for (let row = 0; row < 4; row++) {
      const labs = stops.map(([t, L, C, h]) => { const [L2, C2, h2] = rowShift(dark, Math.min(row, 2), t, L, C, h); return [t, L2, C2 * Math.cos(h2 * RAD), C2 * Math.sin(h2 * RAD)]; });
      for (let i = 0; i < 256; i++) {
        const t = i / 255; let k = 0;
        while (k < labs.length - 2 && t > labs[k + 1][0]) k++;
        const A = labs[k], B = labs[k + 1], f = clamp((t - A[0]) / (B[0] - A[0]), 0, 1), o = (row * 256 + i) * 4;
        labByte(mix(A[1], B[1], f), mix(A[2], B[2], f), mix(A[3], B[3], f), out, o);
        out[o + 3] = 255;
      }
    }
    return out;
  }

  /* ---------------- Stimmung: Tageszeit, Sonnenstrom, Sonnenfleck ---------------- */
  function newMood() {
    return { sunM: new Float32Array(4), sunO: new Float32Array(4) };
  }
  function mood(st, G, M) {
    const el = st.sun.elevation, az = st.sun.azimuth * RAD, dl = st.sun.daylight, ppm = G.ppm;
    // Sonnenstrom: die PV-Anlage liefert nur bei Tag, etwa mit dem Sinus der Sonnenhöhe
    const pv = sstep(0, 1, clamp(Math.sin(Math.max(el, 0) * RAD) / Math.sin(30 * RAD), 0, 1));
    M.dark = st.dark; M.pv = pv; M.dl = dl;
    M.hp = mix(0.55, 1, pv);                         // Wärmepumpe: nachts gedrosselt, mit Sonnenstrom kräftig
    M.er = mix(0.42, 0.46, pv); M.de = mix(0.32, 0.46, pv);
    M.kW = 0.085; M.kC = mix(0.068, 0.082, pv); M.kH = 0.03; M.kF = mix(0.07, 0.10, pv); M.kN = 0.022;
    M.base = 0.455; M.cool = 0.045; M.calm = 0.45; M.cap = st.dark ? 0.5 : 0.58;
    M.Tout = mix(0.17, 0.24, dl);
    M.Tglass = mix(0.09, 0.17, dl);
    M.Tpv = mix(M.Tout - 0.05, 0.62, pv); M.Tframe = mix(M.Tout - 0.02, 0.47, pv);
    M.Tsup = mix(0.66, 0.76, pv); M.Tret = mix(0.53, 0.57, pv);
    M.period = mix(58, 42, pv); M.fanPeriod = mix(26, 12, pv);
    M.day = dl; M.dusk = 0.9 * clamp(4 * dl * (1 - dl), 0, 1);
    M.grain = st.dark ? 0.010 : 0.008; M.vig = st.dark ? 0.10 : 0.04;
    // Sonnenfleck: Licht fällt durchs Südfenster (Brüstung 0, Sturz 2,1 m) als Parallelogramm auf den Boden
    const sx = G.portrait ? -Math.cos(az) : Math.sin(az), sy = G.portrait ? -Math.sin(az) : -Math.cos(az);
    const facing = Math.max(0, -Math.cos(az));
    const hgt = 2.1 * ppm / Math.tan(Math.max(el, 7) * RAD), Dx = -sx * hgt, Dy = -sy * hgt;
    const [yWi, , xWi] = G.wall, [w0, w1, side] = G.win;
    const Ax = side ? xWi : w0, Ay = side ? w0 : yWi, ex = side ? 0 : w1 - w0, ey = side ? w1 - w0 : 0;
    const det = ex * Dy - Dx * ey, str = Math.abs(det) > 1 ? 0.11 * Math.pow(facing, 0.6) * sstep(0, 9, el) : 0;
    const soft = 0.1 * ppm + 0.05 * hgt;
    M.sunS = str;
    if (str > 0) {
      M.sunM[0] = Dy / det; M.sunM[1] = -Dx / det; M.sunM[2] = -ey / det; M.sunM[3] = ex / det;
      M.sunO[0] = Ax; M.sunO[1] = Ay; M.sunO[2] = Math.min(0.45, soft / Math.hypot(ex, ey)); M.sunO[3] = Math.min(0.45, soft / hgt);
    }
    return M;
  }

  /* ---------------- WebGL ---------------- */
  const VERT = "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }";
  // Pass 1 (selten): ruhendes Wärmebild in eine Textur backen. R+G Temperatur (16 bit), B Wellenanteil, A Strömungsphase
  const BAKE = [
    "uniform sampler2D uF1; uniform sampler2D uF2;",
    "uniform vec4 uView; uniform vec4 uFld; uniform vec4 uGeo; uniform vec4 uE; uniform vec4 uK; uniform vec4 uB;",
    "uniform vec4 uWall; uniform vec4 uInt; uniform vec4 uWin; uniform vec4 uSunM; uniform vec4 uSunO; uniform vec4 uSunS;",
    "uniform vec4 uUnit; uniform vec4 uFan; uniform vec4 uRoof; uniform vec4 uPV; uniform vec4 uPV2;",
    "uniform vec4 uBarS; uniform vec4 uBarR; uniform vec4 uCab; uniform vec4 uLev; uniform vec4 uLev2; uniform vec4 uMix;",
    "float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }",
    "float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }",
    "float seg(vec2 p, vec4 s, out float t){ vec2 pa = p - s.xy, ba = s.zw - s.xy; float L = max(length(ba), 1e-3); t = clamp(dot(pa, ba) / (L * L), 0.0, 1.0); t *= L; return length(pa - ba * (t / L)); }",
    "float ln(float d, float w, float aa){ return 1.0 - smoothstep(w - aa, w + aa, d); }",
    "float band(float x, float a, float b, float aa){ return smoothstep(a - aa, a + aa, x) - smoothstep(b - aa, b + aa, x); }",
    "float node(vec2 p, vec4 s, float sp, float r, float aa){ float t; float d = seg(p, s, t); vec2 dir = normalize(s.zw - s.xy); float tk = floor(t / sp + 0.5) * sp; return ln(length(p - s.xy - dir * tk), r, aa); }",
    "void main(){",
    "  float pr = uView.z, aa = 0.7 / pr, ppm = uGeo.y;",
    "  vec2 css = gl_FragCoord.xy / pr; css.y = uView.y - css.y;",
    "  vec2 p = vec2(css.x, css.y - uGeo.x);",
    "  vec2 uv = (p - uFld.xy) / uFld.zw;",
    "  vec4 a = texture2D(uF1, uv); vec4 b = texture2D(uF2, uv);",
    "  float hdr = 1.0 - smoothstep(uView.w * 0.5, uView.w * 1.15, css.y), calm = 1.0 - uB.z * hdr;",
    // Rohre: Wärme im Estrich, weiche Rohrbahnen (Vorlauf wärmer als Rücklauf), wandernde Wärmewelle
    "  float band0 = 1.0 - smoothstep(0.06, 0.5, a.r * 0.75);",   // weiche Bahn: warm über dem Rohr, kühl auf halbem Abstand
    "  float heat = uE.x + uE.y * a.g * 1.05, wide = 1.5 * (a.b * uE.x + a.a * uE.y);",
    "  vec2 cs = (b.rg - 0.5) * 2.0; float m = min(length(cs), 1.0);",
    "  float cw = m * band0 * calm;",   // Anteil der wandernden Wärmewelle (pro Bild im zweiten Pass)
    "  float pipes = uK.x * wide + (uK.y * band0 * heat + uE.w * band0 * heat * heat) * calm;",
    "  float nz = b.b - 0.5;",
    "  float yWi = uWall.x, yWo = uWall.y, xWi = uWall.z, xWo = uWall.w;",
    "  float inY = 1.0 - smoothstep(yWi - aa, yWi + aa, p.y), inX = 1.0 - smoothstep(xWi - aa, xWi + aa, p.x), room = inY * inX;",
    "  float outside = max(smoothstep(yWo - aa, yWo + aa, p.y), smoothstep(xWo - aa, xWo + aa, p.x));",
    "  float wallM = clamp(1.0 - room - outside, 0.0, 1.0);",
    "  float iw = max(band(p.x, uInt.x, uInt.y, aa), band(p.x, uInt.z, uInt.w, aa)) * inY;",
    "  float Tin = uB.x, Tout = uLev.x + 0.03 * nz;",
    // Raum: Estrich, an den Außenwänden etwas kühler, Sonnenfleck
    "  float dExt = max(min(yWi - p.y, xWi - p.x), 0.0);",
    "  float Tr = Tin - 0.05 * (1.0 - b.a) + pipes + uK.w * nz - uB.y * exp(-dExt / (0.4 * ppm));",
    "  if (uSunS.x > 0.0) {",
    "    vec2 d = p - uSunO.xy; vec2 st = vec2(dot(uSunM.xy, d), dot(uSunM.zw, d));",
    "    float sm = smoothstep(0.0, uSunO.z, st.x) * smoothstep(0.0, uSunO.z, 1.0 - st.x) * smoothstep(0.0, uSunO.w, st.y) * smoothstep(0.0, uSunO.w, 1.0 - st.y);",
    "    Tr += uSunS.x * sm * (1.0 - 0.55 * clamp(st.y, 0.0, 1.0)) * (1.0 - iw);",
    "  }",
    "  Tr = mix(Tr, Tin - 0.035 + 0.1 * uK.x * wide, iw); float cR = cw * (1.0 - iw), cO = 0.6 * cw;",
    // Außenwand: innen raumwarm, außen kalt, Rohrdurchführung als Wärmebrücke; Fenster mit kaltem Glas
    "  float fy = clamp((p.y - yWi) / (yWo - yWi), 0.0, 1.0) * step(p.x, xWo);",
    "  float fx = clamp((p.x - xWi) / (xWo - xWi), 0.0, 1.0) * step(p.y, yWo), fw = max(fy, fx);",
    "  float Tw = mix(Tin - 0.06, Tout + 0.03, pow(fw, 0.8)) + 0.8 * uK.x * wide + 0.8 * uK.y * band0 * heat;",
    "  float inWin = band(uWin.z < 0.5 ? p.x : p.y, uWin.x, uWin.y, aa) * (uWin.z < 0.5 ? inX : inY);",
    "  float glass = band(fw, 0.4, 0.56, 0.03);",
    "  Tw = mix(Tw, mix(mix(Tin - 0.04, Tout + 0.05, fw) + 0.02, uWin.w, glass), inWin);",
    // draußen: Boden, gedämmte Leitungen, kalte Abluft um das Außengerät
    "  vec2 uc = 0.5 * (uUnit.xy + uUnit.zw), uh = 0.5 * (uUnit.zw - uUnit.xy); float rr = 0.035 * ppm;",
    "  float du = sdBox(p - uc, uh - rr) - rr;",
    "  float To = Tout + 0.6 * pipes - uLev.w * 0.065 * exp(-max(du, 0.0) / (0.32 * ppm));",
    "  vec2 rc = 0.5 * (uRoof.xy + uRoof.zw), rh = 0.5 * (uRoof.zw - uRoof.xy); float dr = sdBox(p - rc, rh);",
    "  if (dr < aa) {",
    // Garagendach mit PV-Modulen: Zellen in der Sonne warm, Rahmen etwas kühler, Anschlussdose leicht wärmer
    "    float Tf = Tout + 0.03 * uLev2.w - 0.025 * ln(-dr, 0.07 * ppm, aa);",
    "    vec2 q = p - uPV.xy, pitch = uPV.zw + uPV2.z, mi = floor(q / pitch), f = q - mi * pitch;",
    "    float inMod = step(0.0, mi.x) * step(mi.x, uPV2.x - 1.0) * step(0.0, mi.y) * step(mi.y, uPV2.y - 1.0) * band(f.x, 0.0, uPV.z, aa) * band(f.y, 0.0, uPV.w, aa);",
    "    float fwd = 0.035 * ppm, e = min(min(f.x, uPV.z - f.x), min(f.y, uPV.w - f.y));",
    "    float frame = 1.0 - smoothstep(fwd - aa, fwd + aa, e);",
    "    vec2 nC = uPV2.w > 0.5 ? vec2(10.0, 6.0) : vec2(6.0, 10.0), csz = (uPV.zw - 2.0 * fwd) / nC, cf = (f - fwd) / csz;",
    "    vec2 cg = abs(fract(cf) - 0.5) * csz; float cl = ln(min(0.5 * csz.x - cg.x, 0.5 * csz.y - cg.y), 0.5, aa);",
    "    vec2 jq = (f - vec2(0.5 * uPV.z, 0.2 * uPV.w)) / (0.14 * ppm);",
    "    float Tc = uLev.y + 0.016 * (hash(mi * 17.0 + floor(cf)) - 0.5) * uLev2.z + 0.035 * exp(-dot(jq, jq)) * uLev2.z - (0.028 + 0.025 * uLev2.z) * cl;",
    "    Tf = mix(Tf, mix(Tc, uLev.z, frame), inMod);",
    "    float rm = 1.0 - smoothstep(-aa, aa, dr); To = mix(To, Tf, rm); cO *= 1.0 - rm;",
    "  }",
    "  if (du < 2.0) {",
    // Außengerät von oben: Ventilator mit Schutzgitter (kalte Abluft), Verdampfer hinten kalt, Verdichter warm
    "    vec2 lq = (p - uUnit.xy) / (uUnit.zw - uUnit.xy); float hp = uLev.w;",
    "    float Tc = Tout + 0.06 + 0.15 * hp * smoothstep(0.36, 0.2, lq.x) * smoothstep(0.0, 0.25, lq.y) * smoothstep(1.0, 0.75, lq.y);",
    "    Tc -= 0.06 * hp * max(smoothstep(0.14, 0.03, lq.y), smoothstep(0.92, 0.99, lq.x));",
    "    vec2 fq = p - uFan.xy; float r = length(fq), R = uFan.z, disc = 1.0 - smoothstep(R - aa, R + aa, r);",
    "    float Tfan = Tout - 0.02 - 0.09 * hp;",   // Flügel drehen sich im zweiten Pass
    "    float rings = max(max(ln(abs(r - 0.38 * R), 0.6, aa), ln(abs(r - 0.64 * R), 0.6, aa)), max(ln(abs(r - 0.87 * R), 0.6, aa), ln(abs(r - R), 1.0, aa)));",
    "    float spokes = max(ln(abs(fq.x), 0.6, aa), ln(abs(fq.y), 0.6, aa)) * step(0.17 * R, r);",
    "    Tfan += 0.18 * max(rings, spokes) + 0.1 * (1.0 - smoothstep(0.17 * R - aa, 0.17 * R + aa, r));",
    "    Tc = mix(Tc, Tfan, disc) + 0.09 * ln(abs(du), 0.7, aa);",
    "    float um = 1.0 - smoothstep(-aa, aa, du - 0.6); To = mix(To, Tc, um); cO *= 1.0 - um;",
    "  }",
    "  float T = Tr * room + Tw * wallM + To * outside, c = cR * room + cO * outside;",
    // Heizkreisverteiler: Schrank mit Vorlaufbalken (heiß) und Rücklaufbalken (kühler), Abgänge alle 10 cm
    "  vec2 cc = 0.5 * (uCab.xy + uCab.zw), chh = 0.5 * (uCab.zw - uCab.xy); float dc = sdBox(p - cc, chh);",
    "  if (dc < 2.0) {",
    "    float tS, tR, bw = 0.022 * ppm; float ds = seg(p, uBarS, tS), dR = seg(p, uBarR, tR);",
    "    float Tcab = Tin - 0.06 + 0.3 * uK.x * wide;",
    "    float nS = node(p, uBarS, 0.1 * ppm, 0.034 * ppm, aa), nR = node(p, uBarR, 0.1 * ppm, 0.034 * ppm, aa);",
    "    float mR = max(ln(dR, bw, aa), nR), mS = max(ln(ds, bw, aa), nS);",
    "    Tcab = mix(mix(Tcab, uLev2.y, mR), uLev2.x, mS) - 0.04 * ln(abs(dc), 0.6, aa);",
    "    float cm = 1.0 - smoothstep(-aa, aa, dc - 0.6);",
    "    T = mix(T, Tcab, cm); c = mix(c, mix(0.4 * m * mR, 1.3 * m, mS), cm);",
    "  }",
    // Kopfbereich ruhig halten (Schrift liegt direkt darauf), leichte Vignette, ruhiges Sensorrauschen
    "  float capd = step(uB.w, T) * hdr; T = mix(T, min(T, uB.w + 0.3 * (T - uB.w)), hdr); c *= 1.0 - 0.7 * capd;",
    "  vec2 qv = css / uView.xy - 0.5; T -= uMix.w * dot(qv, qv);",
    "  T += (hash(gl_FragCoord.xy) - 0.5) * uMix.z;",
    "  float e = clamp(T * 0.8 + 0.1, 0.0, 1.0) * 255.0, hi = floor(e);",
    "  gl_FragColor = vec4(hi / 255.0, e - hi, clamp(c / 1.5, 0.0, 1.0), fract(atan(cs.y, cs.x + 1e-5) / 6.2831853 + 1.0));",
    "}",
  ].join("\n");
  // Pass 2 (jedes Bild, billig): Welle entlang der Rohre, Lüfterflügel, ruhiger Kopfbereich, Vignette, Rauschen, Farbskala
  const SHOW = [
    "uniform sampler2D uS; uniform sampler2D uLut1; uniform vec4 uView; uniform vec4 uRes; uniform vec4 uFan; uniform vec4 uB;",
    "void main(){",
    "  vec4 s = texture2D(uS, gl_FragCoord.xy * uRes.xy);",
    "  float T = ((s.r * 255.0 + s.g) / 255.0 - 0.1) * 1.25;",
    "  float x = (fract(s.a - uRes.z) - 0.5) * 6.2831853;",   // Abstand zur Wellenfront in der Strömungsphase
    "  T += uRes.w * s.b * 1.5 * (exp(x > 0.0 ? -7.0 * x * x : 1.1 * x) - 0.12);",
    "  float pr = uView.z; vec2 css = gl_FragCoord.xy / pr; css.y = uView.y - css.y;",
    "  vec2 fq = vec2(css.x - uFan.x, css.y - uB.x - uFan.y);",
    "  float r = length(fq), R = uFan.z;",
    "  if (r < R + 2.0) {",
    "    float bl = 0.5 + 0.5 * cos(3.0 * (atan(fq.y, fq.x + 1e-5) - uFan.w) + 2.4 * r / R);",
    "    T -= 0.03 * uB.y * bl * smoothstep(0.18 * R, 0.3 * R, r) * (1.0 - smoothstep(R - 0.7 / pr, R + 0.7 / pr, r));",
    "  }",
    "  T = clamp(T, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0;",
    "  gl_FragColor = vec4(texture2D(uLut1, vec2(T, 0.5)).rgb, 1.0);",
    "}",
  ].join("\n");

  const renderScale = () => clamp(Math.min(window.devicePixelRatio || 1, 1.5) * 0.6, 0.75, 0.9);

  function createGL(canvas, THREE, pal) {
    let renderer = null, context = null;
    const release = () => {
      // ohne Fehlermeldung an den Rahmen: unser eigener Kontextverlust soll die 2D-Ersatzdarstellung nicht anhalten
      try {
        const ext = context && context.getExtension("WEBGL_lose_context");
        if (ext) { canvas.addEventListener("webglcontextlost", (e) => e.stopImmediatePropagation(), { once: true }); ext.loseContext(); }
      } catch (_) {}
    };
    try {
      const attrs = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false };
      context = canvas.getContext("webgl2", attrs) || canvas.getContext("webgl", attrs);
      if (!context) return null;
      renderer = new THREE.WebGLRenderer(Object.assign({ canvas, context }, attrs));
      if (!renderer.getContext()) throw new Error("kein Kontext");
    } catch (e) { try { renderer && renderer.dispose(); } catch (_) {} release(); return null; }
    let wasLost = false;
    const onLost = () => { wasLost = true; };
    canvas.addEventListener("webglcontextlost", onLost);
    const v4 = () => ({ value: new THREE.Vector4() });
    const names = ["uView", "uFld", "uGeo", "uE", "uK", "uB", "uWall", "uInt", "uWin", "uSunM", "uSunO", "uSunS", "uUnit", "uFan", "uRoof", "uPV", "uPV2", "uBarS", "uBarR", "uCab", "uLev", "uLev2", "uMix"];
    const uni = { uF1: { value: null }, uF2: { value: null } };
    for (const n of names) uni[n] = v4();
    const uni2 = { uS: { value: null }, uLut1: { value: null }, uView: uni.uView, uRes: v4(), uFan: v4(), uB: v4() };
    const q = { depthTest: false, depthWrite: false, blending: THREE.NoBlending };
    const mat = new THREE.ShaderMaterial(Object.assign({ uniforms: uni, vertexShader: VERT, fragmentShader: BAKE }, q));
    const mat2 = new THREE.ShaderMaterial(Object.assign({ uniforms: uni2, vertexShader: VERT, fragmentShader: SHOW }, q));
    const geo = new THREE.PlaneGeometry(2, 2), cam = new THREE.Camera();
    const quad = (m) => { const sc = new THREE.Scene(), me = new THREE.Mesh(geo, m); me.frustumCulled = false; sc.add(me); return sc; };
    const bakeScene = quad(mat), showScene = quad(mat2);
    // Ziel für das ruhende Bild: gleiche Pixel wie die Leinwand, ohne Filter (die Phase springt bei einer vollen Umdrehung)
    const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false });
    rt.texture.generateMipmaps = false; uni2.uS.value = rt.texture;
    const lut1 = new Uint8Array(256 * 4), lutTex = new THREE.DataTexture(lut1, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    lutTex.magFilter = lutTex.minFilter = THREE.NearestFilter; lutTex.generateMipmaps = false; lutTex.wrapS = lutTex.wrapT = THREE.ClampToEdgeWrapping;
    uni2.uLut1.value = lutTex;
    // Shader prüfen: schlägt er fehl (sehr alte Grafik), lieber sauber auf den 2D-Ersatz gehen
    try {
      renderer.compile(bakeScene, cam); renderer.compile(showScene, cam);
      const gl = renderer.getContext(), progs = renderer.info.programs || [];
      if (progs.length < 2 || progs.some((pg) => pg.program && !gl.getProgramParameter(pg.program, gl.LINK_STATUS))) throw new Error("Shader");
    } catch (e) { try { geo.dispose(); mat.dispose(); mat2.dispose(); rt.dispose(); lutTex.dispose(); renderer.dispose(); } catch (_) {} release(); return null; }
    const tex = (data, w, h) => {
      const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t;
    };
    const buf = new THREE.Vector2();
    let lutDark = null, lutRows = null, w = 1, h = 1, key = -1, stamp = -1e9, dirty = true;
    const set = (k, a) => uni[k].value.set(a[0], a[1], a[2], a[3]);
    function bake(M, G, fan, dy) {
      if (lutDark !== M.dark) { lutRows = makeLut(M.dark, pal); lutDark = M.dark; }
      // Farbskala für die Tageszeit einmal mischen (Nacht, Tag, Dämmerung), statt dreimal pro Pixel nachzuschlagen
      for (let i = 0; i < 1024; i++) {
        const d = lutRows[i], u = lutRows[1024 + i], n = lutRows[2048 + i];
        lut1[i] = Math.round(mix(mix(n, d, M.day), u, M.dusk));
      }
      lutTex.needsUpdate = true;
      uni.uGeo.value.set(dy, G.ppm, G.s, 0);
      uni.uE.value.set(M.er, M.de, 0, M.kH);
      uni.uK.value.set(M.kW, M.kC, M.kF, M.kN);
      uni.uB.value.set(M.base, M.cool, M.calm, M.cap);
      uni.uWin.value.set(G.win[0], G.win[1], G.win[2], M.Tglass);
      uni.uSunM.value.fromArray(M.sunM); uni.uSunO.value.fromArray(M.sunO); uni.uSunS.value.set(M.sunS, 0, 0, 0);
      uni.uFan.value.set(G.fan[0], G.fan[1], G.fan[2], fan);
      uni.uLev.value.set(M.Tout, M.Tpv, M.Tframe, M.hp);
      uni.uLev2.value.set(M.Tsup, M.Tret, M.pv, M.dl);
      uni.uMix.value.set(M.day, M.dusk, M.grain, M.vig);
      renderer.setRenderTarget(rt); renderer.render(bakeScene, cam); renderer.setRenderTarget(null);
    }
    return {
      setField(F, G) {
        if (uni.uF1.value) uni.uF1.value.dispose();
        if (uni.uF2.value) uni.uF2.value.dispose();
        uni.uF1.value = tex(F.d1, F.fw, F.fh); uni.uF2.value = tex(F.d2, F.fw, F.fh);
        uni.uFld.value.set(F.x0, F.y0, F.cw, F.ch);
        set("uWall", G.wall); set("uInt", G.int); set("uUnit", G.unit); set("uRoof", G.roof);
        set("uPV", G.pv); set("uPV2", G.pv2); set("uBarS", G.barS); set("uBarR", G.barR); set("uCab", G.cab);
        dirty = true;
      },
      setSize(W, H) {
        w = W; h = H;
        const pr = renderScale();
        if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);   // Fenster auf einen anderen Bildschirm gezogen
        renderer.setSize(W, H, false);
        renderer.getDrawingBufferSize(buf);
        if (rt.width !== buf.x || rt.height !== buf.y) rt.setSize(buf.x, buf.y);
        dirty = true;
      },
      draw(M, G, phase, fan, dy, now, still) {
        uni.uView.value.set(w, h, renderer.getPixelRatio(), G.header);
        // das ruhende Bild neu backen: nach Größenwechsel, bei Theme- oder Stimmungswechsel, sonst höchstens alle 20 s
        const kk = ((((((M.dark ? 1 : 0) * 41 + Math.round(M.day * 40)) * 41 + Math.round(M.pv * 40)) * 41 + Math.round(M.dusk * 40)) * 61 + Math.round(M.sunS * 300)) * 4099 + (Math.round(dy) & 4095));
        if (dirty || still || kk !== key || now - stamp > 20000) { bake(M, G, fan, dy); key = kk; stamp = now; dirty = false; }
        uni2.uRes.value.set(1 / rt.width, 1 / rt.height, (phase / TAU + 0.5) % 1, M.kF);   // +0.5: Abstand zur Front liegt in -π … π
        uni2.uFan.value.set(G.fan[0], G.fan[1], G.fan[2], fan);
        uni2.uB.value.set(dy, M.hp, 0, M.cap);
        renderer.render(showScene, cam);
      },
      flat(rgb) { renderer.setRenderTarget(null); renderer.setClearColor(new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)); renderer.clear(); },
      dispose() {
        // nach einem Kontextverlust gehören die alten Objekte nicht mehr zum Kontext: nicht einzeln löschen
        if (!wasLost) { for (const k of ["uF1", "uF2"]) if (uni[k].value) uni[k].value.dispose(); lutTex.dispose(); rt.dispose(); geo.dispose(); mat.dispose(); mat2.dispose(); }
        renderer.dispose();
        canvas.removeEventListener("webglcontextlost", onLost);   // sonst hält der Zuhörer das alte Feld im Speicher
      },
    };
  }

  /* ---------------- 2D-Ersatz ohne WebGL: gleiche Rechnung auf grobem Raster, Linien darüber ---------------- */
  function sdBox(px, py, cx, cy, hx, hy) {
    const dx = Math.abs(px - cx) - hx, dy = Math.abs(py - cy) - hy;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  }
  // ruhender Anteil eines Bildpunkts (ohne Welle, ohne feine Linien), wie im Shader
  function staticT(x, y, cy, d1, d2, p, M, G) {
    const ppm = G.ppm, [yWi, yWo, xWi, xWo] = G.wall, I = G.int;
    const hdr = 1 - sstep(G.header * 0.5, G.header * 1.15, cy), calm = 1 - M.calm * hdr;
    const band0 = 1 - sstep(0.06, 0.5, d1[p] / 255 * 0.75), heat = M.er + M.de * d1[p + 1] / 255 * 1.05, wide = 1.5 * (d1[p + 2] / 255 * M.er + d1[p + 3] / 255 * M.de);
    const pipes = M.kW * wide + (M.kC * band0 * heat + M.kH * band0 * heat * heat) * calm;
    const nz = d2[p + 2] / 255 - 0.5, big = d2[p + 3] / 255;
    const Tin = M.base, Tout = M.Tout + 0.03 * nz;
    let T;
    if (y < yWi && x < xWi) {
      const iw = y < yWi && ((x > I[0] && x < I[1]) || (x > I[2] && x < I[3]));
      if (iw) T = Tin - 0.035 + 0.1 * M.kW * wide;
      else {
        T = Tin - 0.05 * (1 - big) + pipes + M.kN * nz - M.cool * Math.exp(-Math.max(Math.min(yWi - y, xWi - x), 0) / (0.4 * ppm));
        if (M.sunS > 0) {
          const dx = x - M.sunO[0], dy = y - M.sunO[1], s1 = M.sunM[0] * dx + M.sunM[1] * dy, s2 = M.sunM[2] * dx + M.sunM[3] * dy;
          const sm = sstep(0, M.sunO[2], s1) * sstep(0, M.sunO[2], 1 - s1) * sstep(0, M.sunO[3], s2) * sstep(0, M.sunO[3], 1 - s2);
          T += M.sunS * sm * (1 - 0.3 * clamp(s2, 0, 1));
        }
      }
    } else if (y < yWo && x < xWo) {
      const fw = Math.max(x < xWo ? clamp((y - yWi) / (yWo - yWi), 0, 1) : 0, y < yWo ? clamp((x - xWi) / (xWo - xWi), 0, 1) : 0);
      T = mix(Tin - 0.06, Tout + 0.03, Math.pow(fw, 0.8)) + 0.8 * M.kW * wide + 0.8 * M.kC * band0 * heat;
      const wp = G.win[2] ? y : x, onW = G.win[2] ? x >= xWi : x < xWi;
      if (onW && wp > G.win[0] && wp < G.win[1]) T = mix(mix(Tin - 0.04, Tout + 0.05, fw) + 0.02, M.Tglass, sstep(0.36, 0.42, fw) * (1 - sstep(0.54, 0.6, fw)));
    } else {
      const U = G.unit, ucx = (U[0] + U[2]) / 2, ucy = (U[1] + U[3]) / 2, rr = 0.035 * ppm;
      const du = sdBox(x, y, ucx, ucy, (U[2] - U[0]) / 2 - rr, (U[3] - U[1]) / 2 - rr) - rr;
      T = Tout + 0.6 * pipes - M.hp * 0.065 * Math.exp(-Math.max(du, 0) / (0.32 * ppm));
      const Rf = G.roof;
      if (x > Rf[0] && x < Rf[2] && y > Rf[1] && y < Rf[3]) {
        T = Tout + 0.03 * M.dl;
        const P = G.pv, P2 = G.pv2, qx = x - P[0], qy = y - P[1], mx = Math.floor(qx / (P[2] + P2[2])), my = Math.floor(qy / (P[3] + P2[2]));
        const fx = qx - mx * (P[2] + P2[2]), fy = qy - my * (P[3] + P2[2]);
        if (mx >= 0 && my >= 0 && mx < P2[0] && my < P2[1] && fx < P[2] && fy < P[3]) T = M.Tpv;
      }
      if (du < 0) {
        const lx = (x - U[0]) / (U[2] - U[0]), ly = (y - U[1]) / (U[3] - U[1]);
        T = Tout + 0.06 + 0.15 * M.hp * sstep(0.36, 0.2, lx) * sstep(0, 0.25, ly) * sstep(1, 0.75, ly) - 0.06 * M.hp * Math.max(sstep(0.14, 0.03, ly), sstep(0.92, 0.99, lx));
        const r = Math.hypot(x - G.fan[0], y - G.fan[1]);
        if (r < G.fan[2]) T = Tout - 0.02 - 0.105 * M.hp + (r < 0.17 * G.fan[2] ? 0.05 : 0);
      }
    }
    const C = G.cab;
    if (x > C[0] && x < C[2] && y > C[1] && y < C[3]) T = Tin - 0.06;
    T = mix(T, Math.min(T, M.cap + 0.3 * (T - M.cap)), hdr);
    const qx = x / G.w - 0.5, qy = cy / (G.vh || G.h) - 0.5;
    return T - M.vig * (qx * qx + qy * qy);
  }

  function create2D(canvas, pal) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    const work = document.createElement("canvas"), wctx = work.getContext("2d");
    const ov = document.createElement("canvas"), octx = ov.getContext("2d");
    if (!wctx || !octx) return null;
    const wave = new Float32Array(256), rgb = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) { let x = TAU * i / 256; if (x > Math.PI) x -= TAU; wave[i] = (x > 0 ? Math.exp(-x * x * 7) : Math.exp(x * 1.1)) - 0.12; }
    let F = null, G = null, img = null, k = 1, ww = 0, wh = 0, Ts = null, Pm = null, Pa = null;
    let w = 1, h = 1, q = 1, stamp = -1e9, key = -1;
    const col = (T, a) => { const c = clamp(Math.round(T * 255), 0, 255) * 3; return "rgba(" + rgb[c] + "," + rgb[c + 1] + "," + rgb[c + 2] + "," + a + ")"; };
    function overlay(M, dy) {
      // feine Linien, die das grobe Raster nicht zeigen kann: Modulrahmen und Zellen, Lüftergitter, Verteilerbalken
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, ov.width, ov.height);
      octx.setTransform(q, 0, 0, q, 0, q * dy);
      const ppm = G.ppm, P = G.pv, P2 = G.pv2, fwd = 0.035 * ppm;
      octx.lineWidth = 1.2;
      for (let my = 0; my < P2[1]; my++) for (let mx = 0; mx < P2[0]; mx++) {
        const x0 = P[0] + mx * (P[2] + P2[2]), y0 = P[1] + my * (P[3] + P2[2]);
        if (x0 > G.w || y0 > G.h || x0 + P[2] < 0) continue;
        octx.strokeStyle = col(M.Tpv - 0.02 - 0.02 * M.pv, 0.9); octx.beginPath();
        for (let c = 1; c < 10; c++) { const x = x0 + fwd + c * (P[2] - 2 * fwd) / 10; octx.moveTo(x, y0 + fwd); octx.lineTo(x, y0 + P[3] - fwd); }
        for (let c = 1; c < 6; c++) { const y = y0 + fwd + c * (P[3] - 2 * fwd) / 6; octx.moveTo(x0 + fwd, y); octx.lineTo(x0 + P[2] - fwd, y); }
        octx.stroke();
        octx.lineWidth = fwd * 2; octx.strokeStyle = col(M.Tframe, 1); octx.strokeRect(x0 + fwd, y0 + fwd, P[2] - 2 * fwd, P[3] - 2 * fwd); octx.lineWidth = 1.2;
      }
      const U = G.unit, [fx, fy, R] = G.fan, Tf = M.Tout - 0.02 - 0.105 * M.hp;
      octx.strokeStyle = col(M.Tout + 0.15, 1); octx.lineWidth = 1.2; octx.strokeRect(U[0], U[1], U[2] - U[0], U[3] - U[1]);
      octx.strokeStyle = col(Tf + 0.18, 1); octx.beginPath();
      for (const f of [0.38, 0.64, 0.87, 1]) { octx.moveTo(fx + R * f, fy); octx.arc(fx, fy, R * f, 0, TAU); }
      octx.moveTo(fx - R, fy); octx.lineTo(fx + R, fy); octx.moveTo(fx, fy - R); octx.lineTo(fx, fy + R); octx.stroke();
      octx.lineCap = "round"; octx.lineWidth = 0.044 * ppm;
      octx.strokeStyle = col(M.Tret, 1); octx.beginPath(); octx.moveTo(G.barR[0], G.barR[1]); octx.lineTo(G.barR[2], G.barR[3]); octx.stroke();
      octx.strokeStyle = col(M.Tsup, 1); octx.beginPath(); octx.moveTo(G.barS[0], G.barS[1]); octx.lineTo(G.barS[2], G.barS[3]); octx.stroke();
      octx.lineCap = "butt";
    }
    function prepare(M, dy) {
      // langsam veränderliche Anteile je Rasterpunkt vorrechnen (Stimmung, Sonnenfleck, Wände, Kopfbereich)
      const d1 = F.d1, d2 = F.d2, lut = makeLut(M.dark, pal);
      for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) {
        const n = lut[(512 + i) * 4 + c], dd = lut[i * 4 + c], u = lut[(256 + i) * 4 + c];
        rgb[i * 3 + c] = Math.round(mix(mix(n, dd, M.day), u, M.dusk));
      }
      G.vh = h;
      for (let j = 0; j < wh; j++) for (let i = 0; i < ww; i++) {
        const fi = Math.min(F.fw - 1, i * k + (k >> 1)), fj = Math.min(F.fh - 1, j * k + (k >> 1)), p = (fj * F.fw + fi) * 4, o = j * ww + i;
        const x = F.x0 + (fi + 0.5) * F.tx, y = F.y0 + (fj + 0.5) * F.tx;
        const hdr = 1 - sstep(G.header * 0.5, G.header * 1.15, y + dy);
        const cx = (d2[p] / 255 - 0.5) * 2, cy = (d2[p + 1] / 255 - 0.5) * 2, b0 = 1 - sstep(0.06, 0.5, d1[p] / 255 * 0.75);
        Ts[o] = staticT(x, y, y + dy, d1, d2, p, M, G);
        Pm[o] = M.kF * (1 - M.calm * hdr) * Math.min(Math.hypot(cx, cy), 1) * b0;
        Pa[o] = Math.round(((Math.atan2(cy, cx) / TAU) + 1) * 256) & 255;
      }
      overlay(M, dy);
    }
    return {
      setField(f, g) {
        F = f; G = g; k = Math.max(1, Math.round(6 / F.tx)); ww = Math.ceil(F.fw / k); wh = Math.ceil(F.fh / k);
        work.width = ww; work.height = wh; img = wctx.createImageData(ww, wh);
        for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
        Ts = new Float32Array(ww * wh); Pm = new Float32Array(ww * wh); Pa = new Uint8Array(ww * wh); stamp = -1e9;
      },
      setSize(W, H) {
        w = W; h = H; q = clamp((window.devicePixelRatio || 1) * 0.5, 0.5, 1);   // kleiner Speicher, das Hochskalieren macht der Browser
        canvas.width = ov.width = Math.max(1, Math.round(W * q)); canvas.height = ov.height = Math.max(1, Math.round(H * q)); stamp = -1e9;
      },
      draw(M, g, phase, fan, dy, now) {
        const kk = ((((((M.dark ? 1 : 0) * 41 + Math.round(M.day * 40)) * 41 + Math.round(M.pv * 40)) * 41 + Math.round(M.dusk * 40)) * 61 + Math.round(M.sunS * 300)) * 4099 + (Math.round(dy) & 4095));
        if (kk !== key || now - stamp > 30000) { prepare(M, dy); key = kk; stamp = now; }
        const px = img.data, off = Math.round(((phase / TAU) % 1 + 1) * 256) & 255;
        for (let o = 0, n = ww * wh; o < n; o++) {
          const T = Ts[o] + Pm[o] * wave[(Pa[o] - off) & 255];
          const c = (T <= 0 ? 0 : T >= 1 ? 255 : (T * 255) | 0) * 3, p = o * 4;
          px[p] = rgb[c]; px[p + 1] = rgb[c + 1]; px[p + 2] = rgb[c + 2];
        }
        wctx.putImageData(img, 0, 0);
        const sc = k * F.tx, ox = F.x0 + ((k >> 1) + 0.5 - 0.5 * k) * F.tx, oy = F.y0 + ((k >> 1) + 0.5 - 0.5 * k) * F.tx;
        ctx.setTransform(q, 0, 0, q, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "low";
        ctx.drawImage(work, 0, 0, ww, wh, ox, oy + dy, ww * sc, wh * sc);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(ov, 0, 0);
      },
      flat(c) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; ctx.fillRect(0, 0, canvas.width, canvas.height); },
      dispose() { work.width = work.height = 0; ov.width = ov.height = 0; },
    };
  }

  /* ---------------- Szene ---------------- */
  window.PWBG = window.PWBG || {};
  window.PWBG.waermebild = {
    title: "Wärmebild",
    create({ canvas2d, canvas3d, THREE, palette }) {
      const pal = palette || DEF_PAL;
      const gl = THREE ? createGL(canvas3d, THREE, pal) : null;
      const R = gl || create2D(canvas2d, pal);
      if (!R) return null;
      canvas3d.style.display = gl ? "" : "none";
      canvas2d.style.display = gl ? "none" : "";
      const M = newMood(), fine = !!(window.matchMedia && matchMedia("(pointer: fine)").matches);
      let G = null, F = null, geoW = 0, geoH = 0, timer = 0, phase = 0, fan = 0.6, lastT = null, lastState = null;
      // Geometrie für mindestens 320 × 360 px rechnen und unten verankern: sehr flache Fenster zeigen den unteren Teil
      const rebuild = (w, h) => {
        const lw = Math.max(w, 320), lh = Math.max(h, 360);
        try { G = layout(lw, lh); F = buildField(G); }
        catch (e) { try { G = layout(Math.max(lw, 480), Math.max(lh, 480)); F = buildField(G); } catch (_) { G = null; F = null; } }
        if (G) R.setField(F, G);
        geoW = w; geoH = h;
      };
      const schedule = (w, h, ms) => {
        clearTimeout(timer);
        timer = setTimeout(() => { rebuild(w, h); if (lastState) scene.frame(lastState); }, ms);
      };
      const scene = {
        fps: gl ? 10 : 8,          // die Bewegung ist langsam, mehr Bilder kosten nur Akku
        stillT: 9,
        resize(st) {
          const w = Math.max(1, st.w), h = Math.max(1, st.h);
          R.setSize(w, h);
          if (!geoW) { rebuild(w, h); return; }
          // Höhenänderungen (Symbolleisten) fängt die Verankerung unten ab; neu gerechnet wird nur bei echten Formatwechseln
          if (w !== geoW || h > geoH * 1.15 || h < geoH * 0.8) schedule(w, h, 140);
          else if (fine && Math.abs(h - geoH) > 0.04 * geoH) schedule(w, h, 300);
        },
        frame(st) {
          lastState = st;
          mood(st, G || { portrait: false, ppm: 150, s: 22, wall: [0, 0, 0, 0], win: [0, 1, 0] }, M);
          if (!G) { const lut = makeLut(st.dark, pal), o = Math.round(M.base * 255) * 4; R.flat([lut[o], lut[o + 1], lut[o + 2]]); return; }
          if (st.still) { phase = F.still; fan = 0.6; lastT = null; }
          else {
            if (lastT === null) phase = F.still;
            else { const dt = clamp(st.t - lastT, 0, 0.25); phase += TAU * dt / M.period; fan += TAU * dt / M.fanPeriod; }
            lastT = st.t;
            phase %= TAU; fan %= TAU;
          }
          R.draw(M, G, phase, fan, st.h - G.h, Date.now(), !!st.still);
        },
        dispose() { clearTimeout(timer); R.dispose(); },
      };
      return scene;
    },
  };
})();
