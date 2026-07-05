# Tageswanderungen ab Zürich HB

Statische Web-App (kein Build-Schritt, kein Backend), die Tageswanderungen
vorschlägt, die

1. **gutes Wetter** haben (kein Gewitter, möglichst viel Sonne),
2. ab **Zürich HB in unter 2 Stunden** mit dem ÖV erreichbar sind,
3. an **einem Tag machbar** sind.

## Starten

Die App nutzt ES-Modules, daher per lokalem Server öffnen (nicht die Datei
direkt doppelklicken):

```sh
python3 -m http.server 8000
# dann im Browser: http://localhost:8000/
```

Oder mit einem beliebigen anderen statischen Server (z.B. `npx serve`) bzw.
auf GitHub Pages/Netlify/Vercel deployen.

## Datenquellen (alle ohne API-Key)

- **Wanderrouten:** [OpenStreetMap](https://www.openstreetmap.org/copyright) via
  [Overpass API](https://overpass-api.de/). Es werden Wanderrouten-Relationen
  (`route=hiking`, `network=nwn/rwn/lwn`) mit einem `distance`-Tag gesucht —
  in der Schweiz wird i.d.R. pro Tagesetappe eine eigene Relation mit
  Distanz/Auf-/Abstieg importiert, wodurch sich Tagestouren direkt filtern lassen.
- **Wetter:** [Open-Meteo](https://open-meteo.com/) liefert pro Route
  Sonnenstunden, Tageshöchsttemperatur und den Wettercode; Gewitter werden
  über die WMO-Codes 95/96/99 erkannt.
- **Fahrplan:** [transport.opendata.ch](https://transport.opendata.ch/)
  (Swiss public transport API) ermittelt die nächstgelegene Haltestelle zum
  Wanderungs-Startpunkt und die Reisezeit ab Zürich HB.

## Funktionsweise

1. Wanderrouten von Overpass laden (24h im `localStorage` zwischengespeichert).
2. Routen nach plausibler Tagesdistanz (4–30 km, geschätzte Gehzeit ≤ 9h) filtern.
3. Wetter fürs gewählte Datum abfragen, Gewitter-Tage ausschliessen, nach
   Sonnenstunden sortieren.
4. Für die sonnigsten Kandidaten (bis zu 60) die ÖV-Reisezeit ab Zürich HB
   prüfen und alle über 2 Stunden verwerfen.
5. Die verbleibenden Treffer als Karten anzeigen (Distanz, Auf-/Abstieg,
   geschätzte Gehzeit, Sonnenstunden, Haltestelle, Reisezeit).

## Grenzen / bekannte Einschränkungen

- Start- und Wetterkoordinate ist der von Overpass berechnete Mittelpunkt
  (`center`) der Route, nicht zwingend der exakte Startpunkt.
- Gehzeiten sind eine grobe Schätzung (SAC-Faustregel: 4 km/h + Aufstiegszeit),
  keine echte Tourenplanung.
- Open-Meteo sagt nur ca. 16 Tage im Voraus vorher; das Datumsfeld ist
  entsprechend begrenzt.
- Alle drei APIs sind kostenlose Public-APIs ohne Autorisierung — bei hoher
  Nutzung können Rate-Limits greifen.
