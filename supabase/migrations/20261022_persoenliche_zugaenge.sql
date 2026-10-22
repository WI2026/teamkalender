-- Persönliche Zugänge zum Teamkalender: jede Person meldet sich mit Namen und eigenem Passwort an.
-- Das erste Passwort legt sie mit einem Einmal-Code fest, den ein Verwalter im Kalender erzeugt.
-- Termine (public.kalender_termine) und ihre Regeln bleiben unverändert. Geändert wird nur die Prüffunktion
-- privat.kalender_berechtigt(): Zugriff hat ein Konto nur noch mit einer bestehenden Anmeldung (Sitzung).
-- So wirken Sperren, neuer Code und das Abschalten des Team-Passworts sofort und nicht erst nach Ablauf des Tokens.

create table privat.kalender_personen (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'),
  -- Anmeldeadresse ohne Postfach; der Kalender verschickt keine E-Mails
  email text not null unique check (email ~ '^p-[0-9a-f]{12}@kalender\.wattcon-installation\.de$'),
  user_id uuid unique,
  admin boolean not null default false,
  -- Einmal-Code: nur sein Hash; gefunden wird die Person allein über den Code
  code_hash text unique,
  code_bis timestamptz,
  eingerichtet_am timestamptz,
  angelegt_am timestamptz not null default now()
);
create unique index kalender_personen_name_eindeutig on privat.kalender_personen (lower(name));

create table privat.kalender_protokoll (
  id bigint generated always as identity primary key,
  am timestamptz not null default now(),
  wer text not null,
  aktion text not null,
  person text
);

-- Falsche Codes je Stunde (gegen Durchprobieren, ohne einzelne Personen sperren zu können)
create table privat.kalender_fehlversuche (
  stunde timestamptz primary key,
  anzahl int not null default 0
);

alter table privat.kalender_personen enable row level security;
alter table privat.kalender_protokoll enable row level security;
alter table privat.kalender_fehlversuche enable row level security;
revoke all on privat.kalender_personen, privat.kalender_protokoll, privat.kalender_fehlversuche from public, anon, authenticated;

-- ---------- Zugriffsprüfung für die Termine: Adresse freigeschaltet UND Anmeldung (Sitzung) besteht noch ----------
create or replace function privat.kalender_berechtigt()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.kalender_zugang z
    where lower(z.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  ) and exists (
    select 1 from auth.sessions s
    where s.id::text = coalesce((select auth.jwt() ->> 'session_id'), '')
      and s.user_id::text = coalesce((select auth.jwt() ->> 'sub'), '')
  );
$$;

-- Hash eines Einmal-Codes (Codes sind zufällig, 8 Zeichen aus 31)
create function privat.kalender_code_hash(p_code text)
returns text language sql immutable set search_path = ''
as $$ select encode(extensions.digest('kalender-code:' || upper(p_code), 'sha256'), 'hex'); $$;

-- Darf das Team-Konto noch verwalten? Nur zum Start, solange keine eingerichtete Person verwalten darf
create function privat.kalender_team_verwaltet()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.kalender_zugang z where z.email = 'kalender@wattcon-installation.de')
     and not exists (select 1 from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email
                     where p.admin and p.user_id is not null);
$$;

