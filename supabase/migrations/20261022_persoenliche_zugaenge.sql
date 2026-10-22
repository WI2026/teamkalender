-- Persönliche Zugänge zum Teamkalender: jede Person meldet sich mit Namen und eigenem Passwort an.
-- Das erste Passwort legt sie mit einem Einmal-Code fest, den ein Verwalter im Kalender erzeugt.
-- Termine (public.kalender_termine) und ihre Regeln bleiben unverändert. Geändert wird nur die Prüffunktion
-- privat.kalender_berechtigt(): Zugriff hat nur noch das Konto der Person selbst mit einer bestehenden Anmeldung (Sitzung).
-- So wirken Sperren, neuer Code und das Abschalten des Team-Passworts sofort und nicht erst nach Ablauf des Tokens.
-- Neu ist außerdem ein Änderungsprotokoll der Termine (wer hat wann was geändert), das nur Verwalter lesen.

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
  -- Code wurde mit dem gemeinsamen Team-Passwort erzeugt (wird ungültig, sobald das Team nicht mehr verwaltet bzw. abgeschaltet ist)
  code_vom_team boolean not null default false,
  eingerichtet_am timestamptz,
  angelegt_am timestamptz not null default now()
);
create unique index kalender_personen_name_eindeutig on privat.kalender_personen (lower(name));

-- Stand der Einrichtung, genau eine Zeile
create table privat.kalender_stand (
  eine boolean primary key default true check (eine),
  -- Ab hier verwaltet das Team-Konto nie wieder (auch nicht, wenn der einzige Verwalter später einen neuen Code bekommt)
  team_verwaltung_bis timestamptz,
  -- Zufallswert für die Absender-Kennung bei falschen Codes (die Adresse selbst wird nicht gespeichert)
  salz bytea not null default extensions.gen_random_bytes(16)
);
insert into privat.kalender_stand default values;

create table privat.kalender_protokoll (
  id bigint generated always as identity primary key,
  am timestamptz not null default now(),
  wer text not null,
  aktion text not null,
  person text
);
create index kalender_protokoll_am on privat.kalender_protokoll (am);

-- Änderungen an Terminen: wer, wann, vorher und nachher
create table privat.kalender_aenderungen (
  id bigint generated always as identity primary key,
  am timestamptz not null default now(),
  wer text not null,
  aktion text not null,
  termin uuid,
  vorher jsonb,
  nachher jsonb
);
create index kalender_aenderungen_am on privat.kalender_aenderungen (am);

-- Falsche Codes je Stunde und Absender (gegen Durchprobieren). Die Grenze für alle zusammen ist nur eine hohe Notbremse,
-- damit ein einzelner Störer mit vielen Adressen das Einrichten nicht für alle sperren kann.
create table privat.kalender_fehlversuche (
  stunde timestamptz not null,
  absender text not null,
  anzahl int not null default 0,
  primary key (stunde, absender)
);

alter table privat.kalender_personen enable row level security;
alter table privat.kalender_stand enable row level security;
alter table privat.kalender_protokoll enable row level security;
alter table privat.kalender_aenderungen enable row level security;
alter table privat.kalender_fehlversuche enable row level security;
revoke all on privat.kalender_personen, privat.kalender_stand, privat.kalender_protokoll, privat.kalender_aenderungen,
  privat.kalender_fehlversuche from public, anon, authenticated;

-- ---------- Zugriffsprüfung für die Termine ----------
-- Adresse freigeschaltet, Anmeldung (Sitzung) besteht noch, und das Konto ist das der Person selbst
-- (bzw. das Team-Konto), nicht ein später angelegtes Konto mit derselben Adresse.
create or replace function privat.kalender_berechtigt()
returns boolean
language sql stable security definer set search_path = ''
as $$
  with j as (select lower(coalesce((select auth.jwt() ->> 'email'), '')) as email,
                    coalesce((select auth.jwt() ->> 'sub'), '') as sub,
                    coalesce((select auth.jwt() ->> 'session_id'), '') as sid)
  select exists (select 1 from j join public.kalender_zugang z on lower(z.email) = j.email)
     and exists (select 1 from j join auth.sessions s on s.id::text = j.sid and s.user_id::text = j.sub)
     and exists (select 1 from j where
                   exists (select 1 from privat.kalender_personen p where p.email = j.email and p.user_id::text = j.sub)
                   or (j.email = 'kalender@wattcon-installation.de'
                       and exists (select 1 from auth.users u where u.id::text = j.sub and lower(u.email) = j.email)));
