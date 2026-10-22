-- Persönliche Zugänge zum Teamkalender: jede Person meldet sich mit Namen und eigenem Passwort an.
-- Das erste Passwort legt sie mit einem Einmal-Code fest, den ein Verwalter im Kalender erzeugt.
-- Nur Ergänzungen: Termine (public.kalender_termine), ihre Regeln und der bisherige Team-Zugang bleiben unverändert.

create table privat.kalender_personen (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'),
  -- Anmeldeadresse ohne Postfach; der Kalender verschickt keine E-Mails
  email text not null unique check (email ~ '^p-[0-9a-f]{12}@kalender\.wattcon-installation\.de$'),
  user_id uuid unique,
  admin boolean not null default false,
  code_hash text,
  code_salt text,
  code_bis timestamptz,
  code_fehlversuche int not null default 0,
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

alter table privat.kalender_personen enable row level security;
alter table privat.kalender_protokoll enable row level security;
revoke all on privat.kalender_personen, privat.kalender_protokoll from public, anon, authenticated;

-- ---------- für die Anmeldeseite (ohne Anmeldung) ----------
-- Namen zur Auswahl: eingerichtete Personen und solche mit offenem Code; dazu der Team-Zugang, solange es ihn gibt.
create function public.kalender_namen()
returns table (id uuid, name text, email text, eingerichtet boolean, einrichtbar boolean, team boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.email,
         exists (select 1 from public.kalender_zugang z where z.email = p.email) and p.user_id is not null,
         p.code_hash is not null and p.code_bis > now() and p.code_fehlversuche < 5,
         false
  from privat.kalender_personen p
  where (p.code_hash is not null and p.code_bis > now() and p.code_fehlversuche < 5)
     or exists (select 1 from public.kalender_zugang z where z.email = p.email)
  union all
  select null, 'Team-Zugang (gemeinsames Passwort)', z.email, true, false, true
  from public.kalender_zugang z where z.email = 'kalender@wattcon-installation.de'
  order by 6, 2;
$$;

-- ---------- nach der Anmeldung ----------
-- Wer bin ich? null, wenn das Konto keinen Kalender-Zugang hat
create function public.kalender_ich()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case
    when not privat.kalender_berechtigt() then null
    when lower(coalesce(auth.jwt() ->> 'email', '')) = 'kalender@wattcon-installation.de'
      then jsonb_build_object('name', null, 'admin', true, 'team', true)
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

create function privat.kalender_wer(p_email text)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.name from privat.kalender_personen p where p.email = lower(p_email)),
                  case when lower(p_email) = 'kalender@wattcon-installation.de' then 'Team-Zugang' else lower(p_email) end);
$$;

create function privat.kalender_sitzungen_beenden(p_user uuid)
returns void language sql security definer set search_path = ''
as $$ delete from auth.sessions where user_id = p_user; $$;

-- Darf dieses Konto Personen verwalten? Team-Zugang (solange aktiv) oder eingerichtete Person mit Verwalter-Recht
create function public.kalender_z_admin(p_email text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.kalender_zugang z where z.email = lower(p_email))
     and (lower(p_email) = 'kalender@wattcon-installation.de'
          or exists (select 1 from privat.kalender_personen p where p.email = lower(p_email) and p.admin and p.user_id is not null));
$$;

create function public.kalender_z_liste()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'personen', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'admin', p.admin, 'email', p.email,
        'status', case when exists (select 1 from public.kalender_zugang z where z.email = p.email) and p.user_id is not null then 'aktiv'
                       when p.code_hash is not null and p.code_bis > now() and p.code_fehlversuche < 5 then 'code'
                       else 'gesperrt' end,
        'code_bis', case when p.code_hash is not null then p.code_bis end,
        'eingerichtet_am', p.eingerichtet_am) order by lower(p.name))
      from privat.kalender_personen p), '[]'::jsonb),
    'team_aktiv', exists (select 1 from public.kalender_zugang z where z.email = 'kalender@wattcon-installation.de'));
$$;

create function public.kalender_z_anlegen(p_name text, p_admin boolean, p_wer text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_code text := privat.kalender_neuer_code(); v_salt text := encode(extensions.gen_random_bytes(16), 'hex'); v_id uuid; v_bis timestamptz := now() + interval '7 days';
begin
  insert into privat.kalender_personen (name, email, admin, code_hash, code_salt, code_bis)
  values (btrim(p_name), 'p-' || encode(extensions.gen_random_bytes(6), 'hex') || '@kalender.wattcon-installation.de', coalesce(p_admin, false),
          encode(extensions.digest(v_salt || v_code, 'sha256'), 'hex'), v_salt, v_bis)
  returning id into v_id;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'angelegt' || case when p_admin then ' (Verwalter)' else '' end, btrim(p_name));
  return jsonb_build_object('id', v_id, 'code', v_code, 'bis', v_bis);
end $$;

-- Neuer Code: das bisherige Passwort gilt ab sofort nicht mehr, offene Anmeldungen enden
create function public.kalender_z_neuer_code(p_person uuid, p_wer text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_code text := privat.kalender_neuer_code(); v_salt text := encode(extensions.gen_random_bytes(16), 'hex'); p privat.kalender_personen; v_bis timestamptz := now() + interval '7 days';
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found then return null; end if;
  delete from public.kalender_zugang where email = p.email;
  if p.user_id is not null then perform privat.kalender_sitzungen_beenden(p.user_id); end if;
  update privat.kalender_personen set code_hash = encode(extensions.digest(v_salt || v_code, 'sha256'), 'hex'), code_salt = v_salt,
    code_bis = v_bis, code_fehlversuche = 0 where id = p_person;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'neuer Code', p.name);
  return jsonb_build_object('id', p_person, 'code', v_code, 'bis', v_bis);