-- ---------- für die Anmeldeseite (ohne Anmeldung) ----------
-- Namen zur Auswahl: nur eingerichtete Personen; dazu der Team-Zugang, solange es ihn gibt.
create function public.kalender_namen()
returns table (id uuid, name text, email text, team boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.email, false
  from privat.kalender_personen p
  where p.user_id is not null and exists (select 1 from public.kalender_zugang z where z.email = p.email)
  union all
  select null, 'Team-Zugang (gemeinsames Passwort)', z.email, true
  from public.kalender_zugang z where z.email = 'kalender@wattcon-installation.de'
  order by 4, 2;
$$;

-- ---------- nach der Anmeldung ----------
-- Wer bin ich? null, wenn das Konto (oder diese Anmeldung) keinen Kalender-Zugang hat
create function public.kalender_ich()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case
    when not privat.kalender_berechtigt() then null
    when lower(coalesce(auth.jwt() ->> 'email', '')) = 'kalender@wattcon-installation.de'
      then jsonb_build_object('name', null, 'admin', privat.kalender_team_verwaltet(), 'team', true)
    else coalesce((select jsonb_build_object('name', p.name, 'admin', p.admin, 'team', false)
                   from privat.kalender_personen p where p.email = lower(auth.jwt() ->> 'email')),
                  jsonb_build_object('name', null, 'admin', false, 'team', false))
  end;
$$;

-- ---------- nur für die Server-Funktion kalender-zugang (Rolle service_role) ----------
create function privat.kalender_neuer_code()
returns text language sql volatile set search_path = ''
as $$
  -- 8 Zeichen ohne leicht verwechselbare (0/O, 1/I/L)
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i;
$$;

-- Freien Code erzeugen und für die Person speichern (7 Tage gültig)
create function privat.kalender_code_setzen(p_person uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_code text; v_bis timestamptz := now() + interval '7 days';
begin
  loop
    v_code := privat.kalender_neuer_code();
    exit when not exists (select 1 from privat.kalender_personen where code_hash = privat.kalender_code_hash(v_code));
  end loop;
  update privat.kalender_personen set code_hash = privat.kalender_code_hash(v_code), code_bis = v_bis where id = p_person;
  return jsonb_build_object('id', p_person, 'code', v_code, 'bis', v_bis);
end $$;

create function privat.kalender_wer(p_email text)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.name from privat.kalender_personen p where p.email = lower(p_email)),
                  case when lower(p_email) = 'kalender@wattcon-installation.de' then 'Team-Zugang' else lower(p_email) end);
$$;

create function privat.kalender_sitzungen_beenden(p_user uuid)
returns void language sql security definer set search_path = ''
as $$ delete from auth.sessions where user_id = p_user; $$;

-- Das Anmeldekonto einer Person: verknüpft, oder (nach abgebrochenem Einrichten) von der Server-Funktion für sie angelegt.
-- Fremde Konten mit derselben Adresse zählen nie.
create function privat.kalender_konto(p_person uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select u.id from privat.kalender_personen p join auth.users u on u.id = p.user_id where p.id = p_person),
    (select u.id from privat.kalender_personen p join auth.users u on lower(u.email) = p.email
     where p.id = p_person and u.raw_app_meta_data ->> 'kalender_person' = p.id::text));
$$;

-- Darf dieses Konto Personen verwalten? Eingerichtete Person mit Verwalter-Recht, oder zum Start der Team-Zugang
create function public.kalender_z_admin(p_email text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when lower(p_email) = 'kalender@wattcon-installation.de' then privat.kalender_team_verwaltet()
    else exists (select 1 from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email
                 where p.email = lower(p_email) and p.admin and p.user_id is not null) end;
$$;

create function public.kalender_z_liste()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'personen', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'admin', p.admin, 'email', p.email, 'eingerichtet', p.user_id is not null,
        'status', case when exists (select 1 from public.kalender_zugang z where z.email = p.email) and p.user_id is not null then 'aktiv'
                       when p.code_hash is not null and p.code_bis > now() then 'code'
                       when p.code_hash is not null then 'abgelaufen'
                       else 'gesperrt' end,
        'code_bis', case when p.code_hash is not null then p.code_bis end,
        'eingerichtet_am', p.eingerichtet_am) order by lower(p.name))
      from privat.kalender_personen p), '[]'::jsonb),
    'team_aktiv', exists (select 1 from public.kalender_zugang z where z.email = 'kalender@wattcon-installation.de'),
    'verwalter', (select count(*) from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email
                  where p.admin and p.user_id is not null));
$$;

create function public.kalender_z_anlegen(p_name text, p_admin boolean, p_wer text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  insert into privat.kalender_personen (name, email, admin)
  values (btrim(p_name), 'p-' || encode(extensions.gen_random_bytes(6), 'hex') || '@kalender.wattcon-installation.de', coalesce(p_admin, false))
  returning id into v_id;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'angelegt' || case when p_admin then ' (Verwalter)' else '' end, btrim(p_name));
  return privat.kalender_code_setzen(v_id);
