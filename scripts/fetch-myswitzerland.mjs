#!/usr/bin/env node
// Holt Wanderungen & Klettersteige von der MySwitzerland Open Data API und
// schreibt sie normalisiert nach data/hikes.json (gemerged mit den manuell
// kuratierten Einträgen, die dort schon liegen, als Fallback für Lücken).
//
// WICHTIG: Diese Sandbox kann opendata.myswitzerland.io nicht erreichen
// (Netzwerk-Policy blockiert den Host), das Skript ist daher NICHT gegen die
// echte API getestet. Endpoint-Pfad, Auth-Header-Name und die JSON-Feldpfade
// unten (siehe TODO-Kommentare) sind meine beste Einschätzung nach der
// öffentlichen Doku-Struktur - bitte beim ersten echten Lauf mit `--debug`
// eine Beispielantwort ansehen und die markierten Stellen bei Bedarf
// anpassen.
//
// Aufruf:
//   MYSWITZERLAND_API_KEY=xxx node scripts/fetch-myswitzerland.mjs
//   MYSWITZERLAND_API_KEY=xxx node scripts/fetch-myswitzerland.mjs --debug

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HIKES_PATH = path.join(__dirname, "..", "data", "hikes.json");

const BASE_URL = "https://opendata.myswitzerland.io/v1";
// TODO: laut MySwitzerland-Dashboard verifizieren - manche Deployments
// erwarten "x-api-key", andere "Authorization: Bearer <key>".
const AUTH_HEADER_NAME = "x-api-key";
const PAGE_SIZE = 100;
const DEBUG = process.argv.includes("--debug");

// TODO: die exakten "subtrip"-Werte laut Swagger/OpenAPI-Doku prüfen.
const SUBTRIPS = [
  { subtrip: "hiking-trail", type: "wanderung" },
  { subtrip: "via-ferrata", type: "via_ferrata" },
];

function requireApiKey() {
  const key = process.env.MYSWITZERLAND_API_KEY;
  if (!key) {
    console.error(
      "Fehlt: Umgebungsvariable MYSWITZERLAND_API_KEY. " +
        "Setz sie z.B. mit `export MYSWITZERLAND_API_KEY=dein-key` und starte das Skript erneut."
    );
    process.exit(1);
  }
  return key;
}

async function fetchTours(apiKey, subtrip) {
  const results = [];
  let offset = 0;

  for (;;) {
    const url = `${BASE_URL}/tours?subtrip=${encodeURIComponent(subtrip)}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: { [AUTH_HEADER_NAME]: apiKey } });
    if (!res.ok) {
      throw new Error(`MySwitzerland-Anfrage fehlgeschlagen für "${subtrip}" (Status ${res.status})`);
    }
    const body = await res.json();
    if (DEBUG && offset === 0) {
      console.log(`--- Beispielantwort für subtrip=${subtrip} ---`);
      console.log(JSON.stringify(body, null, 2).slice(0, 2000));
    }

    // TODO: Pfad zur Ergebnisliste prüfen - viele MySwitzerland-Endpunkte
    // liefern GeoJSON-FeatureCollections ({ features: [...] }), manche ein
    // einfaches { data: [...] }. Wir versuchen beides.
    const items = body.features || body.data || [];
    results.push(...items);

    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}

function firstCoordinate(feature) {
  // GeoJSON: Point -> [lon, lat]; LineString/MultiLineString -> erster Punkt
  const geom = feature.geometry;
  if (!geom) return null;
  if (geom.type === "Point") return { lon: geom.coordinates[0], lat: geom.coordinates[1] };
  if (geom.type === "LineString") return { lon: geom.coordinates[0][0], lat: geom.coordinates[0][1] };
  if (geom.type === "MultiLineString") {
    return { lon: geom.coordinates[0][0][0], lat: geom.coordinates[0][0][1] };
  }
  return null;
}

function lastCoordinate(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  if (geom.type === "Point") return { lon: geom.coordinates[0], lat: geom.coordinates[1] };
  if (geom.type === "LineString") {
    const c = geom.coordinates.at(-1);
    return { lon: c[0], lat: c[1] };
  }
  if (geom.type === "MultiLineString") {
    const line = geom.coordinates.at(-1);
    const c = line.at(-1);
    return { lon: c[0], lat: c[1] };
  }
  return null;
}

function normalize(feature, type) {
  // TODO: Feldpfade gegen echte Antwort verifizieren.
  const props = feature.properties || {};
  const start = firstCoordinate(feature);
  const end = lastCoordinate(feature) || start;
  if (!start) return null;

  return {
    id: `msw-${feature.id ?? props.id}`,
    name: props.name?.de || props.title?.de || props.name || "Unbenannte Tour",
    start: { name: props.startLocation?.de || props.name?.de || "Startpunkt", lat: start.lat, lon: start.lon },
    end: { name: props.endLocation?.de || props.name?.de || "Endpunkt", lat: end.lat, lon: end.lon },
    durationHours: props.duration ?? props.durationHours ?? null,
    distanceKm: props.distance ? Math.round((props.distance / 1000) * 10) / 10 : (props.distanceKm ?? null),
    ascentM: props.ascent ?? props.elevationGain ?? null,
    descentM: props.descent ?? props.elevationLoss ?? null,
    type,
    imageUrl: props.images?.[0]?.url ?? props.image ?? null,
    // Rücklink zur Originalseite ist laut MySwitzerland-Lizenzbedingungen Pflicht,
    // wenn Daten dieser API angezeigt werden - unbedingt beim ersten echten Lauf
    // verifizieren, welches Feld die volle Detailseiten-URL enthält.
    sourceUrl: props.mainDetail?.url ?? props.detailPageUrl ?? props.url ?? null,
  };
}

async function loadCurated() {
  const raw = await readFile(HIKES_PATH, "utf8");
  return JSON.parse(raw);
}

function mergeById(apiHikes, curatedHikes) {
  const byId = new Map();
  // Kuratierte Liste zuerst - dient als Fallback für unvollständige API-Einträge.
  for (const hike of curatedHikes) byId.set(hike.id, hike);
  for (const hike of apiHikes) {
    if (!hike) continue;
    const existing = byId.get(hike.id);
    byId.set(hike.id, existing ? { ...existing, ...compact(hike) } : hike);
  }
  return [...byId.values()];
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}

async function main() {
  const apiKey = requireApiKey();
  const curated = await loadCurated();

  const apiHikes = [];
  for (const { subtrip, type } of SUBTRIPS) {
    console.log(`Lade Touren für subtrip="${subtrip}"...`);
    const features = await fetchTours(apiKey, subtrip);
    console.log(`  ${features.length} Einträge erhalten.`);
    for (const feature of features) {
      const normalized = normalize(feature, type);
      if (normalized) apiHikes.push(normalized);
    }
  }

  const merged = mergeById(apiHikes, curated);
  await writeFile(HIKES_PATH, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Fertig: ${merged.length} Touren in ${HIKES_PATH} gespeichert.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