end $$;

create function public.kalender_z_sperren(p_person uuid, p_wer text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen;
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found then return false; end if;
  delete from public.kalender_zugang where email = p.email;
  if p.user_id is not null then perform privat.kalender_sitzungen_beenden(p.user_id); end if;
  update privat.kalender_personen set code_hash = null, code_salt = null, code_bis = null, code_fehlversuche = 0 where id = p_person;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'gesperrt', p.name);
  return true;
end $$;

-- Entfernen: Person und Anmeldung weg; ihre Termine bleiben. Gibt das Anmeldekonto zurück, das danach gelöscht wird.
create function public.kalender_z_entfernen(p_person uuid, p_wer text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen;
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found then return null; end if;
  delete from public.kalender_zugang where email = p.email;
  if p.user_id is not null then perform privat.kalender_sitzungen_beenden(p.user_id); end if;
  delete from privat.kalender_personen where id = p_person;
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'entfernt', p.name);
  return jsonb_build_object('user_id', p.user_id);
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

-- Code prüfen, ohne ihn zu verbrauchen. Nach 5 falschen Versuchen ist er ungültig.
create function public.kalender_z_code_pruefen(p_person uuid, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen;
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found or p.code_hash is null then return jsonb_build_object('ok', false, 'fehler', 'kein_code'); end if;
  if p.code_fehlversuche >= 5 then return jsonb_build_object('ok', false, 'fehler', 'gesperrt'); end if;
  if p.code_bis <= now() then return jsonb_build_object('ok', false, 'fehler', 'abgelaufen'); end if;
  if encode(extensions.digest(p.code_salt || upper(p_code), 'sha256'), 'hex') <> p.code_hash then
    update privat.kalender_personen set code_fehlversuche = code_fehlversuche + 1 where id = p_person;
    insert into privat.kalender_protokoll (wer, aktion, person) values ('Anmeldeseite', 'falscher Code', p.name);
    return jsonb_build_object('ok', false, 'fehler', case when p.code_fehlversuche + 1 >= 5 then 'gesperrt' else 'falsch' end);
  end if;
  return jsonb_build_object('ok', true, 'email', p.email, 'name', p.name,
    'user_id', coalesce(p.user_id, (select u.id from auth.users u where lower(u.email) = p.email)));
end $$;

-- Passwort ist gesetzt: Code erneut prüfen und verbrauchen, Zugang freischalten, alte Anmeldungen beenden.
-- Wurde der Code inzwischen gesperrt oder ersetzt, gibt es keinen Zugang.
create function public.kalender_z_fertig(p_person uuid, p_user uuid, p_code text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare p privat.kalender_personen;
begin
  select * into p from privat.kalender_personen where id = p_person for update;
  if not found or p.code_hash is null or p.code_bis <= now() or p.code_fehlversuche >= 5
     or encode(extensions.digest(p.code_salt || upper(p_code), 'sha256'), 'hex') <> p.code_hash then return false; end if;
  if not exists (select 1 from auth.users u where u.id = p_user and lower(u.email) = p.email) then return false; end if;
  update privat.kalender_personen set user_id = p_user, eingerichtet_am = now(), code_hash = null, code_salt = null, code_bis = null, code_fehlversuche = 0
  where id = p_person;
  perform privat.kalender_sitzungen_beenden(p_user);
  insert into public.kalender_zugang (email) values (p.email) on conflict do nothing;
  insert into privat.kalender_protokoll (wer, aktion, person) values (p.name, 'eigenes Passwort festgelegt', p.name);
  return true;
end $$;

-- Gemeinsames Team-Passwort abschalten; geht nur, wenn eine eingerichtete Person verwalten darf
create function public.kalender_z_team_aus(p_wer text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not exists (select 1 from privat.kalender_personen p join public.kalender_zugang z on z.email = p.email where p.admin and p.user_id is not null) then
    return false;
  end if;
  delete from public.kalender_zugang where email = 'kalender@wattcon-installation.de';
  perform privat.kalender_sitzungen_beenden(u.id) from auth.users u where lower(u.email) = 'kalender@wattcon-installation.de';
  insert into privat.kalender_protokoll (wer, aktion, person) values (privat.kalender_wer(p_wer), 'Team-Passwort abgeschaltet', null);
  return true;
end $$;

-- Rechte: Namensliste für alle, „wer bin ich“ für Angemeldete, alles andere nur für die Server-Funktion
revoke all on function public.kalender_namen(), public.kalender_ich(), privat.kalender_neuer_code(), privat.kalender_wer(text),
  privat.kalender_sitzungen_beenden(uuid), public.kalender_z_admin(text), public.kalender_z_liste(), public.kalender_z_anlegen(text, boolean, text),
  public.kalender_z_neuer_code(uuid, text), public.kalender_z_sperren(uuid, text), public.kalender_z_entfernen(uuid, text),
  public.kalender_z_admin_setzen(uuid, boolean, text), public.kalender_z_code_pruefen(uuid, text), public.kalender_z_fertig(uuid, uuid, text),
  public.kalender_z_team_aus(text) from public, anon, authenticated;
grant execute on function public.kalender_namen() to anon, authenticated;
grant execute on function public.kalender_ich() to authenticated;
grant execute on function public.kalender_z_admin(text), public.kalender_z_liste(), public.kalender_z_anlegen(text, boolean, text),
  public.kalender_z_neuer_code(uuid, text), public.kalender_z_sperren(uuid, text), public.kalender_z_entfernen(uuid, text),
  public.kalender_z_admin_setzen(uuid, boolean, text), public.kalender_z_code_pruefen(uuid, text), public.kalender_z_fertig(uuid, uuid, text),
  public.kalender_z_team_aus(text) to service_role;
