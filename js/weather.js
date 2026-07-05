import { METEO_API, THUNDERSTORM_CODES } from "./config.js";

const CHUNK_SIZE = 120; // Open-Meteo erlaubt viele Koordinaten pro Call, URL-Länge begrenzt uns

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Holt für jede Route das Tageswetter am gewünschten Datum und liefert eine
 * Map routeId -> { sunshineHours, thunderstorm, tempMax, precipProb, weathercode }.
 */
export async function fetchWeatherBatch(routes, dateISO, { onStatus } = {}) {
  const result = new Map();
  const chunks = chunk(routes, CHUNK_SIZE);

  for (let i = 0; i < chunks.length; i++) {
    const group = chunks[i];
    onStatus?.(`Prüfe Wetter (${i * CHUNK_SIZE + group.length}/${routes.length})...`);

    const lats = group.map((r) => r.lat.toFixed(4)).join(",");
    const lons = group.map((r) => r.lon.toFixed(4)).join(",");
    const url =
      `${METEO_API}?latitude=${lats}&longitude=${lons}` +
      `&daily=weathercode,sunshine_duration,precipitation_probability_max,temperature_2m_max` +
      `&timezone=Europe%2FZurich&start_date=${dateISO}&end_date=${dateISO}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wetter-Anfrage fehlgeschlagen (Status ${res.status})`);
    const data = await res.json();

    // Bei mehreren Koordinaten liefert Open-Meteo ein Array in Eingabe-Reihenfolge,
    // bei genau einer Koordinate ein einzelnes Objekt.
    const entries = Array.isArray(data) ? data : [data];

    entries.forEach((entry, idx) => {
      const route = group[idx];
      if (!route || !entry?.daily) return;
      const code = entry.daily.weathercode?.[0];
      const sunshineSeconds = entry.daily.sunshine_duration?.[0] ?? 0;
      result.set(route.id, {
        weathercode: code,
        thunderstorm: THUNDERSTORM_CODES.includes(code),
        sunshineHours: Math.round((sunshineSeconds / 3600) * 10) / 10,
        precipProbability: entry.daily.precipitation_probability_max?.[0] ?? null,
        tempMax: entry.daily.temperature_2m_max?.[0] ?? null,
      });
    });
  }

  return result;
}
