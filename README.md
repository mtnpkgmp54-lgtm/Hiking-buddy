# Tageswanderungen & Klettersteige ab Zürich HB

Statische Web-App (kein Build-Schritt, kein Backend) mit Kartenansicht, die
Tageswanderungen und Via Ferratas vorschlägt, die

1. **gutes Wetter** haben (kein Gewitter, möglichst viel Sonne),
2. ab **Zürich HB in unter 2 Stunden** mit dem ÖV erreichbar sind,
3. an **einem Tag machbar** sind (Gehzeit ≤ ca. 6–7h),

und merkt sich, welche Touren du schon gemacht hast.

## Starten

Die App nutzt ES-Modules, daher per lokalem Server öffnen (nicht die Datei
direkt doppelklicken):

```sh
python3 -m http.server 8000
# dann im Browser: http://localhost:8000/
```

Oder mit einem beliebigen anderen statischen Server (z.B. `npx serve`) bzw.
auf GitHub Pages/Netlify/Vercel deployen.

## Datenquellen

- **Touren:** kuratierte Liste in `data/hikes.json` (26 Wanderungen + 2
  Klettersteige, manuell zusammengestellt), optional ergänzt/ersetzt durch
  echte Daten von der [MySwitzerland Open Data API](https://opendata.myswitzerland.io/)
  via `scripts/fetch-myswitzerland.mjs` (siehe unten).
- **Karte:** [swisstopo Geodienste](https://www.swisstopo.admin.ch/) (WMTS,
  kein Key nötig) als Basiskarte plus Wanderwege-Layer.
- **Wetter:** [Open-Meteo](https://open-meteo.com/), kein Key nötig -
  Sonnenstunden, Tageshöchsttemperatur, Gewitter-Erkennung über die
  WMO-Wettercodes 95/96/99.
- **Fahrplan:** [transport.opendata.ch](https://transport.opendata.ch/),
  kein Key nötig - nächstgelegene Haltestelle zum Startpunkt und Reisezeit
  ab Zürich HB.

Alle drei Live-APIs (swisstopo, Open-Meteo, transport.opendata.ch) unterstützen
CORS und werden direkt aus dem Browser aufgerufen, kein Proxy nötig.

## MySwitzerland-Daten abrufen (optional)

`data/hikes.json` ist von Hand kuratiert und funktioniert ohne weiteres Zutun.
Wer echte Tourendaten (inkl. Bildern) von MySwitzerland laden will:

1. Kostenlosen API-Key unter [developer.myswitzerland.io](https://developer.myswitzerland.io/) holen.
2. `MYSWITZERLAND_API_KEY=dein-key node scripts/fetch-myswitzerland.mjs` ausführen.
3. Das Skript merged die API-Ergebnisse in `data/hikes.json` (kuratierte
   Einträge bleiben als Fallback für Felder, die die API nicht liefert).

**Hinweis:** Das Skript wurde nicht gegen die echte API getestet (die
Entwicklungsumgebung, in der dieses Projekt gebaut wurde, hatte keinen
Netzwerkzugriff auf `opendata.myswitzerland.io`). Endpoint-Pfad, Auth-Header
und JSON-Feldpfade sind nach bestem Wissen geschätzt und im Skript mit
`TODO`-Kommentaren markiert - beim ersten Lauf mit `--debug` eine
Beispielantwort ansehen und bei Bedarf anpassen.

## Funktionsweise

1. `data/hikes.json` laden, Marker für jede Tour auf der Karte platzieren.
2. Für alle Touren einmalig die nächstgelegene Haltestelle + Reisezeit ab
   Zürich HB abfragen (bleibt über Datumswechsel hinweg gecacht, da sich
   Fahrpläne kaum ändern).
3. Für das gewählte Datum das Wetter aller Touren abfragen und einen
   Ampel-Score berechnen: 🟢 sonnig & trocken, 🟡 durchzogen, 🔴 Gewitter/Regen.
4. Marker einfärben, nach Typ (Wanderung/Klettersteig) und "bereits gemacht"
   filtern, per Klick Details anzeigen.
5. "🎲 Überrasch mich" wählt zufällig eine grün markierte, noch nicht
   gemachte, ÖV-tauglich erreichbare Tour aus.

## Gedächtnis-Funktion

Jede Tour lässt sich im Detail-Panel als "gemacht" markieren (mit Datum).
Der Status wird nur lokal im `localStorage` dieses Browsers gespeichert -
kein Konto, keine Cloud-Synchronisation. Als "gemacht" markierte Touren
werden auf der Karte ausgegraut und lassen sich über den Filter
"bereits gemachte ausblenden" komplett verstecken.

## Grenzen / bekannte Einschränkungen

- Gehzeiten sind grobe Schätzungen (SAC-Faustregel: 4 km/h + Aufstiegszeit
  bzw. Werte aus der kuratierten Liste), keine echte Tourenplanung.
- Reisezeit ab Zürich HB wird beim Laden einmal berechnet und danach nicht
  automatisch pro Datum neu abgefragt (Fahrpläne ändern sich kaum) - bei
  Bedarf Seite neu laden.
- Open-Meteo sagt nur ca. 16 Tage im Voraus vorher; das Datumsfeld ist
  entsprechend begrenzt.
- Die zwei Klettersteig-Einträge sind ein kleiner Startsatz zur
  Veranschaulichung, kein vollständiger Katalog.
