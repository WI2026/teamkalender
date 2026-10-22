-- Projektfortschritt: unterschriebene Aufträge mit ihren Arbeitsschritten (Checkliste). Termine lassen sich einem Projekt zuordnen.
-- Nur Text und Häkchen, keine Dateien. Ein Projekt braucht mit seinen Schritten wenige KB.
-- Bestehende Termine bleiben unverändert: die Termintabelle bekommt nur die leere Spalte projekt_id dazu.
-- Rechte wie bei den Terminen: lesen und schreiben nur mit eigenem Zugang und bestehender Anmeldung (privat.kalender_berechtigt()).
-- Projekte und erledigte Schritte löschen nur Verwalter. Jede Änderung steht im Änderungsprotokoll.
-- Reihenfolge beim Einspielen: erst dieses SQL, dann die neue Seite veröffentlichen (die Seite fragt die neue Spalte ab).

-- Alles oder nichts: bricht etwas ab, bleibt die Datenbank, wie sie war
begin;
-- Nicht lange auf die Termintabelle warten, falls gerade jemand speichert; dann einfach noch einmal ausführen
set local lock_timeout = '5s';

-- ---------- Projekte ----------
create table public.kalender_projekte (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (char_length(titel) between 1 and 80),
  art text not null check (art in ('pv', 'speicher', 'wallbox', 'waermepumpe', 'zaehlerschrank', 'elektro', 'sonstiges')),
  -- Ohne Unterschrift kein Projekt. Die Obergrenze wächst mit dem Datum, ein einmal gültiger Wert bleibt gültig.
  unterschrieben_am date not null check (unterschrieben_am between date '2000-01-01' and current_date + 2),
  auftragsnr text check (char_length(auftragsnr) between 1 and 30),
  verantwortlich text check (char_length(verantwortlich) between 1 and 60),
  notiz text check (char_length(notiz) <= 1000),
  -- storniert: Auftrag widerrufen oder gekündigt (bleibt nachvollziehbar, zählt nicht mehr als laufend)
  status text not null default 'laufend' check (status in ('laufend', 'pausiert', 'abgeschlossen', 'storniert')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Schritte (eine Zeile je Schritt, damit zwei Leute gleichzeitig verschiedene Schritte abhaken können) ----------
create table public.kalender_projekt_schritte (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references public.kalender_projekte (id) on delete cascade,
  -- Reihenfolge. Ohne Angabe ans Ende; die Seite setzt neue Schritte zwischen zwei bestehende (z. B. vor die Schlussrechnung)
  pos numeric not null check (pos between 0 and 100000),
  titel text not null check (char_length(titel) between 1 and 80),
  erledigt boolean not null default false,
  -- Wann und von wem abgehakt: setzt nur die Datenbank (Trigger), nie die Seite
  erledigt_am timestamptz,
  erledigt_von text,
  updated_at timestamptz not null default now()
);
create index kalender_projekt_schritte_projekt on public.kalender_projekt_schritte (projekt_id, pos);

-- ---------- Termine: Zuordnung zu einem Projekt (neue, leere Spalte; vorhandene Termine bleiben, wie sie sind) ----------
alter table public.kalender_termine add column projekt_id uuid references public.kalender_projekte (id) on delete set null;
create index kalender_termine_projekt on public.kalender_termine (projekt_id) where projekt_id is not null;

-- ---------- Rechte ----------
-- Supabase gibt neuen Tabellen von sich aus alle Rechte für anon und authenticated; hier nur das Nötige.
-- Die Kennung eines neuen Projekts darf die Seite selbst wählen: so legt ein wiederholtes Speichern nach Funkloch kein zweites Projekt an.
revoke all on public.kalender_projekte, public.kalender_projekt_schritte from public, anon, authenticated;
grant select, delete on public.kalender_projekte to authenticated;
grant insert (id, titel, art, unterschrieben_am, auftragsnr, verantwortlich, notiz),
      update (titel, art, unterschrieben_am, auftragsnr, verantwortlich, notiz, status) on public.kalender_projekte to authenticated;
grant select, delete on public.kalender_projekt_schritte to authenticated;
grant insert (projekt_id, titel, pos), update (erledigt) on public.kalender_projekt_schritte to authenticated;

-- Verwalter mit eigenem Zugang und bestehender Anmeldung (wie beim Änderungsprotokoll). Für die Löschregeln,
-- die mit den Rechten der angemeldeten Person geprüft werden.
create function privat.kalender_ist_verwalter()
returns boolean language sql stable security definer set search_path = ''
as $$ select privat.kalender_darf_protokoll(); $$;

alter table public.kalender_projekte enable row level security;
alter table public.kalender_projekt_schritte enable row level security;
create policy "Team liest" on public.kalender_projekte for select to authenticated using ((select privat.kalender_berechtigt()));
create policy "Team legt an" on public.kalender_projekte for insert to authenticated with check ((select privat.kalender_berechtigt()));
create policy "Team ändert" on public.kalender_projekte for update to authenticated
  using ((select privat.kalender_berechtigt())) with check ((select privat.kalender_berechtigt()));
create policy "Verwalter löscht" on public.kalender_projekte for delete to authenticated using ((select privat.kalender_ist_verwalter()));
create policy "Team liest" on public.kalender_projekt_schritte for select to authenticated using ((select privat.kalender_berechtigt()));
create policy "Team legt an" on public.kalender_projekt_schritte for insert to authenticated with check ((select privat.kalender_berechtigt()));
create policy "Team ändert" on public.kalender_projekt_schritte for update to authenticated
  using ((select privat.kalender_berechtigt())) with check ((select privat.kalender_berechtigt()));
-- Offene Schritte streicht jeder; erledigte nur Verwalter (sonst ginge verloren, wer sie wann erledigt hat)
create policy "Team streicht offene" on public.kalender_projekt_schritte for delete to authenticated
  using ((select privat.kalender_berechtigt()) and (not erledigt or (select privat.kalender_ist_verwalter())));

-- ---------- Zeitstempel, Reihenfolge und „erledigt von“ ----------
create trigger kalender_projekte_zeitstempel before insert on public.kalender_projekte
  for each row execute function privat.kalender_zeitstempel();
-- Speichern ohne Änderung lässt den Zeitstempel stehen (sonst Konflikte bei anderen und falsche Sortierung)
create trigger kalender_projekte_zeitstempel_aendern before update on public.kalender_projekte
  for each row when (old.* is distinct from new.*) execute function privat.kalender_zeitstempel();

create function privat.kalender_schritt_vorher()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if tg_op = 'INSERT' then
    -- Ohne Position ans Ende des Projekts (sieht auch die Schritte, die dieselbe Anweisung schon angelegt hat)
    if new.pos is null then
      new.pos := least(coalesce((select floor(max(s.pos)) + 1 from public.kalender_projekt_schritte s where s.projekt_id = new.projekt_id), 0), 100000);
    end if;
    new.pos := trim_scale(round(new.pos, 9));
  elsif new.erledigt = old.erledigt and new.titel = old.titel and new.pos = old.pos and new.projekt_id = old.projekt_id then
    -- Nichts geändert: alles bleibt, wie es war
    new.erledigt_am := old.erledigt_am; new.erledigt_von := old.erledigt_von; new.updated_at := old.updated_at;
    return new;
  end if;
  if not new.erledigt then
    new.erledigt_am := null; new.erledigt_von := null;
  elsif tg_op = 'INSERT' or not old.erledigt then
    new.erledigt_am := pg_catalog.clock_timestamp();
    new.erledigt_von := case when v_mail = '' then 'Datenbank' else privat.kalender_wer(v_mail) end;
  else
    new.erledigt_am := old.erledigt_am; new.erledigt_von := old.erledigt_von;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end $$;
create trigger kalender_schritte_vorher before insert or update on public.kalender_projekt_schritte
  for each row execute function privat.kalender_schritt_vorher();

-- Höchstens 40 Schritte je Projekt. Läuft nach den Zugriffsregeln (wer keinen Zugang hat, erfährt hier nichts);
-- die Sperre auf dem Projekt ordnet gleichzeitiges Hinzufügen, gezählt wird danach mit frischem Stand.
create function privat.kalender_schritte_grenze()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.kalender_projekte p where p.id = new.projekt_id for no key update;
  if (select count(*) from public.kalender_projekt_schritte s where s.projekt_id = new.projekt_id) > 40 then
    raise exception 'Höchstens 40 Schritte je Projekt' using errcode = '23514', hint = 'schritte_max';
  end if;
  return null;
end $$;
create trigger kalender_schritte_grenze after insert on public.kalender_projekt_schritte
  for each row execute function privat.kalender_schritte_grenze();

-- ---------- Änderungsprotokoll ----------
-- Bisherige Einträge sind Termine; neu kommen Projekte und Schritte dazu. Die Spalte „termin“ hält die Kennung des jeweiligen Eintrags.
alter table privat.kalender_aenderungen add column art text not null default 'termin' check (art in ('termin', 'projekt', 'schritt'));

-- Projekte: Anlegen wird erst am Ende der Transaktion eingetragen (dann mit den Schritten aus der Vorlage),
-- Ändern sofort, Löschen vor dem Löschen (damit die Schritte noch da sind und mit ins Protokoll kommen).
create function privat.kalender_projekt_merken()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_alt jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'created_by' - 'created_at' - 'updated_at' end;
  v_neu jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'created_by' - 'created_at' - 'updated_at' end;
  v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_schritte jsonb;
begin
  if tg_op = 'UPDATE' and v_alt = v_neu then return null; end if;
  if tg_op <> 'UPDATE' then
    -- Beim Anlegen am Ende der Transaktion: gibt es das Projekt da schon nicht mehr, steht sein Löschen im Protokoll
    if tg_op = 'INSERT' and not exists (select 1 from public.kalender_projekte p where p.id = v_id) then return null; end if;
    v_schritte := coalesce((select jsonb_agg(jsonb_build_object('titel', s.titel, 'erledigt', s.erledigt) order by s.pos, s.id)
                            from public.kalender_projekt_schritte s where s.projekt_id = v_id), '[]'::jsonb);
    if tg_op = 'INSERT' then v_neu := v_neu || jsonb_build_object('schritte', v_schritte);
    else v_alt := v_alt || jsonb_build_object('schritte', v_schritte); end if;
  end if;
  insert into privat.kalender_aenderungen (wer, aktion, art, termin, vorher, nachher)
  values (case when v_mail = '' then 'Datenbank' else privat.kalender_wer(v_mail) end,
          case tg_op when 'INSERT' then 'angelegt' when 'UPDATE' then 'geändert' else 'gelöscht' end,
          'projekt', v_id, v_alt, v_neu);
  delete from privat.kalender_aenderungen where am < now() - interval '12 months';
  delete from privat.kalender_protokoll where am < now() - interval '12 months';
  return case when tg_op = 'DELETE' then old else null end;
end $$;
create constraint trigger kalender_projekte_merken_anlegen after insert on public.kalender_projekte
  deferrable initially deferred for each row execute function privat.kalender_projekt_merken();
create trigger kalender_projekte_merken after update on public.kalender_projekte
  for each row execute function privat.kalender_projekt_merken();
create trigger kalender_projekte_merken_loeschen before delete on public.kalender_projekte
  for each row execute function privat.kalender_projekt_merken();

create function privat.kalender_schritt_merken()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_alt jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' end;
  v_neu jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' end;
  v_projekt record;
begin
  if tg_op = 'UPDATE' and v_alt = v_neu then return null; end if;
  select p.titel, p.created_at into v_projekt from public.kalender_projekte p
   where p.id = case when tg_op = 'DELETE' then old.projekt_id else new.projekt_id end;
  -- Projekt wird gerade gelöscht: die Schritte stehen schon im Eintrag des Projekts
  if not found then return null; end if;
  -- Schritte aus der Vorlage beim Anlegen des Projekts (selbe Transaktion): stehen im Eintrag des Projekts
  if tg_op = 'INSERT' and v_projekt.created_at = now() then return null; end if;
  insert into privat.kalender_aenderungen (wer, aktion, art, termin, vorher, nachher)
  values (case when v_mail = '' then 'Datenbank' else privat.kalender_wer(v_mail) end,
          case tg_op when 'INSERT' then 'angelegt' when 'UPDATE' then 'geändert' else 'gelöscht' end,
          'schritt', case when tg_op = 'DELETE' then old.id else new.id end,
          v_alt || case when v_alt is null then null else jsonb_build_object('projekt', v_projekt.titel) end,
          v_neu || case when v_neu is null then null else jsonb_build_object('projekt', v_projekt.titel) end);
  delete from privat.kalender_aenderungen where am < now() - interval '12 months';
  return null;
end $$;
create trigger kalender_schritte_merken after insert or update or delete on public.kalender_projekt_schritte
  for each row execute function privat.kalender_schritt_merken();

-- Protokoll lesen: wie bisher, jetzt mit der Art des Eintrags (Termin, Projekt, Schritt)
create or replace function public.kalender_protokoll(p_vor_am timestamptz default null, p_vor_k text default null, p_anzahl int default 100)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privat.kalender_darf_protokoll() then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('am', x.am, 'k', x.k, 'wer', x.wer, 'aktion', x.aktion, 'art', x.art, 'person', x.person,
                                        'termin', x.termin, 'vorher', x.vorher, 'nachher', x.nachher) order by x.am desc, x.k desc)
    from (
      select u.* from (
        select a.am, 't' || lpad(a.id::text, 19, '0') as k, a.wer, a.aktion, a.art, null::text as person, a.termin, a.vorher, a.nachher
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

-- ---------- Projekt mit Schritten in einem Zug anlegen ----------
-- Läuft mit den Rechten der angemeldeten Person (security invoker): dieselben Regeln wie beim direkten Anlegen.
-- Die Kennung kommt von der Seite; ein zweiter Aufruf mit derselben Kennung scheitert, statt ein doppeltes Projekt anzulegen.
create function public.kalender_projekt_anlegen(p_id uuid, p_titel text, p_art text, p_unterschrieben_am date, p_auftragsnr text,
                                                p_verantwortlich text, p_notiz text, p_schritte text[])
returns uuid language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if coalesce(cardinality(p_schritte), 0) > 40 then
    raise exception 'Höchstens 40 Schritte je Projekt' using errcode = '23514', hint = 'schritte_max';
  end if;
  insert into public.kalender_projekte (id, titel, art, unterschrieben_am, auftragsnr, verantwortlich, notiz)
  values (coalesce(p_id, gen_random_uuid()), p_titel, p_art, p_unterschrieben_am, nullif(p_auftragsnr, ''), nullif(p_verantwortlich, ''), nullif(p_notiz, ''))
  returning id into p_id;
  insert into public.kalender_projekt_schritte (projekt_id, titel)
  select p_id, u.t from unnest(p_schritte) with ordinality as u (t, i) order by u.i;
  return p_id;
end $$;

-- Stand aller Projekte und Schritte in einer Zeile: ändert sich bei jedem Anlegen, Ändern und Löschen.
-- Nach dem Wiederverbinden lädt die Seite nur dann alles neu, wenn sich dieser Stand geändert hat (spart Datenvolumen).
create function public.kalender_projekt_stand()
returns text language sql stable security invoker set search_path = ''
as $$
  select concat_ws('|',
    (select count(*) || '/' || coalesce(max(p.updated_at)::text, '-') from public.kalender_projekte p),
    (select count(*) || '/' || coalesce(max(s.updated_at)::text, '-') from public.kalender_projekt_schritte s));
$$;

revoke all on function privat.kalender_ist_verwalter(), privat.kalender_schritt_vorher(), privat.kalender_schritte_grenze(),
  privat.kalender_projekt_merken(), privat.kalender_schritt_merken(),
  public.kalender_projekt_anlegen(uuid, text, text, date, text, text, text, text[]), public.kalender_projekt_stand() from public, anon, authenticated;
grant execute on function privat.kalender_ist_verwalter(), public.kalender_projekt_anlegen(uuid, text, text, date, text, text, text, text[]),
  public.kalender_projekt_stand() to authenticated;

-- ---------- Live-Aktualisierung ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kalender_projekte') then
    alter publication supabase_realtime add table public.kalender_projekte;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kalender_projekt_schritte') then
    alter publication supabase_realtime add table public.kalender_projekt_schritte;
  end if;
end $$;

-- Schnittstelle kennt die neuen Tabellen sofort
notify pgrst, 'reload schema';

commit;
