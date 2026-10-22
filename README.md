# PentaWerk Teamkalender

Gemeinsamer, passwortgeschützter Terminkalender. Statische Seite auf GitHub Pages, Termine in Supabase (Region Frankfurt).

## Dateien
- `index.html`, `style.css`, `app.js` – die App
- `pdf.js` – erzeugt im Browser das PDF „Termine ab diesem Monat“ zum Nachsehen ohne Internet (nichts verlässt das Gerät)
- `supabase/migrations/` – Datenbank-Änderungen (persönliche Zugänge), `supabase/functions/kalender-zugang/` – Server-Funktion für Einmal-Codes und Verwaltung, `supabase/config.toml` – Einstellungen dazu
- `bg-szene.js` – Hintergrund „Wallbox am Abend“: ein echtes Foto, in dem sich nur wenig ruhig bewegt (Wolken ziehen, Sterne funkeln, der Ring der Wallbox leuchtet wie beim Laden, die nasse Einfahrt schimmert). Ein kleiner WebGL-Shader, ohne WebGL steht das Foto still.
- `bg/` – Foto im Quer- und Hochformat (Handy) mit je einer Maske, welche Stellen sich bewegen
- `bg.js` – Rahmen für den Hintergrund: Bildrate, Pause im Hintergrund-Tab, „Bewegung reduzieren“, Dunkelmodus; scheitert die Szene, bleibt der Farbverlauf stehen
- `mark.svg`, `wordmark.svg`, `icon.svg`, `*.png` – PentaWerk-Zeichen und Schriftzug (PentaWerk ist eine Marke der Wattcon Installation UG)
- `config.js` – Supabase-Adresse, öffentlicher Schlüssel und Login-Adresse des Team-Kontos
- `vendor/` – mitgelieferte Bibliotheken (supabase-js 2.45.4), damit keine fremden Server eingebunden werden

## Anmeldung
- Jede Person meldet sich mit ihrem Namen und eigenem Passwort an. Auf der Anmeldeseite stehen nur Personen, die schon ein eigenes Passwort haben.
- Neue Personen legt eine Person mit Verwalter-Recht im Kalender unter „Team“ an. Dabei entsteht ein Einmal-Code (10 Zeichen, 7 Tage gültig, nur einmal nutzbar). Damit legt die Person unter „Zum ersten Mal hier oder Passwort vergessen?“ ihr Passwort fest. Den Code nur der Person selbst geben, persönlich oder als Direktnachricht.
- Passwort vergessen: unter „Team“ bei der Person „Neuer Code“. Das alte Passwort ist damit sofort gesperrt.
- Vorbereitete Zugänge (z. B. „User 1“) unter „Team“ umbenennen, wenn sie jemand bekommt. Hatte schon jemand anderes ein Passwort dafür, danach „Neuer Code“.
- Start: mit dem gemeinsamen Team-Passwort anmelden, unter „Team“ beim eigenen Namen „Verwalten an“ und „Code erzeugen“ (fehlt der Name: unten anlegen, mit Häkchen „darf das Team verwalten“), dann mit dem Code das eigene Passwort festlegen. Ist das Häkchen vergessen worden, gibt das Team-Passwort dem eigenen Namen einmal „Verwalten an“. Ab da verwaltet das Team-Passwort nie wieder, auch nicht, wenn der Verwalter später einen neuen Code braucht. Codes, die das Team-Passwort für weitere Verwalter erzeugt hat, gelten dann nicht mehr.
- Danach die Codes für alle anderen erzeugen und das Team-Passwort unter „Team“ abschalten. Offene Codes, die noch mit dem Team-Passwort erzeugt wurden, werden dabei ungültig.

## Änderungsprotokoll
- Jede Änderung an Terminen (angelegt, geändert, gelöscht) speichert die Datenbank mit Zeit, angemeldeter Person und den Werten vorher und nachher, dazu alle Änderungen an Zugängen. Bei gelöschten Terminen zeigt das Protokoll den ganzen Termin mit Zeit und Notiz, damit man ihn wieder eintragen kann. Das Feld „Eingetragen von“ kann man frei ausfüllen, das Protokoll nennt immer die wirklich angemeldete Person.
- Lesen können es nur Personen mit Verwalter-Recht und eigenem Passwort (unter „Team“ → „Änderungsprotokoll“), auch als Tabelle (CSV für Excel). Das Team-Konto und alle anderen sehen es nicht.
- Einträge älter als zwölf Monate löscht die Datenbank selbst. Das Protokoll enthält Kundendaten; die Tabelle nach Gebrauch löschen.

## Sicherheit
- Der öffentliche Schlüssel darf im Quelltext stehen. Ohne Anmeldung lässt die Datenbank (Row Level Security) weder Lesen noch Schreiben zu. Zugelassen sind nur Konten aus der Tabelle `kalender_zugang`, und nur solange ihre Anmeldung (Sitzung) besteht. Sperren, „Neuer Code“ und das Abschalten des Team-Passworts wirken dadurch sofort.
- Zugang hat nur das Anmeldekonto der Person selbst (über seine Konto-ID), nicht ein später angelegtes Konto mit derselben Adresse.
- Einmal-Codes stehen nur als Hash in der Datenbank. Je Absender (Internet-Adresse, bei IPv6 der Anschluss) nimmt die Seite höchstens 20 falsche Codes pro Stunde an, danach erst wieder in der nächsten Stunde. Als Notbremse gilt eine Grenze von 50 000 für alle zusammen; bei rund 800 Billionen möglichen Codes bleibt Raten trotzdem aussichtslos. Vom Absender wird nur ein Hash gespeichert, zwei Tage lang.
- Passwörter brauchen mindestens 10 Zeichen und dürfen nicht nur aus Name (auch ohne Umlaute geschrieben, z. B. „Huseyin“), Firma oder Seitenname mit Zahlen bestehen. Bekommt jemand einen umbenannten Zugang (z. B. „User 1“), erst umbenennen, dann den Code erzeugen.
- Die Seite lädt nichts von fremden Servern (keine Google Fonts, keine CDNs) und erlaubt per Content-Security-Policy nur Verbindungen zum eigenen Supabase-Projekt.
- Eine Anmeldung gilt höchstens 30 Tage pro Gerät. „Abmelden“ meldet nur das eigene Gerät ab.
- Das PDF enthält Kundendaten und liegt ungeschützt auf dem Gerät. Nicht weitergeben, nach Gebrauch löschen.
- Gerät verloren: unter „Team“ die Person sperren oder ihr einen neuen Code geben.

## Notfall: niemand kann mehr verwalten
Wenn die einzige Person mit Verwalter-Recht ihr Passwort vergessen hat, hilft das Team-Passwort nicht mehr (auch wenn es noch an ist). Dann im Supabase-Dashboard unter SQL Editor einen neuen Code erzeugen (Name anpassen):

```sql
select public.kalender_z_neuer_code(id, 'Notfall') from privat.kalender_personen where name = 'Vorname';
```

Die Antwort enthält den Code. Damit legt die Person auf der Anmeldeseite ein neues Passwort fest. Bis dahin hat ihr Konto keinen Zugang zum Kalender. Ein so erzeugter Code gehört nicht in einen Gruppenchat oder eine E-Mail. Das Team-Passwort bekommt dadurch keine Verwalter-Rechte zurück.

Hat jemand ein eigenes Passwort, aber niemand mehr das Verwalter-Recht:

```sql
select public.kalender_z_admin_setzen(id, true, 'Notfall') from privat.kalender_personen where name = 'Vorname';
```