$$;

-- Hash eines Einmal-Codes (Codes sind zufällig, 10 Zeichen aus 31)
create function privat.kalender_code_hash(p_code text)
returns text language sql immutable set search_path = ''
as $$ select encode(extensions.digest('kalender-code:' || upper(p_code), 'sha256'), 'hex'); $$;

-- Darf das Team-Konto noch verwalten? Nur zum Start, bis die erste Person mit eigenem Passwort verwalten darf; danach nie wieder.
create function privat.kalender_team_verwaltet()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.kalender_zugang z where z.email = 'kalender@wattcon-installation.de')
     and (select s.team_verwaltung_bis from privat.kalender_stand s) is null
     and not exists (select 1 from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email
                     where p.admin and p.user_id is not null);
$$;

-- Das Team-Konto verwaltet nur in der Team-Phase. Jede Verwaltungs-Aktion prüft das im selben Aufruf noch einmal;
-- die Sperre auf dem Stand ordnet sie gegen das gleichzeitige Ende der Team-Phase (dann gilt ein eben erzeugter Verwalter-Code nicht).
create function privat.kalender_team_darf(p_wer text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if lower(coalesce(p_wer, '')) <> 'kalender@wattcon-installation.de' then return; end if;
  perform 1 from privat.kalender_stand for share;
  if not privat.kalender_team_verwaltet() then
    raise exception 'Team-Zugang verwaltet nicht mehr' using errcode = '42501';
  end if;
end $$;

-- Sobald eine eingerichtete Person verwalten darf, endet die Team-Verwaltung für immer.
-- Codes, die das Team für künftige Verwalter erzeugt hat, gelten dann nicht mehr; die vergibt jetzt ein Verwalter mit eigenem Zugang.
create function privat.kalender_team_phase_pruefen()
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_bis timestamptz; n int;
begin
  select team_verwaltung_bis into v_bis from privat.kalender_stand for update;
  if v_bis is not null or not exists (select 1 from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email
                                      where p.admin and p.user_id is not null) then
    return;
  end if;
  update privat.kalender_stand set team_verwaltung_bis = now();
  update privat.kalender_personen set code_hash = null, code_bis = null
   where admin and code_vom_team and code_hash is not null;
  get diagnostics n = row_count;
  insert into privat.kalender_protokoll (wer, aktion, person)
  values ('System', 'Team-Zugang verwaltet nicht mehr' || case when n > 0 then format(' (%s Verwalter-Code(s) ungültig)', n) else '' end, null);
end $$;

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

-- Änderungsprotokoll lesen: nur eingerichtete Personen mit Verwalter-Recht, nicht das Team-Konto
create function privat.kalender_darf_protokoll()
returns boolean language sql stable security definer set search_path = ''
as $$
  select privat.kalender_berechtigt() and exists (
    select 1 from privat.kalender_personen p
    where p.email = lower(coalesce(auth.jwt() ->> 'email', '')) and p.user_id::text = coalesce(auth.jwt() ->> 'sub', '') and p.admin);
$$;

-- Neueste zuerst, seitenweise: weiter ab (am, k) des letzten Eintrags. null heißt „keine Rechte“.
create function public.kalender_protokoll(p_vor_am timestamptz default null, p_vor_k text default null, p_anzahl int default 100)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privat.kalender_darf_protokoll() then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('am', x.am, 'k', x.k, 'wer', x.wer, 'aktion', x.aktion, 'art', x.art, 'person', x.person,
                                        'termin', x.termin, 'vorher', x.vorher, 'nachher', x.nachher) order by x.am desc, x.k desc)
    from (
      select u.* from (
        select a.am, 't' || lpad(a.id::text, 19, '0') as k, a.wer, a.aktion, 'termin' as art, null::text as person, a.termin, a.vorher, a.nachher
        from privat.kalender_aenderungen a
        union all
        select p.am, 'z' || lpad(p.id::text, 19, '0'), p.wer, p.aktion, 'zugang', p.person, null, null, null
        from privat.kalender_protokoll p
      ) u
      where p_vor_am is null or (u.am, u.k) < (p_vor_am, coalesce(p_vor_k, ''))
      order by u.am desc, u.k desc
      limit least(greatest(coalesce(p_anzahl, 100), 1), 500)
    ) x), '[]'::jsonb);
