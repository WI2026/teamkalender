# Wattcon Teamkalender

Gemeinsamer, passwortgeschützter Terminkalender. Statische Seite auf GitHub Pages, Termine in Supabase (Region Frankfurt).

## Dateien
- `index.html`, `style.css`, `app.js` – die App
- `bg.js` – Hintergrund-Animation (three.js)
- `config.js` – Supabase-Adresse, öffentlicher Schlüssel und Login-Adresse des Team-Kontos
- `vendor/` – mitgelieferte Bibliotheken (supabase-js 2.45.4, three.js r128), damit keine fremden Server eingebunden werden

## Sicherheit
- Der öffentliche Schlüssel darf im Quelltext stehen. Ohne Anmeldung mit dem Team-Passwort lässt die Datenbank (Row Level Security) weder Lesen noch Schreiben zu; zugelassen sind nur Konten aus der Tabelle `kalender_zugang`.
- Die Seite lädt nichts von fremden Servern (keine Google Fonts, keine CDNs) und erlaubt per Content-Security-Policy nur Verbindungen zum eigenen Supabase-Projekt.
- Eine Anmeldung gilt höchstens 30 Tage pro Gerät. „Abmelden“ meldet nur das eigene Gerät ab.
- Gerät verloren oder Passwort weitergegeben: Passwort in Supabase unter Authentication → Users ändern.
