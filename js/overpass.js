import {
  OVERPASS_ENDPOINT,
  MIN_HIKE_KM,
  MAX_HIKE_KM,
  ROUTES_CACHE_KEY,
  ROUTES_CACHE_TTL_MS,
} from "./config.js";

// SchweizMobil-Wanderrouten werden in OSM i.d.R. als eine Relation pro
// Tagesetappe importiert (network=nwn/rwn/lwn, route=hiking) mit einem
// "distance"-Tag in km für genau diese Etappe. Das nutzen wir, um direkt
// tagestaugliche Abschnitte zu finden, statt mehrtägige Gesamtrouten.
function buildQuery(networks) {
  return `[out:json][timeout:90];
area["ISO3166-1"="CH"][admin_level=2]->.ch;
relation["route"="hiking"]["network"~"^(${networks.join("|")})$"]["distance"](area.ch);
out center tags;`;
}

async function runOverpassQuery(ql) {
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(ql),
  });
  if (!res.ok) {
    throw new Error(`Overpass-Anfrage fehlgeschlagen (Status ${res.status})`);
  }
  return res.json();
}

function parseDistanceKm(raw) {
  if (raw == null) return null;
  const num = parseFloat(String(raw).replace(",", ".").replace(/[^0-9.]/g, ""));
  if (!isFinite(num) || num <= 0) return null;
  // Manche Importe tragen Meter statt Kilometer ein.
  return num > 200 ? num / 1000 : num;
}

function parseNumber(raw) {
  if (raw == null) return null;
  const num = parseFloat(String(raw).replace(",", "."));
  return isFinite(num) ? num : null;
}

function elementsToRoutes(elements) {
  const routes = [];
  for (const el of elements) {
    if (el.type !== "relation" || !el.center) continue;
    const tags = el.tags || {};
    const distanceKm = parseDistanceKm(tags.distance);
    if (!distanceKm || distanceKm < MIN_HIKE_KM || distanceKm > MAX_HIKE_KM) continue;
    routes.push({
      id: el.id,
      name: tags.name || tags.ref || `Route ${el.id}`,
      ref: tags.ref || null,
      distanceKm: Math.round(distanceKm * 10) / 10,
      ascent: parseNumber(tags.ascent),
      descent: parseNumber(tags.descent),
      lat: el.center.lat,
      lon: el.center.lon,
    });
  }
  // Duplikate (gleicher Name+Startpunkt, mehrfach importiert) grob entfernen.
  const seen = new Set();
  return routes.filter((r) => {
    const key = `${r.name}|${r.lat.toFixed(2)}|${r.lon.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadCache() {
  try {
    const raw = localStorage.getItem(ROUTES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > ROUTES_CACHE_TTL_MS) return null;
    return parsed.routes;
  } catch {
    return null;
  }
}

function saveCache(routes) {
  try {
    localStorage.setItem(ROUTES_CACHE_KEY, JSON.stringify({ ts: Date.now(), routes }));
  } catch {
    // localStorage kann voll oder deaktiviert sein - dann halt ohne Cache.
  }
}

export async function fetchHikingRoutes({ forceRefresh = false, onStatus } = {}) {
  if (!forceRefresh) {
    const cached = loadCache();
    if (cached && cached.length) {
      onStatus?.(`${cached.length} Wanderrouten aus Zwischenspeicher geladen.`);
      return cached;
    }
  }

  onStatus?.("Lade nationale & regionale Wanderrouten von OpenStreetMap...");
  let json = await runOverpassQuery(buildQuery(["nwn", "rwn"]));
  let routes = elementsToRoutes(json.elements || []);

  if (routes.length < 15) {
    onStatus?.("Wenige Treffer - erweitere Suche auf lokale Routen...");
    json = await runOverpassQuery(buildQuery(["nwn", "rwn", "lwn"]));
    routes = elementsToRoutes(json.elements || []);
  }

  saveCache(routes);
  onStatus?.(`${routes.length} tagestaugliche Routen gefunden.`);
  return routes;
}