end $$;

-- ---------- Änderungen an Terminen mitschreiben ----------
create function privat.kalender_termine_merken()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_alt jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'created_by' - 'created_at' - 'updated_at' end;
  v_neu jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'created_by' - 'created_at' - 'updated_at' end;
begin
  if tg_op = 'UPDATE' and v_alt = v_neu then return null; end if;
  insert into privat.kalender_aenderungen (wer, aktion, termin, vorher, nachher)
  values (case when v_mail = '' then 'Datenbank' else privat.kalender_wer(v_mail) end,
          case tg_op when 'INSERT' then 'angelegt' when 'UPDATE' then 'geändert' else 'gelöscht' end,
          case when tg_op = 'DELETE' then old.id else new.id end, v_alt, v_neu);
  -- Aufbewahrung: zwölf Monate
  delete from privat.kalender_aenderungen where am < now() - interval '12 months';
  delete from privat.kalender_protokoll where am < now() - interval '12 months';
  return null;
end $$;
create trigger kalender_termine_merken after insert or update or delete on public.kalender_termine
  for each row execute function privat.kalender_termine_merken();

-- ---------- nur für die Server-Funktion kalender-zugang (Rolle service_role) ----------
create function privat.kalender_neuer_code()
returns text language sql volatile set search_path = ''
as $$
  -- 10 Zeichen ohne leicht verwechselbare (0/O, 1/I/L)
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select extensions.gen_random_bytes(10) as b) r, generate_series(0, 9) i;
$$;

-- Freien Code erzeugen und für die Person speichern (7 Tage gültig)
create function privat.kalender_code_setzen(p_person uuid, p_team boolean)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_code text; v_bis timestamptz := now() + interval '7 days';
begin
  loop
    v_code := privat.kalender_neuer_code();
    exit when not exists (select 1 from privat.kalender_personen where code_hash = privat.kalender_code_hash(v_code));
  end loop;
  update privat.kalender_personen set code_hash = privat.kalender_code_hash(v_code), code_bis = v_bis, code_vom_team = coalesce(p_team, false)
  where id = p_person;
  return jsonb_build_object('id', p_person, 'code', v_code, 'bis', v_bis);
end $$;

create function privat.kalender_wer(p_email text)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.name from privat.kalender_personen p where p.email = lower(p_email)),
                  case when lower(p_email) = 'kalender@wattcon-installation.de' then 'Team-Zugang'
                       when p_email like '%@%' then lower(p_email) else p_email end);
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

-- Darf dieses Konto Personen verwalten? Eingerichtete Person mit Verwalter-Recht (genau dieses Konto), oder zum Start der Team-Zugang
create function public.kalender_z_admin(p_email text, p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when lower(p_email) = 'kalender@wattcon-installation.de'
    then privat.kalender_team_verwaltet() and exists (select 1 from auth.users u where u.id = p_user and lower(u.email) = lower(p_email))
    else exists (select 1 from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email
                 where p.email = lower(p_email) and p.admin and p.user_id = p_user) end;
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
                       when p.user_id is null then 'neu'
                       else 'gesperrt' end,
        'code_bis', case when p.code_hash is not null then p.code_bis end,
        'team_code', p.code_vom_team and p.code_hash is not null and p.code_bis > now(),
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
  perform privat.kalender_team_darf(p_wer);
  insert into privat.kalender_personen (name, email, admin)
  values (btrim(p_name), 'p-' || encode(extensions.gen_random_bytes(6), 'hex') || '@kalender.wattcon-installation.de', coalesce(p_admin, false))
  returning id into v_id;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'angelegt' || case when p_admin then ' (Verwalter)' else '' end, btrim(p_name));
  return privat.kalender_code_setzen(v_id, lower(p_wer) = 'kalender@wattcon-installation.de');
