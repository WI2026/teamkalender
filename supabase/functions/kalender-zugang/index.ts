// Persönliche Zugänge zum Teamkalender.
// „einrichten“ ruft die Anmeldeseite ohne Anmeldung auf (Name, Einmal-Code, neues Passwort).
// Alle anderen Aktionen verlangen die Anmeldung eines Verwalters; das prüft diese Funktion selbst (verify_jwt aus).
import { createClient } from "npm:@supabase/supabase-js@2";

const ERLAUBT = ["https://wi2026.github.io"];
const TEAM = "kalender@wattcon-installation.de";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const SCHLUESSEL = (() => {
  try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; if (k) return k as string; } catch { /* alter Schlüssel */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
})();
const db = createClient(URL_, SCHLUESSEL, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HAEUFIG = ["passwort", "password", "pentawerk", "wattcon", "teamkalender", "kalender", "1234567890", "qwertzuiop", "qwertyuiop"];

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

// Mindestens 10 Zeichen, höchstens 72 Bytes (Grenze des Verfahrens), nicht nur Name oder ein bekanntes Wort
function passwortFehler(pw: string, name: string): string {
  if (pw.length < 10) return "passwort_kurz";
  if (new TextEncoder().encode(pw).length > 72) return "passwort_lang";
  const k = pw.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  if (/^(.)\1+$/.test(pw)) return "passwort_schwach";
  if (HAEUFIG.some((w) => k === w || k.startsWith(w) && /^\d*$/.test(k.slice(w.length)))) return "passwort_schwach";
  const n = name.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  if (n.length >= 3 && k.startsWith(n) && /^\d*$/.test(k.slice(n.length))) return "passwort_schwach";
  return "";
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

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
      const person = String(b.person || ""), code = String(b.code || "").toUpperCase().replace(/[^0-9A-Z]/g, ""), pw = String(b.passwort ?? "");
      if (!UUID.test(person) || code.length !== 8) return antwort(400, { fehler: "eingabe" });
      const chk = await rpc<{ ok: boolean; fehler?: string; email?: string; name?: string; user_id?: string | null }>("kalender_z_code_pruefen", { p_person: person, p_code: code });
      if (!chk || !chk.ok) return antwort(403, { fehler: chk?.fehler || "falsch" });
      const pf = passwortFehler(pw, chk.name || "");
      if (pf) return antwort(400, { fehler: pf });
      let uid = chk.user_id || null;
      if (uid) {
        const r = await db.auth.admin.updateUserById(uid, { password: pw, ban_duration: "none" });
        if (r.error) return antwort(r.error.code === "weak_password" ? 400 : 500, { fehler: r.error.code === "weak_password" ? "passwort_schwach" : "server" });
      } else {
        const r = await db.auth.admin.createUser({ email: chk.email!, password: pw, email_confirm: true, user_metadata: { kalender_name: chk.name } });
        if (r.error || !r.data.user) return antwort(r.error?.code === "weak_password" ? 400 : 500, { fehler: r.error?.code === "weak_password" ? "passwort_schwach" : "server" });
        uid = r.data.user.id;
      }
      if (!(await rpc<boolean>("kalender_z_fertig", { p_person: person, p_user: uid, p_code: code }))) return antwort(403, { fehler: "kein_code" });
      return antwort(200, { ok: true, email: chk.email });
    }

    // ---------- Verwaltung: nur mit Anmeldung eines Verwalters ----------
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt || jwt.split(".").length !== 3) return antwort(401, { fehler: "anmeldung" });
    const { data: ud, error: ue } = await db.auth.getUser(jwt);
    const email = (ud?.user?.email || "").toLowerCase();
    if (ue || !email) return antwort(401, { fehler: "anmeldung" });
    if (!(await rpc<boolean>("kalender_z_admin", { p_email: email }))) return antwort(403, { fehler: "keine_rechte" });
    const liste = () => rpc<{ personen: { id: string; email: string }[]; team_aktiv: boolean }>("kalender_z_liste", {});
    const ich = async (person: string) => (await liste()).personen.some((p) => p.id === person && p.email === email);

    if (aktion === "liste") return antwort(200, { ...(await liste()), ich: email === TEAM ? null : email });

    if (aktion === "anlegen") {
      const name = String(b.name || "").replace(/\s+/g, " ").trim();
      if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name) || /^team/i.test(name)) return antwort(400, { fehler: "name" });
      try { return antwort(200, await rpc("kalender_z_anlegen", { p_name: name, p_admin: !!b.admin, p_wer: email })); }
      catch (e) { if ((e as { code?: string }).code === "23505") return antwort(409, { fehler: "name_vergeben" }); throw e; }
    }

    const person = String(b.person || "");
    if (["neuer_code", "sperren", "entfernen", "admin_setzen"].includes(aktion)) {
      if (!UUID.test(person)) return antwort(400, { fehler: "eingabe" });
      // Sich selbst aussperren oder das eigene Verwalter-Recht nehmen geht nicht
      if (await ich(person)) return antwort(400, { fehler: "selbst" });
    }
    if (aktion === "neuer_code") { const r = await rpc("kalender_z_neuer_code", { p_person: person, p_wer: email }); return r ? antwort(200, r) : antwort(404, { fehler: "unbekannt" }); }
    if (aktion === "sperren") return (await rpc<boolean>("kalender_z_sperren", { p_person: person, p_wer: email })) ? antwort(200, { ok: true }) : antwort(404, { fehler: "unbekannt" });
    if (aktion === "admin_setzen") return (await rpc<boolean>("kalender_z_admin_setzen", { p_person: person, p_admin: !!b.admin, p_wer: email })) ? antwort(200, { ok: true }) : antwort(404, { fehler: "unbekannt" });
    if (aktion === "entfernen") {
      const r = await rpc<{ user_id: string | null } | null>("kalender_z_entfernen", { p_person: person, p_wer: email });
      if (!r) return antwort(404, { fehler: "unbekannt" });
      if (r.user_id) await db.auth.admin.deleteUser(r.user_id);
      return antwort(200, { ok: true });
    }
    if (aktion === "team_aus") {
      if (email === TEAM) return antwort(400, { fehler: "selbst" });
      return (await rpc<boolean>("kalender_z_team_aus", { p_wer: email })) ? antwort(200, { ok: true }) : antwort(409, { fehler: "kein_verwalter" });
    }
    return antwort(400, { fehler: "aktion" });
  } catch (e) {
    console.error(aktion, (e as { code?: string; message?: string }).code || "", (e as { message?: string }).message || "");
    return antwort(500, { fehler: "server" });
  }
});
