/* Kleiner PDF-Schreiber für die Terminübersicht: A4, Schrift Helvetica (in jedem PDF-Programm eingebaut), keine fremde Bibliothek.
   Zeichen außerhalb von Windows-1252 werden ohne Akzent (Ź → Z) oder, wo das nicht geht (Emojis), als „?“ gedruckt. */
(() => {
  // Zeichenbreiten von Helvetica und Helvetica-Bold für die Codes 32–255 (Windows-1252), in 1/1000 der Schriftgröße
  const W = {
    F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,
      556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
    F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,
      556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
  };
  // Unicode → Windows-1252 für den Bereich 0x80–0x9F
  const CP = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
  // Text als Folge von Windows-1252-Codes; Steuerzeichen werden Leerzeichen, unsichtbare Formatzeichen (etwa aus kopierten
  // Telefonnummern) entfallen, geschützte Leerzeichen bleiben geschützt, Unbekanntes wird „?“
  const FORMAT = /^[\p{Cf}\u00ad]$/u, NOBREAK = /^[\u2007\u202f]$/u, SPACE = /^[\p{Zs}\p{Zl}\p{Zp}]$/u, CTRL = /^\p{Cc}$/u;
  function codes(s) {
    const out = [];
    for (const ch of String(s).normalize("NFC")) {
      const u = ch.codePointAt(0);
      if (u === 0xa0 || NOBREAK.test(ch)) { out.push(0xa0); continue; }
      if (FORMAT.test(ch)) continue;
      if (CTRL.test(ch) || (SPACE.test(ch) && u !== 32)) { out.push(32); continue; }
      if (u < 127 || (u >= 0xa0 && u <= 0xff)) { out.push(u); continue; }
      const base = ch.normalize("NFD").codePointAt(0);   // etwa Ź → Z, Ż → Z
      out.push(CP[u] || (base < 127 && base >= 32 ? base : 63));
    }
    return out;
  }
  const widthOf = (cs, font, size) => cs.reduce((a, c) => a + W[font][c - 32], 0) * size / 1000;
  // PDF-Zeichenkette: nur ASCII, Sonderzeichen oktal, Klammern und Backslash maskiert
  const lit = (cs) => "(" + cs.map((c) => c === 40 || c === 41 || c === 92 ? "\\" + String.fromCharCode(c) : c < 128 ? String.fromCharCode(c) : "\\" + c.toString(8)).join("") + ")";

  // Zeilenumbruch an Leerzeichen; zu lange Wörter werden hart getrennt
  function wrap(text, font, size, maxW) {
    const lines = [];
    for (const para of String(text).replace(/\r\n?|[\u0085\u2028\u2029]/g, "\n").split("\n")) {
      const words = codes(para).reduce((ws, c) => { if (c === 32) ws.push([]); else ws[ws.length - 1].push(c); return ws; }, [[]]);
      let line = [];
      for (let w of words) {
        if (!w.length) continue;
        const cand = line.length ? [...line, 32, ...w] : w;
        if (widthOf(cand, font, size) <= maxW) { line = cand; continue; }
        if (line.length) { lines.push(line); line = []; }
        while (widthOf(w, font, size) > maxW) {
          // so viele Zeichen wie in die Zeile passen, mindestens eines
          let n = 0, acc = 0;
          while (n < w.length && (acc += W[font][w[n] - 32] * size / 1000) <= maxW) n++;
          n = Math.max(n, 1);
          lines.push(w.slice(0, n)); w = w.slice(n);
        }
        line = w;
      }
      lines.push(line);
    }
    return lines;
  }

  const A4 = [595.28, 841.89], M = 42, BOTTOM = 52;
  const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
  const NAVY = "#414d86", INK = "#1c1c1e", GREY = "#5d5d66", LINE = "#d8d8de", RED = "#ad0004";

  /* doc: { title, sub: [Zeilen], warn, footer, days: [{ heading, rows: [{ time, title, meta, note, color }] }], empty } */
  function build(doc) {
    const pages = [];
    let ops = null, y = 0;
    const fmt = (n) => (Math.round(n * 100) / 100).toString();
    const text = (x, yy, font, size, color, cs) => ops.push(`BT /${font} ${size} Tf ${rgb(color)} rg ${fmt(x)} ${fmt(yy)} Td ${lit(cs)} Tj ET`);
    const rule = (x1, x2, yy, color, w) => ops.push(`${rgb(color)} RG ${w} w ${fmt(x1)} ${fmt(yy)} m ${fmt(x2)} ${fmt(yy)} l S`);
    const box = (x, yy, s, color) => ops.push(`${rgb(color)} rg ${fmt(x)} ${fmt(yy)} ${s} ${s} re f`);
    function newPage() { ops = []; pages.push(ops); y = A4[1] - M; }
    const fits = (h) => y - h >= BOTTOM;

    newPage();
    text(M, y - 16, "F2", 17, NAVY, codes(doc.title)); y -= 26;
    for (const s of doc.sub) { text(M, y - 9, "F1", 9.5, GREY, codes(s)); y -= 13.5; }
    for (const l of wrap(doc.warn, "F2", 9, A4[0] - 2 * M)) { text(M, y - 9, "F2", 9, RED, l); y -= 12.5; }
    y -= 8;
    if (!doc.days.length) { text(M, y - 12, "F1", 11, INK, codes(doc.empty)); }

    const TX = M + 84, TW = A4[0] - M - TX;   // Spalte für Titel, Art und Notiz
    for (const day of doc.days) {
      const headH = 26;
      let first = true;
      const head = (cont) => {
        y -= 6;
        text(M, y - 11, "F2", 11.5, INK, codes(day.heading + (cont ? " (Fortsetzung)" : "")));
        rule(M, A4[0] - M, y - 16, LINE, 0.6); y -= headH - 6;
      };
      const usable = A4[1] - M - BOTTOM - headH;
      for (const r of day.rows) {
        const tl = wrap(r.title, "F2", 10.5, TW - 12), ml = wrap(r.meta, "F1", 8.5, TW), nl = r.note ? wrap(r.note, "F1", 9, TW) : [];
        const h = tl.length * 13.5 + ml.length * 11 + nl.length * 11.5 + 9;
        // Ein Termin bleibt zusammen, wenn er auf eine Seite passt; sonst läuft eine lange Notiz auf der nächsten Seite weiter
        const need = h <= usable ? h : tl.length * 13.5 + ml.length * 11 + 3 * 11.5 + 9;
        if (first ? !fits(need + headH) : !fits(need)) { newPage(); head(!first); }
        else if (first) head(false);
        first = false;
        let yy = y - 10.5;
        text(M, yy, "F1", 9.5, INK, codes(r.time));
        box(TX, yy + 0.5, 7, r.color);
        tl.forEach((l, i) => text(TX + 12, yy - i * 13.5, "F2", 10.5, INK, l));
        yy -= (tl.length - 1) * 13.5 + 12.5;
        ml.forEach((l) => { text(TX, yy, "F1", 8.5, GREY, l); yy -= 11; });
        nl.forEach((l) => {
          if (yy - 11 < BOTTOM) {
            newPage(); head(true); yy = y - 10.5;
            text(TX, yy, "F1", 8.5, GREY, codes("Fortsetzung der Notiz")); yy -= 11;
          }
          text(TX, yy, "F1", 9, INK, l); yy -= 11.5;
        });
        y = yy + 0.5;
      }
    }

    // Fußzeile mit Seitenzahl auf jeder Seite
    pages.forEach((p, i) => {
      ops = p;
      rule(M, A4[0] - M, 36, LINE, 0.5);
      text(M, 24, "F1", 7.5, GREY, codes(doc.footer));
      const pn = codes(`Seite ${i + 1} von ${pages.length}`);
      text(A4[0] - M - widthOf(pn, "F1", 7.5), 24, "F1", 7.5, GREY, pn);
    });

    // Datei zusammensetzen (nur ASCII, daher Zeichen = Bytes)
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null), pagesObj = add(null);
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = pages.map((p) => {
      const body = p.join("\n");
      const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`);
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
    const utf16 = (s) => "<FEFF" + Array.from(String(s)).map((ch) => { const u = ch.codePointAt(0); return u > 0xffff ? "003F" : u.toString(16).padStart(4, "0"); }).join("").toUpperCase() + ">";
    const info = add(`<< /Title ${utf16(doc.title)} /Producer ${utf16("PentaWerk Teamkalender")} >>`);
    let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";   // jedes Zeichen hier ist genau ein Byte
    const offs = [];
    let pos = out.length, bodyStr = "";
    objs.forEach((o, i) => { offs.push(pos); const s = `${i + 1} 0 obj\n${o}\nendobj\n`; bodyStr += s; pos += s.length; });
    const xref = pos;
    let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
    tail += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    out += bodyStr + tail;
    // In Bytes umwandeln: alle Zeichen liegen unter 256
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
    return bytes;
  }

  window.KalPDF = { build, _wrap: wrap, _codes: codes };
})();
