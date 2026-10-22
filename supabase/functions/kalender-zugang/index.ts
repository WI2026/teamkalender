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

// Mindestens 10 Zeichen, höchstens 72 Bytes (Grenze des Verfahrens), nicht nur Name, Firma oder ein bekanntes Wort mit Zahlen
function passwortFehler(pw: string, name: string): string {
  if (pw.length < 10) return "passwort_kurz";
  if (new TextEncoder().encode(pw).length > 72) return "passwort_lang";
  if (/^(.)\1+$/u.test(pw)) return "passwort_schwach";
  const k = pw.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  const nurZahlen = (s: string) => /^\d*$/.test(s);
  const n = name.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  for (const w of n.length >= 3 ? [...HAEUFIG, n] : HAEUFIG) {
    const i = k.indexOf(w);
    if (i >= 0 && nurZahlen(k.slice(0, i)) && nurZahlen(k.slice(i + w.length))) return "passwort_schwach";
  }
  return "";
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
      if (code.length !== 8) return antwort(400, { fehler: "eingabe" });
      const chk = await rpc<{ ok: boolean; fehler?: string; person?: string; email?: string; name?: string; user_id?: string | null }>(
        "kalender_z_code_pruefen", { p_code: code });
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
    const email = (ud?.user?.email || "").toLowerCase();
    if (!email) return antwort(401, { fehler: "anmeldung" });
    if (!(await rpc<boolean>("kalender_z_admin", { p_email: email }))) return antwort(403, { fehler: "keine_rechte" });
    const team = email === TEAM, ich = team ? null : email;
    type Person = { id: string; email: string; eingerichtet: boolean };
    const liste = () => rpc<{ personen: Person[]; team_aktiv: boolean; verwalter: number }>("kalender_z_liste", {});

    if (aktion === "liste") return antwort(200, { ...(await liste()), ich, team });

    if (aktion === "anlegen") {
      const name = String(b.name || "").replace(/\s+/g, " ").trim();
      if (!name || name.length > 40 || /[\u0000-\u001f\u007f-\u009f]/.test(name) || /^team/i.test(name)) return antwort(400, { fehler: "name" });
      try { return antwort(200, await rpc("kalender_z_anlegen", { p_name: name, p_admin: !!b.admin, p_wer: email })); }
      catch (e) { if (fehlerCode(e) === "23505") return antwort(409, { fehler: "name_vergeben" }); throw e; }
    }

    if (aktion === "team_aus") {
      if (team) return antwort(400, { fehler: "selbst" });
      return (await rpc<boolean>("kalender_z_team_aus", { p_wer: email })) ? antwort(200, { ok: true }) : antwort(409, { fehler: "kein_verwalter" });
    }

    if (!["neuer_code", "sperren", "entfernen", "admin_setzen"].includes(aktion)) return antwort(400, { fehler: "aktion" });
    const person = String(b.person || "").toLowerCase();
    if (!UUID.test(person)) return antwort(400, { fehler: "eingabe" });
    const p = (await liste()).personen.find((x) => x.id === person);
    if (!p) return antwort(404, { fehler: "unbekannt" });
    // Sich selbst aussperren oder das eigene Verwalter-Recht nehmen geht nicht
    if (p.email === ich) return antwort(400, { fehler: "selbst" });
    // Das Team-Konto richtet nur ein: an Personen mit eigenem Passwort ändert es nichts
    if (team && p.eingerichtet) return antwort(403, { fehler: "team_nicht" });

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
    // entfernen: zuerst das Anmeldekonto löschen, dann die Person; so bleibt kein Konto mit bekanntem Passwort zurück
    const uid = await rpc<string | null>("kalender_z_konto", { p_person: person });
    if (uid) {
      const r = await db.auth.admin.deleteUser(uid);
      if (r.error && fehlerCode(r.error) !== "user_not_found") throw r.error;
    }
    return (await rpc<boolean>("kalender_z_entfernen", { p_person: person, p_wer: email })) ? antwort(200, { ok: true }) : antwort(404, { fehler: "unbekannt" });
  } catch (e) {
    console.error(aktion, fehlerCode(e), (e as { message?: string } | null)?.message || "");
    return antwort(500, { fehler: "server" });
  }
});