end $$;

-- Neuer Code: der Zugang endet sofort (auch laufende Anmeldungen); mit dem Code legt die Person ein neues Passwort fest.
-- Gibt das Anmeldekonto mit zurück, damit die Server-Funktion es bis zum Einrichten sperren kann.
create function public.kalender_z_neuer_code(p_person uuid, p_wer text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen; v_user uuid := privat.kalender_konto(p_person);
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found then return null; end if;
  delete from public.kalender_zugang where email = p.email;
  if v_user is not null then perform privat.kalender_sitzungen_beenden(v_user); end if;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'neuer Code', p.name);
  return privat.kalender_code_setzen(p_person) || jsonb_build_object('user_id', v_user);
end $$;

create function public.kalender_z_sperren(p_person uuid, p_wer text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen; v_user uuid := privat.kalender_konto(p_person);
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found then return null; end if;
  delete from public.kalender_zugang where email = p.email;
  if v_user is not null then perform privat.kalender_sitzungen_beenden(v_user); end if;
  update privat.kalender_personen set code_hash = null, code_bis = null where id = p_person;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'gesperrt', p.name);
  return jsonb_build_object('user_id', v_user);
end $$;

-- Anmeldekonto einer Person (für Sperren und Entfernen in der Server-Funktion)
create function public.kalender_z_konto(p_person uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select privat.kalender_konto(p_person); $$;

-- Entfernen: Person weg, Zugang weg; ihre Termine bleiben. Das Anmeldekonto löscht die Server-Funktion vorher.
create function public.kalender_z_entfernen(p_person uuid, p_wer text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen;
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found then return false; end if;
  delete from public.kalender_zugang where email = p.email;
  delete from privat.kalender_personen where id = p_person;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'entfernt', p.name);
  return true;
end $$;

create function public.kalender_z_admin_setzen(p_person uuid, p_admin boolean, p_wer text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare v_name text;
begin
  update privat.kalender_personen set admin = coalesce(p_admin, false) where id = p_person returning name into v_name;
  if v_name is null then return false; end if;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), case when p_admin then 'darf verwalten' else 'darf nicht mehr verwalten' end, v_name);
  return true;
end $$;