end $$;

-- Neuer Code: der Zugang endet sofort (auch laufende Anmeldungen); mit dem Code legt die Person ein neues Passwort fest.
-- Gibt das Anmeldekonto mit zurück, damit die Server-Funktion es bis zum Einrichten sperren kann.
create function public.kalender_z_neuer_code(p_person uuid, p_wer text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen; v_user uuid := privat.kalender_konto(p_person);
begin
  perform privat.kalender_team_darf(p_wer);
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found then return null; end if;
  delete from public.kalender_zugang where email = p.email;
  if v_user is not null then perform privat.kalender_sitzungen_beenden(v_user); end if;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'neuer Code', p.name);
  return privat.kalender_code_setzen(p_person, lower(p_wer) = 'kalender@wattcon-installation.de') || jsonb_build_object('user_id', v_user);
end $$;

create function public.kalender_z_sperren(p_person uuid, p_wer text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen; v_user uuid := privat.kalender_konto(p_person);
begin
  perform privat.kalender_team_darf(p_wer);
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

-- Entfernen: Person weg, Zugang weg; ihre Termine bleiben. Die Server-Funktion sperrt vorher und löscht das Anmeldekonto.
create function public.kalender_z_entfernen(p_person uuid, p_wer text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen;
begin
  perform privat.kalender_team_darf(p_wer);
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
  perform privat.kalender_team_darf(p_wer);
  update privat.kalender_personen set admin = coalesce(p_admin, false) where id = p_person returning name into v_name;
  if v_name is null then return false; end if;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), case when p_admin then 'darf verwalten' else 'darf nicht mehr verwalten' end, v_name);
  perform privat.kalender_team_phase_pruefen();
  -- Nach der Team-Phase wird kein Code aus der Team-Phase zum Verwalter-Code
  if p_admin and (select s.team_verwaltung_bis from privat.kalender_stand s) is not null then
    update privat.kalender_personen set code_hash = null, code_bis = null where id = p_person and code_vom_team and code_hash is not null;
    if found then
      insert into privat.kalender_protokoll (wer, aktion, person) values ('System', 'Code aus der Team-Phase ungültig (darf jetzt verwalten)', v_name);
    end if;
  end if;
  return true;
end $$;

-- Umbenennen, z. B. um einen vorbereiteten Zugang („User 1“) einer Person zu geben
create function public.kalender_z_umbenennen(p_person uuid, p_name text, p_wer text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare v_alt text;
begin
  perform privat.kalender_team_darf(p_wer);
  select name into v_alt from privat.kalender_personen where id = p_person for update;
  if not found then return false; end if;
  if v_alt = btrim(p_name) then return true; end if;
  update privat.kalender_personen set name = btrim(p_name) where id = p_person;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'umbenannt (vorher ' || v_alt || ')', btrim(p_name));
  return true;
end $$;

