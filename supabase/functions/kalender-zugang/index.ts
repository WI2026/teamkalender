// Persönliche Zugänge zum Teamkalender.
// „einrichten“ ruft die Anmeldeseite ohne Anmeldung auf (Einmal-Code und neues Passwort; die Person ergibt sich allein aus dem Code).
// Alle anderen Aktionen verlangen die Anmeldung eines Verwalters; das prüft diese Funktion selbst (verify_jwt aus, siehe supabase/config.toml).
import { createClient } from "npm:@supabase/supabase-js@2";

const ERLAUBT = ["https://wi2026.github.io"];
const TEAM = "kalender@wattcon-installation.de";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const SCHLUESSEL = (() => {
  try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; if (k) return k as string; } catch { /* alter Schlüssel */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
})();
const db = createClient(URL_, SCHLUESSEL, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GESPERRT = "876000h";   // Anmeldung gesperrt, bis die Person mit einem neuen Code ein Passwort festlegt
// Wörter und Sätze, die zu nah an Seite, Firma oder früheren Beispielen liegen (auch mit Zahlen davor oder danach)
const HAEUFIG = ["passwort", "password", "pentawerk", "wattcon", "wattconinstallation", "teamkalender", "kalender", "pentawerkteamkalender",
  "montagkommtderzählerschrank", "1234567890", "qwertzuiop", "qwertyuiop"];

function kopf(req: Request): Record<string, string> {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ERLAUBT.includes(o) ? o : ERLAUBT[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

// Mindestens 10 Zeichen, höchstens 72 Bytes (Grenze des Verfahrens). Ohne Name (auch Teile davon), Firma und bekannte Wörter
// muss mehr übrig bleiben als ein paar Zeichen oder nur Zahlen.
function passwortFehler(pw: string, name: string): string {
  if (pw.length < 10) return "passwort_kurz";
  if (new TextEncoder().encode(pw).length > 72) return "passwort_lang";
  if (/^(.)\1+$/u.test(pw)) return "passwort_schwach";
  // Zwei Schreibweisen ohne Akzente: „Hüseyin“ als „huseyin“ und „hueseyin“, „Weiß“ als „weiss“ (auch „ş“, „ç“, „ı“ usw.)
  const falten = (s: string, umlaut: boolean) => {
    let t = s.normalize("NFC").toLowerCase().replace(/ß/g, "ss").replace(/ı/g, "i");
    if (umlaut) t = t.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
    return t.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
  };
  const woerter = (umlaut: boolean) => [falten(name, umlaut), ...name.split(/[^\p{L}\p{N}]+/u).map((w) => falten(w, umlaut))];
  const weg = [...new Set([...HAEUFIG.map((w) => falten(w, false)), ...HAEUFIG.map((w) => falten(w, true)), ...woerter(false), ...woerter(true)])]
    .filter((w) => w.length >= 3).sort((a, b) => b.length - a.length);
  for (const umlaut of [false, true]) {
    let rest = falten(pw, umlaut);
    for (const w of weg) rest = rest.split(w).join("");
    if (/^\d*$/.test(rest) || [...rest].length < 4) return "passwort_schwach";
  }
  return "";
}

// Absender für die Drossel beim Einrichten: die Adresse, die Cloudflare vor Supabase selbst einträgt (kann der Aufrufer nicht setzen),
// sonst der erste Eintrag in x-forwarded-for. IPv6 zählt je /64, weil ein Anschluss meist ein ganzes /64 hat.
function absenderAus(h: Headers): string {
  const roh = (h.get("cf-connecting-ip") || (h.get("x-forwarded-for") || "").split(",")[0] || "").trim().toLowerCase().slice(0, 64);
  if (!roh.includes(":")) return roh;
  const [vorne, hinten = ""] = roh.split("%")[0].split("::");
  const a = vorne ? vorne.split(":") : [], z = hinten ? hinten.split(":") : [];
  const voll = roh.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - z.length)).fill("0"), ...z] : a;
  return voll.slice(0, 4).map((x) => (parseInt(x || "0", 16) || 0).toString(16)).join(":") + "::/64";
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
const fehlerCode = (e: unknown) => (e as { code?: string } | null)?.code || "";

Deno.serve(async (req) => {
  const h = kopf(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const antwort = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method !== "POST") return antwort(405, { fehler: "methode" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return antwort(400, { fehler: "eingabe" }); }
  if (!b || typeof b !== "object") return antwort(400, { fehler: "eingabe" });
  const aktion = String(b.aktion || "");

  try {
    // ---------- erstes Passwort oder neues Passwort mit Einmal-Code ----------
    if (aktion === "einrichten") {
      const code = String(b.code || "").toUpperCase().replace(/[^0-9A-Z]/g, ""), pw = String(b.passwort ?? "");
      if (code.length !== 10) return antwort(400, { fehler: "eingabe" });
      // Absender für die Drossel je Absender (die Datenbank speichert davon nur einen Hash)
      const absender = absenderAus(req.headers);
      const chk = await rpc<{ ok: boolean; fehler?: string; person?: string; email?: string; name?: string; user_id?: string | null }>(
        "kalender_z_code_pruefen", { p_code: code, p_absender: absender });
      if (!chk || !chk.ok) return antwort(chk?.fehler === "zu_viele" ? 429 : 403, { fehler: chk?.fehler || "falsch" });
      const pf = passwortFehler(pw, chk.name || "");
      if (pf) return antwort(400, { fehler: pf });
      if (await rpc<boolean>("kalender_z_wie_team", { p_pw: pw })) return antwort(400, { fehler: "passwort_wie_team" });
      const person = String(chk.person);
      let uid = chk.user_id || null, email = String(chk.email);
      if (uid) {
        const r = await db.auth.admin.updateUserById(uid, { password: pw, ban_duration: "none", email_confirm: true });
        if (r.error) {
          if (fehlerCode(r.error) === "weak_password") return antwort(400, { fehler: "passwort_schwach" });
          if (fehlerCode(r.error) !== "user_not_found") throw r.error;
          uid = null;   // Konto inzwischen gelöscht: neu anlegen
        }
      }
      if (!uid) {
        // Nur Konten, die diese Funktion für die Person anlegt, zählen (Kennzeichen in app_metadata, das Nutzer nicht ändern können)
        const anlegen = () => db.auth.admin.createUser({ email, password: pw, email_confirm: true,
          app_metadata: { kalender_person: person }, user_metadata: { kalender_name: chk.name } });
        let r = await anlegen();
        if (r.error && fehlerCode(r.error) === "email_exists") {
          // Adresse ist von einem fremden Konto belegt: neue Adresse für die Person
          const neu = await rpc<string | null>("kalender_z_neue_adresse", { p_person: person });
          if (!neu) throw r.error;
          email = neu;
          r = await anlegen();
        }
        if (r.error || !r.data.user) {
          if (fehlerCode(r.error) === "weak_password") return antwort(400, { fehler: "passwort_schwach" });
          throw r.error || new Error("kein Konto");
        }
        uid = r.data.user.id;
      }
      if (!(await rpc<boolean>("kalender_z_fertig", { p_person: person, p_user: uid, p_code: code }))) return antwort(403, { fehler: "kein_code" });
      return antwort(200, { ok: true, email, name: chk.name, id: person });
    }

    // ---------- Verwaltung: nur mit Anmeldung eines Verwalters ----------
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt || jwt.split(".").length !== 3) return antwort(401, { fehler: "anmeldung" });
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    if (ue) {
      // Eine Störung bei Supabase (kein Netz, 5xx, zu viele Anfragen) heißt nicht „abgemeldet“; alles andere ist eine ungültige Anmeldung
      const st = (ue as { status?: number }).status || 0;
      const stoerung = ue.name === "AuthRetryableFetchError" || ue.name === "AuthUnknownError" || st === 0 || st === 429 || st >= 500;
      return stoerung ? antwort(503, { fehler: "server" }) : antwort(401, { fehler: "anmeldung" });
    }
    const email = (ud?.user?.email || "").toLowerCase(), kontoId = ud?.user?.id || "";
    if (!email || !UUID.test(kontoId)) return antwort(401, { fehler: "anmeldung" });
    // Verwalter ist genau dieses Konto, nicht irgendein Konto mit derselben Adresse
    if (!(await rpc<boolean>("kalender_z_admin", { p_email: email, p_user: kontoId }))) return antwort(403, { fehler: "keine_rechte" });
    const team = email === TEAM, ich = team ? null : email;
    type Person = { id: string; email: string; eingerichtet: boolean };
    const liste = () => rpc<{ personen: Person[]; team_aktiv: boolean; verwalter: number }>("kalender_z_liste", {});

    if (aktion === "liste") return antwort(200, { ...(await liste()), ich, team });

    // Keine unsichtbaren Zeichen (sonst zwei gleich aussehende Namen) und keine Namen, die im Protokoll für die Datenbank selbst stehen
    const nameAus = (v: unknown) => {
      const n = String(v || "").normalize("NFC").replace(/\s+/g, " ").trim();
      return !n || n.length > 40 || /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(n) || /^team/i.test(n)
        || /^(datenbank|system|einrichtung|notfall)$/i.test(n) ? "" : n;
    };
    if (aktion === "anlegen") {
      const name = nameAus(b.name);
      if (!name) return antwort(400, { fehler: "name" });
      try { return antwort(200, await rpc("kalender_z_anlegen", { p_name: name, p_admin: !!b.admin, p_wer: email })); }
      catch (e) { if (fehlerCode(e) === "23505") return antwort(409, { fehler: "name_vergeben" }); throw e; }
    }

    if (aktion === "team_aus") {
      if (team) return antwort(400, { fehler: "selbst" });
      return (await rpc<boolean>("kalender_z_team_aus", { p_wer: email })) ? antwort(200, { ok: true }) : antwort(409, { fehler: "kein_verwalter" });
    }

    if (!["neuer_code", "sperren", "entfernen", "admin_setzen", "umbenennen"].includes(aktion)) return antwort(400, { fehler: "aktion" });
    const person = String(b.person || "").toLowerCase();
    if (!UUID.test(person)) return antwort(400, { fehler: "eingabe" });
    const p = (await liste()).personen.find((x) => x.id === person);
    if (!p) return antwort(404, { fehler: "unbekannt" });
    // Das Team-Konto richtet nur ein: an Personen mit eigenem Passwort ändert es nichts. Einzige Ausnahme: das Verwalter-Recht geben
    // (z. B. wenn sich der Inhaber ohne Häkchen eingerichtet hat). Damit endet die Team-Phase sofort.
    if (team && p.eingerichtet && !(aktion === "admin_setzen" && b.admin === true)) return antwort(403, { fehler: "team_nicht" });
    if (aktion === "umbenennen") {
      const name = nameAus(b.name);
      if (!name) return antwort(400, { fehler: "name" });
      try {
        return (await rpc<boolean>("kalender_z_umbenennen", { p_person: person, p_name: name, p_wer: email }))
          ? antwort(200, { ok: true }) : antwort(404, { fehler: "unbekannt" });
      } catch (e) { if (fehlerCode(e) === "23505") return antwort(409, { fehler: "name_vergeben" }); throw e; }
    }
    // Sich selbst aussperren oder das eigene Verwalter-Recht nehmen geht nicht
    if (p.email === ich) return antwort(400, { fehler: "selbst" });

    // Anmeldekonto sperren, damit das alte Passwort sofort nichts mehr nützt (Fehler nur protokollieren: der Zugang ist schon entzogen)
    const sperre = async (uid: string | null | undefined) => {
      if (!uid) return;
      const r = await db.auth.admin.updateUserById(uid, { ban_duration: GESPERRT });
      if (r.error && fehlerCode(r.error) !== "user_not_found") console.error("sperre", fehlerCode(r.error), r.error.message);
    };
    if (aktion === "neuer_code") {
      const r = await rpc<{ id: string; code: string; bis: string; user_id: string | null } | null>("kalender_z_neuer_code", { p_person: person, p_wer: email });
      if (!r) return antwort(404, { fehler: "unbekannt" });
      await sperre(r.user_id);
      return antwort(200, { id: r.id, code: r.code, bis: r.bis });
    }
    if (aktion === "sperren") {
      const r = await rpc<{ user_id: string | null } | null>("kalender_z_sperren", { p_person: person, p_wer: email });
      if (!r) return antwort(404, { fehler: "unbekannt" });
      await sperre(r.user_id);
      return antwort(200, { ok: true });
    }
    if (aktion === "admin_setzen") {
      return (await rpc<boolean>("kalender_z_admin_setzen", { p_person: person, p_admin: !!b.admin, p_wer: email }))
        ? antwort(200, { ok: true }) : antwort(404, { fehler: "unbekannt" });
    }
    // entfernen: erst den Zugang entziehen (Sitzungen enden, Code weg), dann das Anmeldekonto löschen, zuletzt die Person.
    // Bricht es mittendrin ab, bleibt höchstens eine gesperrte Person übrig, nie ein freigeschalteter Zugang ohne Konto.
    const gesperrt = await rpc<{ user_id: string | null } | null>("kalender_z_sperren", { p_person: person, p_wer: email });
    if (!gesperrt) return antwort(404, { fehler: "unbekannt" });
    if (gesperrt.user_id) {
      const r = await db.auth.admin.deleteUser(gesperrt.user_id);
      if (r.error && fehlerCode(r.error) !== "user_not_found") throw r.error;
    }
    return (await rpc<boolean>("kalender_z_entfernen", { p_person: person, p_wer: email })) ? antwort(200, { ok: true }) : antwort(404, { fehler: "unbekannt" });
  } catch (e) {
    // Team-Phase ist zwischen Prüfung und Aktion zu Ende gegangen
    if (fehlerCode(e) === "42501") return antwort(403, { fehler: "keine_rechte" });
    console.error(aktion, fehlerCode(e), (e as { message?: string } | null)?.message || "");
    return antwort(500, { fehler: "server" });
  }
});
