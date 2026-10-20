/* Hintergrund: weiche Farbfelder (2D) und darüber eine 3D-Szene: drei Phasenleiter L1/L2/L3 als Drehfeld-Spirale mit wandernden Funken, umgeben von Glaskugeln. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const darkQ = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : darkQ.matches; };
  const FPS = 30, STILL = 18; // Bildrate begrenzt; STILL = Zeitpunkt des Standbilds bei "Bewegung reduzieren"

  // ---------- 2D-Farbfelder ----------
  const cv = document.getElementById("bgfx"), ctx = cv.getContext("2d");
  const blobsLight = [[214, 100, 80], [22, 100, 82], [150, 55, 80], [265, 80, 86]];
  const blobsDark = [[222, 70, 30], [320, 55, 24], [168, 60, 18], [262, 60, 26]];
  let w = 0, h = 0;
  function size2d() { w = cv.width = Math.max(1, Math.round(innerWidth * 0.4)); h = cv.height = Math.max(1, Math.round(innerHeight * 0.4)); }
  function draw2d(t, dark) {
    if (!ctx) return;
    ctx.fillStyle = dark ? "#0b0d14" : "#e9eef6"; ctx.fillRect(0, 0, w, h);
    const R = Math.max(w, h);
    (dark ? blobsDark : blobsLight).forEach(([hue, s, l], i) => {
      const a = t * (0.035 + i * 0.012) + i * 1.7;
      const x = w * (0.5 + 0.42 * Math.cos(a)), y = h * (0.5 + 0.38 * Math.sin(a * 1.3 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.55);
      g.addColorStop(0, `hsla(${hue},${s}%,${l}%,.95)`); g.addColorStop(1, `hsla(${hue},${s}%,${l}%,0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  }

  // ---------- 3D-Szene ----------
  let three = null;
  function init3d() {
    if (!window.THREE) return null;
    const T = window.THREE, canvas = document.getElementById("bg3d");
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" }); } catch { return null; }
    renderer.setClearColor(0x000000, 0);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 13);

    // Glas-Shader: Fresnel-Rand leuchtet, Mitte bleibt durchsichtig
    const glassMat = (color, strength) => new T.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new T.Color(color) }, uStrength: { value: strength }, uDark: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; uniform float uDark; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.6);
          float spec = pow(max(dot(reflect(-normalize(vec3(-0.4,0.8,0.6)), normalize(vN)), normalize(vV)), 0.0), 40.0);
          vec3 c = mix(uColor, vec3(1.0), 0.35 + 0.3*uDark);
          gl_FragColor = vec4(c * (0.6 + f) + spec, (0.04 + f * 0.75 + spec) * uStrength); }`,
    });

    // Drei Phasen als Spirale (Drehfeld), 120° versetzt
    const phaseColors = [0xff9500, 0x007aff, 0x34c759];
    const field = new T.Group(); scene.add(field);
    const L = 26, turns = 3.6, r = 1.15, curves = [], sparks = [];
    phaseColors.forEach((col, i) => {
      const off = (i * 2 * Math.PI) / 3, pts = [];
      for (let s = 0; s <= 200; s++) {
        const u = s / 200, x = (u - 0.5) * L, a = u * turns * 2 * Math.PI + off;
        pts.push(new T.Vector3(x, r * Math.sin(a), r * Math.cos(a)));
      }
      const curve = new T.CatmullRomCurve3(pts); curves.push(curve);
      const tube = new T.Mesh(new T.TubeGeometry(curve, 320, 0.075, 14, false), glassMat(col, 1.0));
      field.add(tube);
      const core = new T.Mesh(new T.TubeGeometry(curve, 320, 0.022, 8, false), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
      field.add(core);
      // Funken, die entlang des Leiters wandern
      const n = 26, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3);
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      const pm = new T.PointsMaterial({ color: col, size: 0.16, transparent: true, opacity: 0.95, depthWrite: false, blending: T.AdditiveBlending, map: sparkTex(T) });
      field.add(new T.Points(geo, pm));
      sparks.push({ geo, pos, n, curve, speed: 0.018 + i * 0.002, phase: i / 3 });
    });
    field.rotation.set(0.0, -0.45, -0.32);

    // Glaskugeln
    const orbs = [];
    const orbSpec = [[-5.2, 2.6, -2, 1.5, 0x8fb4ff], [5.6, -2.4, -3, 1.9, 0xffb38a], [3.4, 3.4, -5, 1.1, 0xb8f0d2], [-3.6, -3.2, -4, 1.2, 0xd6c2ff], [0.6, 0.2, -7, 2.6, 0xffffff]];
    orbSpec.forEach(([x, y, z, s, col], i) => {
      const m = new T.Mesh(new T.SphereGeometry(s, 48, 32), glassMat(col, 0.9));
      m.position.set(x, y, z); m.userData = { x, y, z, i }; scene.add(m); orbs.push(m);
    });
    // Glasring, der sich langsam um das Feld dreht
    const ring = new T.Mesh(new T.TorusGeometry(3.2, 0.09, 24, 160), glassMat(0xffffff, 0.8));
    ring.rotation.set(1.2, 0.3, 0); scene.add(ring);

    const all = [];
    scene.traverse(o => { if (o.material && o.material.uniforms) all.push(o.material); });

    function resize() {
      const pr = Math.min(devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.position.z = camera.aspect < 0.8 ? 19 : 13; // Handy hochkant: weiter weg, damit alles ins Bild passt
      camera.updateProjectionMatrix();
    }
    resize();

    function render(t, dark) {
      all.forEach(m => { m.uniforms.uDark.value = dark ? 1 : 0; m.blending = dark ? T.AdditiveBlending : T.NormalBlending; });
      field.rotation.x = t * 0.12;                    // das Drehfeld dreht sich
      field.rotation.y = -0.45 + Math.sin(t * 0.05) * 0.12;
      sparks.forEach(sp => {
        for (let k = 0; k < sp.n; k++) {
          const u = ((k / sp.n) + t * sp.speed + sp.phase) % 1, p = sp.curve.getPointAt(u);
          sp.pos[k * 3] = p.x; sp.pos[k * 3 + 1] = p.y; sp.pos[k * 3 + 2] = p.z;
        }
        sp.geo.attributes.position.needsUpdate = true;
      });
      orbs.forEach(o => {
        const { x, y, z, i } = o.userData;
        o.position.set(x + Math.sin(t * 0.09 + i) * 0.6, y + Math.cos(t * 0.11 + i * 2) * 0.5, z);
      });
      ring.rotation.z = t * 0.06; ring.rotation.x = 1.2 + Math.sin(t * 0.04) * 0.2;
      renderer.render(scene, camera);
    }
    return { render, resize };
  }
  function sparkTex(T) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }

  // ---------- Schleife ----------
  let raf = 0, last = 0;
  const t0 = performance.now();
  function frame(t) { const dark = isDark(); draw2d(t, dark); if (three) three.render(t, dark); }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 1000 / FPS) return;
    last = now; frame((now - t0) / 1000);
  }
  function start() {
    cancelAnimationFrame(raf);
    if (reduce.matches || document.hidden) { frame(STILL); return; }
    raf = requestAnimationFrame(loop);
  }
  size2d();
  try { three = init3d(); } catch (e) { three = null; }
  start();
  // Nach dem Größenwechsel sofort neu zeichnen, sonst blitzt eine leere Fläche auf.
  addEventListener("resize", () => { size2d(); if (three) three.resize(); frame(reduce.matches || document.hidden ? STILL : (performance.now() - t0) / 1000); });
  document.addEventListener("visibilitychange", start);
  reduce.addEventListener("change", start);
  darkQ.addEventListener("change", () => { if (reduce.matches) frame(STILL); });
})();
