# Wattcon Teamkalender

Gemeinsamer, passwortgeschützter Terminkalender. Statische Seite (GitHub Pages), Termine liegen in Supabase (Region Frankfurt).

- `index.html` – die App
- `config.js` – Supabase-Adresse, öffentlicher Schlüssel und Login-Adresse des Team-Kontos

Der öffentliche Schlüssel darf im Quelltext stehen: Ohne Anmeldung mit dem Team-Passwort lässt die Datenbank (Row Level Security) weder Lesen noch Schreiben zu.
