/* Foto-Hintergründe für den PentaWerk Teamkalender: ein echtes Foto, in dem sich nur einzelne Stellen ruhig bewegen
   (wie ein Cinemagraph): Wolken ziehen, Wolkenschatten wandern über die Wiese, der Lüfter der Wärmepumpe dreht sich,
   Dampf steigt auf, Schnee fällt, Status-LEDs und der Ring der Wallbox leuchten, ein Lichtreflex wandert über die
   PV-Module. Welche Stelle sich bewegt, legt eine kleine Maske je Foto fest (R Himmel, G Boden für Wolkenschatten,
   B PV-Module für den Reflex). Alles in einem einzigen WebGL-Shader, ohne three.js; ohne WebGL steht das Foto still.
   Szenen melden sich mit PWFOTO.define(key, cfg) an und erscheinen dann als window.PWBG[key]. */
(() => {
  "use strict";
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const f = (x) => { const s = (+x).toFixed(5); return s.indexOf(".") < 0 ? s + ".0" : s; };   // Zahl als GLSL-Literal
  const v2 = (a) => `vec2(${f(a[0])}, ${f(a[1])})`;
  const v3 = (a) => `vec3(${f(a[0])}, ${f(a[1])}, ${f(a[2])})`;
  const VEIL = { light: [0.965, 0.968, 0.985], dark: [0.055, 0.07, 0.15] };   // Farbe hinter der Kopfzeile, wie die App-Fläche
  const NAVY = "#0e1226";   // VEIL.dark als Hex, für die Browserleiste (theme-color)

  const VERT = "attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }";

  // Shader je Szene zusammensetzen: nur die Effekte, die das Foto wirklich hat, landen im Programm
  function fragSource(c) {
    const L = [];
    L.push("#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif");
    L.push("uniform sampler2D uImg; uniform sampler2D uMask; uniform vec4 uCrop; uniform vec2 uRes; uniform float uT;");
    L.push("uniform float uAsp; uniform float uDark; uniform vec3 uVeil; uniform float uVeilA; uniform float uVeilH;");
    L.push("varying vec2 vUv;");
    L.push("vec3 tex(vec2 u){ return texture2D(uImg, clamp(u, vec2(0.0005), vec2(0.9995))).rgb; }");
    L.push("float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }");
    L.push("float vnoise(vec2 p){ vec2 i = floor(p), q = fract(p); q = q * q * (3.0 - 2.0 * q);" +
      " return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), q.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), q.x), q.y); }");
    L.push("float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }");
    L.push("void main(){");
    L.push("  vec2 iuv = uCrop.xy + vUv * uCrop.zw;");
    L.push("  vec3 col = tex(iuv);");
    if (c.mask) L.push("  vec4 m = texture2D(uMask, iuv);");
    if (c.mask && c.sky) {
      // Wolken ziehen: zwei zeitversetzte, verschobene Abtastungen überblenden (Endlosschleife ohne Sprung). Die Verschiebung
      // wächst mit der Maske, an Dachkanten und Horizont steht das Bild also still und nichts verschmiert.
      const s = c.sky;
      L.push(`  if (m.r > 0.004) {`);
      L.push(`    float ph = uT / ${f(s.period || 60)} + vnoise(iuv * vec2(2.5, 1.7)) * 0.6;`);
      L.push(`    float f1 = fract(ph), f2 = fract(ph + 0.5); vec2 d = ${v2(s.dir || [1, 0])} * ${f(s.amount || 0.02)} * m.r * m.r;`);
      L.push(`    vec3 sa = tex(iuv - d * (f1 - 0.5)), sb = tex(iuv - d * (f2 - 0.5));`);
      L.push(`    col = mix(col, mix(sa, sb, abs(2.0 * f1 - 1.0)), m.r);`);
      L.push(`  }`);
    }
    if (c.mask && c.ripple) {
      // Nasser Boden: Spiegelungen wabern ganz leicht waagrecht, wie auf einer feuchten Einfahrt
      const r = c.ripple;
      L.push(`  if (m.g > 0.004) {`);
      L.push(`    float rp = sin(iuv.y * ${f(r.freq || 160)} + uT * ${f(r.speed || 1.1)} + sin(iuv.x * 21.0 + uT * 0.6) * 1.6)`);
      L.push(`             + 0.5 * sin(iuv.y * ${f((r.freq || 160) * 2.3)} - uT * ${f((r.speed || 1.1) * 1.4)} + iuv.x * 9.0);`);
      L.push(`    col = mix(col, tex(iuv + vec2(rp * ${f(r.amount || 0.0016)} * m.g, 0.0)), m.g);`);
      L.push(`  }`);
    }
    if (c.mask && c.shadows) {
      const s = c.shadows;
      L.push(`  if (m.g > 0.004) {`);
      L.push(`    float cs = fbm(iuv * vec2(${f(s.scale || 2.4)} * uAsp, ${f((s.scale || 2.4) * 2.2)}) + vec2(uT * ${f(s.speed || 0.008)}, uT * ${f((s.speed || 0.008) * 0.25)}));`);
      L.push(`    col *= 1.0 - ${f(s.amount || 0.12)} * smoothstep(0.48, 0.7, cs) * m.g;`);
      L.push(`  }`);
    }
    if (c.mask && c.glint) {
      // Ein weicher Lichtreflex wandert schräg über die Module, dann Pause
      const g = c.glint, run = clamp(g.run || 0.45, 0.1, 1);
      L.push(`  if (m.b > 0.004) {`);
      L.push(`    float gp = fract(uT / ${f(g.period || 16)}) / ${f(run)};`);
      L.push(`    float gx = dot(iuv * vec2(uAsp, 1.0), normalize(${v2(g.dir || [0.8, -0.6])}));`);
      L.push(`    float gc = mix(${f(g.from ?? -0.4)}, ${f(g.to ?? 2.2)}, gp);`);
      L.push(`    float gw = exp(-pow((gx - gc) / ${f(g.width || 0.06)}, 2.0)) * step(gp, 1.0) * m.b;`);
      L.push(`    col += gw * ${f(g.amount || 0.16)} * (0.55 + 0.45 * col);`);
      L.push(`  }`);
    }
    (c.fans || []).forEach((fan, i) => {
      // Lüfter: die Scheibe des Fotos dreht sich, über einen kleinen Winkel gemittelt (Bewegungsunschärfe der Flügel).
      // Kreisrunde Gitterringe bleiben dabei scharf, wie bei einem laufenden Gerät.
      const n = fan.samples || 9;
      L.push(`  { vec2 fc = ${v2(fan.c)}; vec2 fp = (iuv - fc) * vec2(uAsp, 1.0); float fr = length(fp);`);
      L.push(`    if (fr < ${f(fan.r)}) { float fa = uT * ${f((fan.rps || 0.35) * 6.2831853)}; vec3 acc = vec3(0.0);`);
      L.push(`      for (int k = 0; k < ${n}; k++) { float a = fa + float(k) * ${f((fan.blur || 0.5) / n)}; float ca = cos(a), sa = sin(a);`);
      L.push(`        acc += tex(fc + vec2(ca * fp.x - sa * fp.y, sa * fp.x + ca * fp.y) / vec2(uAsp, 1.0)); }`);
      L.push(`      col = mix(col, acc / ${f(n)}, smoothstep(${f(fan.r)}, ${f(fan.r * (fan.edge || 0.86))}, fr)); } }`);
    });
    (c.steam || []).forEach((st) => {
      // Dampf: ein weicher Schleier aus Rauschen, der nach oben zieht und sich dabei verbreitert
      L.push(`  { vec2 so = ${v2(st.o)}; float sy = (so.y - iuv.y) / ${f(st.h)};`);
      L.push(`    if (sy > 0.0 && sy < 1.0) { float sx = ((iuv.x - so.x) * uAsp / ${f(st.w)}) - ${f(st.lean || 0)} * sy * sy;`);
      L.push(`      float wq = sx / (0.45 + 1.1 * sy);`);
      L.push(`      float sh = smoothstep(1.0, 0.15, abs(wq)) * smoothstep(0.0, 0.12, sy) * smoothstep(1.0, 0.35, sy);`);
      L.push(`      if (sh > 0.0) { float sd = fbm(vec2(wq * 1.6 + 3.1, sy * 2.2 - uT * ${f(st.speed || 0.16)}));`);
      L.push(`        float sd2 = fbm(vec2(wq * 3.1 - 7.0, sy * 4.0 - uT * ${f((st.speed || 0.16) * 1.7)}));`);
      L.push(`        col = mix(col, ${v3(st.color || [0.95, 0.96, 0.98])}, smoothstep(0.38, 0.9, sd * 0.65 + sd2 * 0.45) * sh * ${f(st.amount || 0.5)}); } } }`);
    });
    if (c.stars && c.mask) {
      const s = c.stars;
      L.push(`  { vec2 sp = iuv * vec2(uAsp, 1.0) * ${f(s.density || 90)}; vec2 sc = floor(sp); float sh = hash(sc);`);
      L.push(`    if (sh > ${f(1 - (s.share || 0.035))}) { vec2 so = vec2(hash(sc + 3.7), hash(sc + 9.1)) * 0.6 + 0.2;`);
      L.push(`      float sd = length(fract(sp) - so); float tw = 0.55 + 0.45 * sin(uT * (0.7 + 1.6 * hash(sc + 1.3)) + sh * 40.0);`);
      L.push(`      float dark = 1.0 - smoothstep(0.12, 0.35, dot(col, vec3(0.299, 0.587, 0.114)));`);
      const free = s.cloudsInB ? " * (1.0 - m.b)" : "";   // Kanal B markiert die Wolken: dort keine Sterne
      L.push(`      col += vec3(0.9, 0.94, 1.0) * smoothstep(0.09, 0.0, sd) * tw * m.r${free} * dark * ${f(s.amount || 0.7)}; } }`);
    }
    (c.leds || []).forEach((led) => {
      // LED: Glühen um die Stelle im Foto; "aus" dunkelt die LED leicht ab, "an" legt Licht darauf
      const per = f(led.period || 3), ph = f(led.phase || 0);
      const pulse = led.mode === "blink"
        ? `(smoothstep(0.0, 0.04, fract(uT / ${per} + ${ph})) * smoothstep(0.22, 0.16, fract(uT / ${per} + ${ph})))`
        : led.mode === "steady" ? "1.0"
        : `(0.5 + 0.5 * sin(uT * ${f(6.2831853 / (led.period || 3))} + ${f((led.phase || 0) * 6.2831853)}))`;
      L.push(`  { vec2 lp = (iuv - ${v2(led.p)}) * vec2(uAsp, 1.0); float lg = exp(-dot(lp, lp) / ${f(led.r * led.r)}); float lv = ${pulse};`);
      L.push(`    col = col * (1.0 - lg * ${f(led.dim ?? 0.35)} * (1.0 - lv)) + ${v3(led.color || [0.45, 1.0, 0.55])} * lg * lv * ${f(led.amount || 0.6)}; }`);
    });
    if (c.motes) {
      // Staub im Lichtstrahl: winzige helle Punkte, die langsam schweben (nur im Rechteck, Ränder weich)
      const s = c.motes, r = s.rect;
      L.push(`  { vec2 mq = (iuv - ${v2([r[0], r[1]])}) / ${v2([r[2] - r[0], r[3] - r[1]])};`);
      L.push(`    float mr = smoothstep(0.0, 0.25, mq.x) * smoothstep(1.0, 0.75, mq.x) * smoothstep(0.0, 0.25, mq.y) * smoothstep(1.0, 0.75, mq.y);`);
      L.push(`    if (mr > 0.0) { vec2 sp = iuv * vec2(uAsp, 1.0) * ${f(s.scale || 60)}; float mo = 0.0;`);
      L.push(`      for (int k = 0; k < 2; k++) { float fk = float(k); vec2 g = sp * (1.0 + fk * 0.6) + vec2(uT * 0.05 * (1.0 + fk), -uT * 0.03);`);
      L.push(`        vec2 ce = floor(g); float h = hash(ce + fk * 31.0);`);
      L.push(`        if (h > ${f(1 - (s.share || 0.25))}) { vec2 pp = vec2(0.5) + 0.32 * vec2(sin(uT * 0.4 + h * 30.0), cos(uT * 0.33 + h * 17.0));`);
      L.push(`          mo += smoothstep(0.09, 0.0, length(fract(g) - pp)) * (0.5 + 0.5 * sin(uT * 0.9 + h * 50.0)); } }`);
      L.push(`      col += vec3(1.0, 0.95, 0.85) * mo * mr * ${f(s.amount || 0.35)}; } }`);
    }
    if (c.snow) {
      // Schnee in Bildschirmkoordinaten, drei Ebenen (nah größer und schneller); unter der Kopfzeile ausgeblendet
      const s = c.snow;
      L.push(`  { vec2 sp = vec2(vUv.x * uRes.x / uRes.y, vUv.y); float sn = 0.0;`);
      L.push(`    for (int k = 0; k < 3; k++) { float fk = float(k); float sc = ${f(s.scale || 9)} + fk * 7.0;`);
      L.push(`      vec2 g = sp * sc + vec2(sin(uT * 0.21 + fk * 1.7 + sp.y * 3.0) * 0.35, -uT * (0.12 + 0.07 * fk) * ${f(s.speed || 1)} * sc * 0.1);`);
      L.push(`      vec2 ce = floor(g); float h = hash(ce + fk * 17.0);`);
      L.push(`      if (h > ${f(1 - (s.share || 0.35))}) { vec2 pp = vec2(hash(ce + 2.3), hash(ce + 5.9)) * 0.7 + 0.15;`);
      L.push(`        sn += smoothstep(0.075 + fk * 0.02, 0.0, length(fract(g) - pp)) * (0.45 + 0.3 * fk); } }`);
      L.push(`    col = mix(col, vec3(0.97, 0.98, 1.0), clamp(sn * ${f(s.amount || 0.6)}, 0.0, 0.9) * smoothstep(uVeilH * 0.6, uVeilH * 1.4, vUv.y * uRes.y)); }`);
    }
    // Dunkelmodus: dunkler, leicht entsättigt, Schwarz Richtung PentaWerk-Navy angehoben
    L.push("  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));");
    L.push("  vec3 dk = mix(col, vec3(lum), 0.2) * 0.56 + vec3(0.016, 0.02, 0.05);");
    L.push("  col = mix(col, dk, uDark);");
    L.push("  vec2 vq = (vUv - 0.5) * vec2(1.15, 1.0); col *= mix(1.0, 0.9, smoothstep(0.45, 1.05, length(vq)));");
    // Schleier hinter Kopfzeile und Statuszeile, damit Schrift dort immer lesbar bleibt
    L.push("  float vy = vUv.y * uRes.y; float vv = 1.0 - smoothstep(0.0, uVeilH, vy); vv = vv * vv * (3.0 - 2.0 * vv);");
    L.push("  col = mix(col, uVeil, vv * uVeilA);");
    L.push("  gl_FragColor = vec4(col, 1.0);");
    L.push("}");
    return L.join("\n");
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
      im.onerror = () => rej(new Error("Bild fehlt: " + String(src).slice(0, 60)));
      im.src = src;
    });
  }

  // Ausschnitt wie object-fit: cover, aber so, dass der Fokuspunkt (Haus, Gerät) im Bild bleibt. focus = [x, y] im Foto,
  // optional [x, y, sx, sy]: wo der Punkt auf dem Bildschirm landen soll. zoom > 1 schneidet enger zu.
  function cropFor(w, h, asp, focus, zoom) {
    const sa = w / h, z = Math.max(1, zoom || 1), fx = focus[0], fy = focus[1], px = focus[2] ?? 0.5, py = focus[3] ?? 0.5;
    let su, sv;
    if (sa > asp) { su = 1; sv = asp / sa; } else { su = sa / asp; sv = 1; }
    su /= z; sv /= z;
    return [clamp(fx - su * px, 0, 1 - su), clamp(fy - sv * py, 0, 1 - sv), su, sv];
  }
  const isPhoneLike = (w, h) => w / h < 0.85;

  function createGL(canvas, first) {
    const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" };
    let gl = null;
    try { gl = canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs); } catch (e) { gl = null; }
    if (!gl) return null;
    const NAMES = ["uImg", "uMask", "uCrop", "uRes", "uT", "uAsp", "uDark", "uVeil", "uVeilA", "uVeilH"];
    const progs = new Map();   // ein Programm je Fotovariante (quer/hoch), die Effekte sitzen an anderen Stellen
    function program(v) {
      if (progs.has(v)) return progs.get(v);
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || "Shader"); return s; };
      const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, fragSource(v));
      const pr = gl.createProgram();
      gl.attachShader(pr, vs); gl.attachShader(pr, fs);
      gl.bindAttribLocation(pr, 0, "aPos");
      gl.linkProgram(pr);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(pr) || "Link");
      const U = {}; for (const n of NAMES) U[n] = gl.getUniformLocation(pr, n);
      const e = { pr, U }; progs.set(v, e); return e;
    }
    try { program(first); }   // gleich prüfen, damit ein Gerät ohne passenden Shader sofort auf das Standbild wechselt
    catch (e) { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); return null; }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const texFrom = (img, unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      return t;
    };
    let tImg = null, tMask = null, cur = null;
    return {
      kind: "webgl",
      ready: () => !!(tImg && cur),
      setImages(v, img, mask) {
        if (gl.isContextLost()) return false;
        let p; try { p = program(v); } catch (e) { return false; }   // Variante lässt sich nicht bauen: alte bleibt stehen
        if (tImg) gl.deleteTexture(tImg);
        if (tMask) gl.deleteTexture(tMask);
        tImg = texFrom(img, 0); tMask = mask ? texFrom(mask, 1) : null; cur = p;
        return true;
      },
      size(bw, bh) { if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; } },
      draw(p) {
        if (!tImg || !cur || gl.isContextLost()) return;
        const U = cur.U;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(cur.pr);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tImg); gl.uniform1i(U.uImg, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tMask || tImg); gl.uniform1i(U.uMask, 1);
        gl.uniform4fv(U.uCrop, p.crop); gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform1f(U.uT, p.t); gl.uniform1f(U.uAsp, p.asp); gl.uniform1f(U.uDark, p.dark);
        gl.uniform3fv(U.uVeil, p.veil); gl.uniform1f(U.uVeilA, p.veilA); gl.uniform1f(U.uVeilH, p.veilH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose() {
        if (!gl.isContextLost()) {
          if (tImg) gl.deleteTexture(tImg);
          if (tMask) gl.deleteTexture(tMask);
          gl.deleteBuffer(buf);
          for (const e of progs.values()) gl.deleteProgram(e.pr);
        }
        progs.clear(); tImg = tMask = cur = null;
      },
    };
  }

  // Ohne WebGL: das Foto steht still, mit Dunkelmodus und Schleier; gezeichnet wird nur bei Änderungen
  function create2D(canvas) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;
    let img = null, key = "";
    canvas.addEventListener("contextrestored", () => { key = ""; }, true);   // Grafikabsturz: neu zeichnen; Erfassungsphase, damit es vor dem redraw() in bg.js läuft
    return {
      kind: "2d",
      ready: () => !!img,
      setImages(v, i) { img = i; key = ""; return true; },
      size(bw, bh) { if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; key = ""; } },
      draw(p) {
        if (!img) return;
        const k = p.crop.join(",") + "|" + p.dark + "|" + canvas.width + "x" + canvas.height;
        if (k === key) return; key = k;
        const W = canvas.width, H = canvas.height, iw = img.naturalWidth, ih = img.naturalHeight;
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(img, p.crop[0] * iw, p.crop[1] * ih, p.crop[2] * iw, p.crop[3] * ih, 0, 0, W, H);
        if (p.dark) { ctx.fillStyle = "rgba(10,14,34,0.48)"; ctx.fillRect(0, 0, W, H); }
        const g = ctx.createLinearGradient(0, 0, 0, p.veilH);
        const c = p.veil.map((x) => Math.round(x * 255)).join(",");
        g.addColorStop(0, `rgba(${c},${p.veilA})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, p.veilH);
      },
      dispose() { img = null; },
    };
  }

  function makeScene(cfg, { canvas2d, canvas3d }) {
    // gleich das Programm der Variante bauen, die gezeigt wird; die andere entsteht erst beim Drehen
    const R = createGL(canvas3d, cfg.tall && isPhoneLike(innerWidth, innerHeight) ? cfg.tall : cfg.wide) || create2D(canvas2d);
    if (!R) return null;
    const on = R.kind === "webgl" ? canvas3d : canvas2d, off = R.kind === "webgl" ? canvas2d : canvas3d;
    off.style.display = "none"; on.style.display = "";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    on.style.transition = "none"; on.style.opacity = "0";   // ohne Übergang, sonst blendet die leere Leinwand erst aus
    let disposed = false, last = null, want = null, v = null, asp = 16 / 9, scale = 1, tries = 0, retryT = 0, toneT = 0, failed = false;
    let chosen = null, pickW = 0, pickH = 0;   // pickH: größte Höhe bei dieser Breite
    const coarse = matchMedia("(pointer: coarse)");
    // Dunkles Foto (Abendszene): Kopfzeile und Werkzeugleiste stehen direkt darauf und werden hell (style.css,
    // data-bg-ton), der Schleier bleibt Navy und die Browserleiste färbt sich passend. Erst wenn das Foto da ist.
    const night = cfg.tone === "dunkel", root = document.documentElement;
    const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]')), metaWas = metas.map((m) => m.content);
    function tone(onOff) {
      if (!night) return;
      root.classList.add("bg-ton-wechsel");   // Farbwechsel der Leisten ohne Übergänge, sonst blitzt dunkle Schrift auf
      if (onOff) root.setAttribute("data-bg-ton", "dunkel"); else root.removeAttribute("data-bg-ton");
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("bg-ton-wechsel")));
      metas.forEach((m, i) => { m.content = onOff ? NAVY : metaWas[i]; });
    }
    // Helle Karten deckender, sobald das dunkle Foto sichtbar wird (style.css, data-bg-foto), sonst wirken sie grau
    function photo(onOff) {
      if (!night) return;
      if (onOff) root.setAttribute("data-bg-foto", "dunkel"); else root.removeAttribute("data-bg-foto");
    }
    // Beim Drucken fehlt das Foto (style.css), die Kopfzeile braucht dann wieder ihre normalen Farben
    const beforePrint = () => { tone(false); photo(false); }, afterPrint = () => { if (!disposed && v) { tone(true); photo(true); } };
    addEventListener("beforeprint", beforePrint); addEventListener("afterprint", afterPrint);
    // Hochformat-Foto, wenn es eins gibt und der Bildschirm hoch ist (Handy); sonst das Querformat. Neue Breite (Drehen,
    // Fenster ziehen): neu wählen. Gleiche Breite: zwischen den Schwellen bleibt das gewählte Foto, und auf Touch-Geräten
    // zählt die volle Höhe, denn Tastatur und Browserleisten nehmen nur Höhe weg und sollen das Foto nicht tauschen.
    const variantFor = (w, h) => {
      if (!cfg.tall) return cfg.wide;
      if (!chosen || w !== pickW) return isPhoneLike(w, h) ? cfg.tall : cfg.wide;   // neue Breite (Drehen, Fenster): neu wählen
      if (coarse.matches) h = Math.max(h, pickH);   // Touch: Tastatur und Leisten nehmen nur Höhe weg, die volle Höhe zählt
      return chosen === cfg.tall ? (w / h < 1 ? cfg.tall : cfg.wide) : (isPhoneLike(w, h) ? cfg.tall : cfg.wide);
    };
    function reveal() {
      const locked = document.body.classList.contains("locked");
      clearTimeout(toneT);
      if (reduce || !locked || on.style.opacity === "1") {
        // Kalender offen (meist Foto aus dem Zwischenspeicher): sofort zeigen, Kopfzeile im selben Bild umschalten
        on.style.transition = "none"; on.style.opacity = "1"; photo(true); tone(true);
        return;
      }
      // Anmeldung: sanft einblenden; die helle Kopfzeile erst, wenn das Foto halb da ist, sonst stünde helle Schrift auf hellem Verlauf
      on.style.transition = "opacity 900ms cubic-bezier(0.23, 1, 0.32, 1)";
      requestAnimationFrame(() => {
        if (disposed) return;
        on.style.opacity = "1"; photo(true);
        toneT = setTimeout(() => { if (!disposed) tone(true); }, 120);
      });
    }
    function pick(w, h) {
      const nv = variantFor(w, h); pickH = w === pickW ? Math.max(pickH, h) : h; pickW = w; chosen = nv;
      if (nv === want) return;   // lädt schon, ist schon da oder wartet auf den nächsten Versuch
      want = nv; clearTimeout(retryT);
      if (nv === v) return;      // zurück zum Foto, das schon gezeigt wird
      failed = false;            // lädt gerade: „online“ startet keinen zweiten Abruf
      Promise.all([loadImage(nv.img), nv.mask ? loadImage(nv.mask) : Promise.resolve(null)]).then(([im, mk]) => {
        if (disposed || want !== nv || !R.setImages(nv, im, mk)) return;
        tries = 0; failed = false; v = nv; asp = im.naturalWidth / im.naturalHeight;
        if (last) draw(last);
        reveal();
      }).catch(() => {
        // Ohne Foto bleibt der Farbverlauf der Seite stehen. Später noch einmal versuchen, etwa nach einem Funkloch;
        // bis dahin löst ein Größenwechsel keinen neuen Abruf aus (want bleibt stehen).
        if (disposed || want !== nv) return;
        failed = true;
        if (tries < 3) retryT = setTimeout(() => { if (!disposed && last && want === nv) { want = null; pick(last.w, last.h); } }, [8000, 30000, 120000][tries++]);
      });
    }
    // Wieder Netz: gleich noch einmal versuchen statt auf den nächsten Termin zu warten
    const online = () => { if (!disposed && failed && last) { failed = false; clearTimeout(retryT); want = null; pick(last.w, last.h); } };
    addEventListener("online", online);
    function layout(st) {
      const w = Math.max(1, st.w), h = Math.max(1, st.h), dpr = Math.min(window.devicePixelRatio || 1, 3);
      const ph = cfg.tall ? v === cfg.tall : isPhoneLike(w, h);
      let focus = (ph && v.focusPhone) || v.focus || [0.5, 0.5], zoom = ph ? v.zoomPhone : v.zoom;
      if (ph && v.below) {
        // Gerät mindestens „below“ Pixel unter der Bildschirmmitte, also unter der Anmeldekarte, auch in niedrigen
        // Fenstern (Safari mit Leisten); dafür so weit zoomen, dass der Ausschnitt oben nicht über das Foto hinausragt
        const py = clamp(0.5 + v.below / h, focus[3] ?? 0.5, 0.95), svCover = w / h > asp ? asp / (w / h) : 1;
        focus = [focus[0], focus[1], focus[2] ?? 0.5, py];
        zoom = Math.max(zoom || 1, (svCover * py) / focus[1]);
      }
      const crop = cropFor(w, h, asp, focus, zoom);
      // Nicht feiner zeichnen, als das Foto Pixel hat (höchstens 1,6 Megapixel): spart auf Handys viel Rechenzeit und Akku
      const srcPx = (v.px || 1680 * 944) * crop[2] * crop[3];
      scale = clamp(Math.sqrt(Math.min(1.6e6, Math.max(srcPx * 1.2, w * h * 0.5)) / (w * h)), 0.4, dpr);
      R.size(Math.round(w * scale), Math.round(h * scale));
      return crop;
    }
    function draw(st) {
      if (!v || !R.ready()) return;
      const crop = layout(st), phone = st.w < 700, navy = night || st.dark;
      R.draw({ crop, t: st.t % 3600, asp, dark: st.dark ? 1 : 0,
        veil: navy ? VEIL.dark : VEIL.light, veilA: navy ? 0.62 : 0.7, veilH: (phone ? 150 : 96) * scale });
    }
    return {
      fps: R.kind === "webgl" ? (cfg.fps || 24) : 0,   // 0: Standbild ohne WebGL, der Rahmen zeichnet nur bei Änderungen
      stillT: cfg.stillT || 7,
      resize(st) { last = st; pick(st.w, st.h); },   // gezeichnet wird danach mit dem richtigen Zeitpunkt (frame)
      frame(st) { last = st; draw(st); },
      dispose() {
        disposed = true; clearTimeout(retryT); clearTimeout(toneT); R.dispose(); tone(false); photo(false);
        removeEventListener("beforeprint", beforePrint); removeEventListener("afterprint", afterPrint); removeEventListener("online", online);
        on.style.opacity = ""; on.style.transition = "";
      },
    };
  }

  window.PWBG = window.PWBG || {};
  window.PWFOTO = {
    define(key, cfg) {
      window.PWBG[key] = { title: cfg.title, create: (o) => makeScene(cfg, o) };
    },
    _fragSource: fragSource,
  };
})();

/* Szene für den Teamkalender (Foto und Maske liegen in bg/). Koordinaten in Bildanteilen (x nach rechts, y nach unten,
   0..1); Radien in Bildhöhen. focus: dieser Punkt bleibt beim Zuschneiden sichtbar, optional mit Bildschirmposition. */
(() => {
  const P = window.PWFOTO, B = "bg/";
  // Wallbox am Abend: Wolken ziehen, Sterne funkeln, der Ring der Wallbox atmet (Auto lädt), die nasse Einfahrt schimmert
  const WB_GREEN = [0.35, 1.0, 0.6];
  P.define("wallbox-abend", {
    title: "Wallbox am Abend",
    tone: "dunkel",
    fps: 15,   // alles bewegt sich langsam, mehr Bilder pro Sekunde sähe man nicht, kosten aber Akku
    wide: {
      img: B + "wallbox-abend.webp", mask: B + "wallbox-abend-maske.png", px: 1600 * 899,
      focus: [0.613, 0.667, 0.72, 0.6],   // Wallbox rechts neben der Anmeldekarte
      sky: { dir: [1, 0], amount: 0.012, period: 40 },
      stars: { amount: 0.8, share: 0.03, density: 110, cloudsInB: true },
      ripple: { freq: 160, speed: 1.1, amount: 0.0016 },
      leds: [
        { p: [0.6128, 0.6735], r: 0.009, color: WB_GREEN, mode: "pulse", period: 4, amount: 0.55, dim: 0.25 },
        { p: [0.6128, 0.6735], r: 0.035, color: WB_GREEN, mode: "pulse", period: 4, amount: 0.08, dim: 0 },
      ],
    },
    tall: {
      // px: echte Bildschärfe des Hochformats (449 × 799, doppelt hochgerechnet); feiner zu zeichnen kostet nur Akku
      img: B + "wallbox-abend-hoch.webp", mask: B + "wallbox-abend-hoch-maske.png", px: 449 * 799 * 2,
      focus: [0.6, 0.754, 0.5, 0.8], zoomPhone: 1.08,   // Wallbox knapp unter der Anmeldekarte
      below: 257,   // Wallbox mindestens 257 px unter der Bildschirmmitte, also unter der Anmeldekarte
      sky: { dir: [1, 0], amount: 0.012, period: 40 },
      stars: { amount: 0.8, share: 0.03, density: 110, cloudsInB: true },
      ripple: { freq: 160, speed: 1.1, amount: 0.0016 },
      leds: [
        { p: [0.602, 0.7566], r: 0.0055, color: WB_GREEN, mode: "pulse", period: 4, amount: 0.55, dim: 0.25 },
        { p: [0.602, 0.7566], r: 0.02, color: WB_GREEN, mode: "pulse", period: 4, amount: 0.08, dim: 0 },
      ],
    },
  });
})();