-- Code prüfen, ohne ihn zu verbrauchen. Die Person wird allein über den Code gefunden.
-- Höchstens 20 falsche Codes je Absender pro Stunde (ohne erkennbaren Absender gilt nur die Grenze für alle) und als Notbremse
-- 50 000 insgesamt; danach wird bis zur nächsten Stunde gar nicht geprüft. Bei 31^10 möglichen Codes bleibt Raten auch so aussichtslos.
create function public.kalender_z_code_pruefen(p_code text, p_absender text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen; v_std timestamptz := date_trunc('hour', now());
  v_abs text := encode(extensions.digest((select s.salz from privat.kalender_stand s) || convert_to(coalesce(p_absender, ''), 'UTF8'), 'sha256'), 'hex');
begin
  if coalesce((select sum(f.anzahl) from privat.kalender_fehlversuche f where f.stunde = v_std), 0) >= 50000
     or (coalesce(p_absender, '') <> ''
         and coalesce((select f.anzahl from privat.kalender_fehlversuche f where f.stunde = v_std and f.absender = v_abs), 0) >= 20) then
    return jsonb_build_object('ok', false, 'fehler', 'zu_viele');
  end if;
  select * into p from privat.kalender_personen where code_hash = privat.kalender_code_hash(p_code);
  if not found then
    insert into privat.kalender_fehlversuche (stunde, absender, anzahl) values (v_std, v_abs, 1)
      on conflict (stunde, absender) do update set anzahl = privat.kalender_fehlversuche.anzahl + 1;
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
  update privat.kalender_personen set user_id = p_user, eingerichtet_am = now(), code_hash = null, code_bis = null, code_vom_team = false
  where id = p_person;
  perform privat.kalender_sitzungen_beenden(p_user);
  insert into public.kalender_zugang (email) values (p.email) on conflict do nothing;
  insert into privat.kalender_protokoll (wer, aktion, person) values (p.name, 'eigenes Passwort festgelegt', p.name);
  perform privat.kalender_team_phase_pruefen();
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

-- Gemeinsames Team-Passwort abschalten; geht nur, wenn eine eingerichtete Person verwalten darf.
-- Codes, die mit dem Team-Passwort erzeugt wurden, gelten danach nicht mehr.
create function public.kalender_z_team_aus(p_wer text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare n int;
begin
  if privat.kalender_team_verwaltet() or not exists (select 1 from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email
                                                     where p.admin and p.user_id is not null) then
    return false;
  end if;
  delete from public.kalender_zugang where email = 'kalender@wattcon-installation.de';
  perform privat.kalender_sitzungen_beenden(u.id) from auth.users u where lower(u.email) = 'kalender@wattcon-installation.de';
  update privat.kalender_personen set code_hash = null, code_bis = null where code_vom_team and code_hash is not null;
  get diagnostics n = row_count;
  insert into privat.kalender_protokoll (wer, aktion, person)
  values (privat.kalender_wer(p_wer), 'Team-Passwort abgeschaltet' || case when n > 0 then format(' (%s Code(s) aus der Team-Phase ungültig)', n) else '' end, null);
  return true;
end $$;

-- Rechte: Namensliste für alle, „wer bin ich“ und Protokoll für Angemeldete, alles andere nur für die Server-Funktion
revoke all on function public.kalender_namen(), public.kalender_ich(), public.kalender_protokoll(timestamptz, text, int),
  privat.kalender_darf_protokoll(), privat.kalender_termine_merken(), privat.kalender_team_phase_pruefen(),
  privat.kalender_code_hash(text), privat.kalender_team_verwaltet(), privat.kalender_team_darf(text),
  privat.kalender_neuer_code(), privat.kalender_code_setzen(uuid, boolean), privat.kalender_wer(text), privat.kalender_sitzungen_beenden(uuid),
  privat.kalender_konto(uuid), public.kalender_z_admin(text, uuid), public.kalender_z_liste(), public.kalender_z_anlegen(text, boolean, text),
  public.kalender_z_neuer_code(uuid, text), public.kalender_z_sperren(uuid, text), public.kalender_z_konto(uuid),
  public.kalender_z_entfernen(uuid, text), public.kalender_z_admin_setzen(uuid, boolean, text), public.kalender_z_umbenennen(uuid, text, text),
  public.kalender_z_code_pruefen(text, text), public.kalender_z_neue_adresse(uuid), public.kalender_z_fertig(uuid, uuid, text),
  public.kalender_z_wie_team(text), public.kalender_z_team_aus(text) from public, anon, authenticated;
grant execute on function public.kalender_namen() to anon, authenticated;
grant execute on function public.kalender_ich(), public.kalender_protokoll(timestamptz, text, int) to authenticated;
grant execute on function public.kalender_z_admin(text, uuid), public.kalender_z_liste(), public.kalender_z_anlegen(text, boolean, text),
  public.kalender_z_neuer_code(uuid, text), public.kalender_z_sperren(uuid, text), public.kalender_z_konto(uuid),
  public.kalender_z_entfernen(uuid, text), public.kalender_z_admin_setzen(uuid, boolean, text), public.kalender_z_umbenennen(uuid, text, text),
  public.kalender_z_code_pruefen(text, text), public.kalender_z_neue_adresse(uuid), public.kalender_z_fertig(uuid, uuid, text),
  public.kalender_z_wie_team(text), public.kalender_z_team_aus(text) to service_role;
