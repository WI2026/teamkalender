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
- Neue Personen legt eine Person mit Verwalter-Recht im Kalender unter „Team“ an. Dabei entsteht ein Einmal-Code (7 Tage gültig, nur einmal nutzbar). Damit legt die Person unter „Zum ersten Mal hier oder Passwort vergessen?“ ihr Passwort fest. Den Code nur persönlich weitergeben.
- Passwort vergessen: unter „Team“ bei der Person „Neuer Code“. Das alte Passwort ist damit sofort gesperrt.
- Das gemeinsame Team-Passwort verwaltet nur so lange, bis die erste Person mit Verwalter-Recht ihr eigenes Passwort hat. Wenn alle umgestellt sind, unter „Team“ abschalten.
- Mindestens zwei Personen sollten verwalten dürfen.

## Sicherheit
- Der öffentliche Schlüssel darf im Quelltext stehen. Ohne Anmeldung lässt die Datenbank (Row Level Security) weder Lesen noch Schreiben zu. Zugelassen sind nur Konten aus der Tabelle `kalender_zugang`, und nur solange ihre Anmeldung (Sitzung) besteht. Sperren, „Neuer Code“ und das Abschalten des Team-Passworts wirken dadurch sofort.
- Einmal-Codes stehen nur als Hash in der Datenbank. Nach 300 falschen Codes in einer Stunde nimmt die Seite für den Rest der Stunde keine Codes mehr an.
- Die Seite lädt nichts von fremden Servern (keine Google Fonts, keine CDNs) und erlaubt per Content-Security-Policy nur Verbindungen zum eigenen Supabase-Projekt.
- Eine Anmeldung gilt höchstens 30 Tage pro Gerät. „Abmelden“ meldet nur das eigene Gerät ab.
- Das PDF enthält Kundendaten und liegt ungeschützt auf dem Gerät. Nicht weitergeben, nach Gebrauch löschen.
- Gerät verloren: unter „Team“ die Person sperren oder ihr einen neuen Code geben.

## Notfall: niemand kann mehr verwalten
Wenn die einzige Person mit Verwalter-Recht ihr Passwort vergessen hat und das Team-Passwort abgeschaltet ist, im Supabase-Dashboard unter SQL Editor einen neuen Code erzeugen (Name anpassen):

```sql
select public.kalender_z_neuer_code(id, 'Notfall') from privat.kalender_personen where name = 'Vorname';
```

Die Antwort enthält den Code. Damit legt die Person auf der Anmeldeseite ein neues Passwort fest. Bis dahin hat ihr Konto keinen Zugang zum Kalender. Ein so erzeugter Code gehört wie jeder andere nicht in Chat oder E-Mail.