-- Code prüfen, ohne ihn zu verbrauchen. Die Person wird allein über den Code gefunden.
-- Nach 300 falschen Codes in einer Stunde wird für den Rest der Stunde gar nicht mehr geprüft.
create function public.kalender_z_code_pruefen(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen; v_std timestamptz := date_trunc('hour', now());
begin
  if coalesce((select anzahl from privat.kalender_fehlversuche where stunde = v_std), 0) >= 300 then
    return jsonb_build_object('ok', false, 'fehler', 'zu_viele');
  end if;
  select * into p from privat.kalender_personen where code_hash = privat.kalender_code_hash(p_code);
  if not found then
    insert into privat.kalender_fehlversuche (stunde, anzahl) values (v_std, 1)
      on conflict (stunde) do update set anzahl = privat.kalender_fehlversuche.anzahl + 1;
    delete from privat.kalender_fehlversuche where stunde < now() - interval '2 days';
    return jsonb_build_object('ok', false, 'fehler', 'falsch');
  end if;
  if p.code_bis <= now() then return jsonb_build_object('ok', false, 'fehler', 'abgelaufen'); end if;
  return jsonb_build_object('ok', true, 'person', p.id, 'email', p.email, 'name', p.name, 'user_id', privat.kalender_konto(p.id));
end $$;

-- Eine neue Anmeldeadresse würfeln, falls die bisherige schon von einem fremden Konto belegt ist
create function public.kalender_z_neue_adresse(p_person uuid)
returns text language sql volatile security definer set search_path = ''
as $$
  update privat.kalender_personen set email = 'p-' || encode(extensions.gen_random_bytes(6), 'hex') || '@kalender.wattcon-installation.de'
  where id = p_person and (user_id is null or not exists (select 1 from auth.users u where u.id = user_id)) returning email;
$$;

-- Passwort ist gesetzt: Code erneut prüfen und verbrauchen, Konto verknüpfen, Zugang freischalten, alte Anmeldungen beenden.
-- Wurde der Code inzwischen gesperrt oder ersetzt, oder ist das Konto nicht das der Person, gibt es keinen Zugang.
create function public.kalender_z_fertig(p_person uuid, p_user uuid, p_code text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen;
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found or p.code_hash is null or p.code_bis <= now() or p.code_hash <> privat.kalender_code_hash(p_code) then return false; end if;
  if p_user is distinct from privat.kalender_konto(p_person) then return false; end if;
  update privat.kalender_personen set user_id = p_user, eingerichtet_am = now(), code_hash = null, code_bis = null where id = p_person;
  perform privat.kalender_sitzungen_beenden(p_user);
  insert into public.kalender_zugang (email) values (p.email) on conflict do nothing;
  insert into privat.kalender_protokoll (wer, aktion, person) values (p.name, 'eigenes Passwort festgelegt', p.name);
  return true;
end $$;

-- Ist das neue Passwort das bisherige Team-Passwort? (Vergleich mit dem gespeicherten Hash, das Passwort wird nicht gespeichert)
create function public.kalender_z_wie_team(p_pw text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from auth.users u where lower(u.email) = 'kalender@wattcon-installation.de'
                 and u.encrypted_password is not null and u.encrypted_password like '$2%'
                 and u.encrypted_password = extensions.crypt(p_pw, u.encrypted_password));
$$;

-- Gemeinsames Team-Passwort abschalten; geht nur, wenn eine eingerichtete Person verwalten darf
create function public.kalender_z_team_aus(p_wer text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
begin
  if privat.kalender_team_verwaltet() or not exists (select 1 from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email
                                                     where p.admin and p.user_id is not null) then
    return false;
  end if;
  delete from public.kalender_zugang where email = 'kalender@wattcon-installation.de';
  perform privat.kalender_sitzungen_beenden(u.id) from auth.users u where lower(u.email) = 'kalender@wattcon-installation.de';
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'Team-Passwort abgeschaltet', null);
  return true;
end $$;

-- Rechte: Namensliste für alle, „wer bin ich“ für Angemeldete, alles andere nur für die Server-Funktion
revoke all on function public.kalender_namen(), public.kalender_ich(), privat.kalender_code_hash(text), privat.kalender_team_verwaltet(),
  privat.kalender_neuer_code(), privat.kalender_code_setzen(uuid), privat.kalender_wer(text), privat.kalender_sitzungen_beenden(uuid),
  privat.kalender_konto(uuid), public.kalender_z_admin(text), public.kalender_z_liste(), public.kalender_z_anlegen(text, boolean, text),
  public.kalender_z_neuer_code(uuid, text), public.kalender_z_sperren(uuid, text), public.kalender_z_konto(uuid),
  public.kalender_z_entfernen(uuid, text), public.kalender_z_admin_setzen(uuid, boolean, text), public.kalender_z_code_pruefen(text),
  public.kalender_z_neue_adresse(uuid), public.kalender_z_fertig(uuid, uuid, text), public.kalender_z_wie_team(text),
  public.kalender_z_team_aus(text) from public, anon, authenticated;
grant execute on function public.kalender_namen() to anon, authenticated;
grant execute on function public.kalender_ich() to authenticated;
grant execute on function public.kalender_z_admin(text), public.kalender_z_liste(), public.kalender_z_anlegen(text, boolean, text),
  public.kalender_z_neuer_code(uuid, text), public.kalender_z_sperren(uuid, text), public.kalender_z_konto(uuid),
  public.kalender_z_entfernen(uuid, text), public.kalender_z_admin_setzen(uuid, boolean, text), public.kalender_z_code_pruefen(text),
  public.kalender_z_neue_adresse(uuid), public.kalender_z_fertig(uuid, uuid, text), public.kalender_z_wie_team(text),
  public.kalender_z_team_aus(text) to service_role;
