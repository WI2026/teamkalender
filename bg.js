/* Hintergrund-Rahmen: Bildrate, Pause im Hintergrund, „Bewegung reduzieren“, Dunkelmodus und der echte Sonnenstand über München.
   Die Szene selbst liefert ein Modul in window.PWBG (siehe bg-szene.js). Fehlt sie oder scheitert sie, bleibt der CSS-Verlauf stehen. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const darkQ = matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  const isDark = () => { const t = root.dataset.theme; return t ? t === "dark" : darkQ.matches; };
  const P = window.PWBG_PREVIEW || null; // setzt nur die Vorschau: { bg, now(), speed, onFrame(ms) }
  const LAT = 48.14, LON = 11.58;        // München
  const PALETTE = Object.freeze({
    navy: "#414d86",   // Schriftzug
    leaf: "#75c17d",   // Claim
    blue: "#1349a8", green: "#96b452", red: "#ad0004", orange: "#df4505", silver: "#b7b6bc", // die fünf Dreiecke
  });

  // Sonnenstand (vereinfachter Algorithmus, auf etwa 1° genau): Höhe und Richtung in Grad, Richtung von Nord im Uhrzeigersinn
  function sunAt(date) {
    const rad = Math.PI / 180, d = (date.getTime() - 946728000000) / 86400000;
    const g = (357.529 + 0.98560028 * d) * rad;
    const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const H = ((18.697374558 + 24.06570982441908 * d) * 15 + LON) * rad - ra, lat = LAT * rad;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
    const elevation = el / rad, s = Math.min(1, Math.max(0, (elevation + 6) / 12));
    return { elevation, azimuth: (az / rad + 360) % 360, daylight: s * s * (3 - 2 * s) }; // daylight: 0 Nacht … 1 Tag, weicher Übergang in der Dämmerung
  }

  const mods = window.PWBG || {}, mod = mods[(P && P.bg) || Object.keys(mods)[0]];
  const c2 = document.getElementById("bgfx"), c3 = document.getElementById("bg3d");
  if (!mod || !c2 || !c3) return;

  let scene = null;
  function make() {
    try { scene = mod.create({ canvas2d: c2, canvas3d: c3, THREE: window.THREE || null, palette: PALETTE }) || null; }
    catch (e) { scene = null; if (P) console.error(e); }
  }
  make();
  if (!scene) return;

  const t0 = performance.now();
  let raf = 0, last = 0, tick = 0, lost = false;
  const clock = () => (P && P.now ? P.now() : new Date());
  function state(t, still) {
    const now = clock();
    return { t, still, now, day: (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400,
      sun: sunAt(now), dark: isDark(), w: innerWidth, h: innerHeight };
  }
  function fail(e) {
    cancelAnimationFrame(raf); clearInterval(tick);
    try { scene && scene.dispose && scene.dispose(); } catch {}
    scene = null; c2.style.display = c3.style.display = "none"; if (P) console.error(e);
  }
  function draw(still) {
    if (!scene || lost) return;
    try {
      const t = still ? (scene.stillT ?? 20) : ((performance.now() - t0) / 1000) * ((P && P.speed) || 1);
      const a = P ? performance.now() : 0;
      scene.frame(state(t, still));
      if (P && P.onFrame) P.onFrame(performance.now() - a);
    } catch (e) { fail(e); }   // Szene scheitert: Leinwände weg, der CSS-Verlauf bleibt stehen, keine Fehlerflut
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 1000 / Math.min(30, scene.fps || 30) - 4) return;
    last = now; draw(false);
  }
  // Kalender offen auf dem Handy: die Karten verdecken das Bild fast ganz, dann steht es still und spart Akku
  const covered = () => !document.body.classList.contains("locked") && innerWidth <= 960;   // einspaltiger Kalender
  let coveredNow = false;
  function start() {
    cancelAnimationFrame(raf); clearInterval(tick);
    coveredNow = covered();
    if (!scene || document.hidden || lost) return;
    // Standbild bei „Bewegung reduzieren“, der Sonnenstand wird trotzdem jede Minute nachgeführt
    if (reduce.matches) { draw(true); tick = setInterval(() => draw(true), 60000); return; }
    // Szene ohne Bewegung (Foto ohne WebGL) oder verdeckt: einmal zeichnen, und zwar den aktuellen Moment
    if (!scene.fps || coveredNow) { draw(false); return; }
    raf = requestAnimationFrame(loop);
  }
  const redraw = () => draw(reduce.matches);
  // sofort zeichnen, sonst blitzt eine leere Fläche auf (außer start() folgt ohnehin gleich und zeichnet)
  function resize(noDraw) { if (!scene || lost) return; try { scene.resize(state(0, true)); } catch (e) { fail(e); return; } if (!noDraw) redraw(); }

  c3.addEventListener("webglcontextlost", (e) => {
    if (c3.style.display === "none") return;   // die Szene zeichnet gerade ohne WebGL (Standbild), das betrifft sie nicht
    e.preventDefault(); lost = true; cancelAnimationFrame(raf); clearInterval(tick);
    // Szene gleich abbauen: das Bild ist weg, ihre Einstellungen (etwa helle Kopfzeile) dürfen nicht stehen bleiben
    try { scene && scene.dispose && scene.dispose(); } catch {}
    scene = null;
  });
  c3.addEventListener("webglcontextrestored", () => setTimeout(() => {
    if (!lost) return;
    const g = c3.getContext("webgl") || c3.getContext("experimental-webgl");
    if (!g || g.isContextLost()) return;   // schon wieder verloren: auf das nächste „restored“ warten
    make(); lost = !scene;
    if (scene) { resize(); start(); }
  }, 0));
  c2.addEventListener("contextrestored", () => redraw());   // Standbild ohne WebGL nach einem Grafikabsturz neu zeichnen
  addEventListener("resize", () => { const c = covered() !== coveredNow; resize(c); if (c) start(); });
  new MutationObserver(() => { if (covered() !== coveredNow) start(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", start);
  reduce.addEventListener("change", start);
  darkQ.addEventListener("change", redraw);
  new MutationObserver(redraw).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  resize(); start();
  if (P) window.PWBG_HOST = { redraw, start, get scene() { return scene; }, sunAt };
})();
