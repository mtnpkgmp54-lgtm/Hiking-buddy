import { TRANSPORT_API, ZURICH_HB_NAME } from "./config.js";

let zurichHbIdPromise = null;

async function resolveZurichHbId() {
  if (!zurichHbIdPromise) {
    zurichHbIdPromise = fetch(`${TRANSPORT_API}/locations?query=${encodeURIComponent(ZURICH_HB_NAME)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Stationssuche fehlgeschlagen (Status ${res.status})`);
        return res.json();
      })
      .then((data) => {
        const station = (data.stations || []).find((s) => s.id) || null;
        if (!station) throw new Error("Zürich HB konnte nicht aufgelöst werden.");
        return station.id;
      });
  }
  return zurichHbIdPromise;
}

/** Nächstgelegene Haltestelle zu einer Koordinate (Startpunkt der Wanderung). */
export async function findNearestStation(lat, lon) {
  const url = `${TRANSPORT_API}/locations?x=${lat}&y=${lon}&type=station`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Haltestellensuche fehlgeschlagen (Status ${res.status})`);
  const data = await res.json();
  const stations = data.stations || [];
  return stations[0] || null;
}

/** Kürzeste Reisezeit in Minuten ab Zürich HB zu einer Zielstation an einem Datum. */
export async function getTravelMinutes(destStationId, dateISO, { time = "07:30" } = {}) {
  const fromId = await resolveZurichHbId();
  const url =
    `${TRANSPORT_API}/connections?from=${encodeURIComponent(fromId)}` +
    `&to=${encodeURIComponent(destStationId)}&date=${dateISO}&time=${time}&limit=4`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Verbindungssuche fehlgeschlagen (Status ${res.status})`);
  const data = await res.json();
  const connections = data.connections || [];

  let best = null;
  for (const c of connections) {
    const dep = c.from?.departureTimestamp
      ? c.from.departureTimestamp * 1000
      : Date.parse(c.from?.departure);
    const arr = c.to?.arrivalTimestamp ? c.to.arrivalTimestamp * 1000 : Date.parse(c.to?.arrival);
    if (!dep || !arr) continue;
    const minutes = Math.round((arr - dep) / 60000);
    if (minutes > 0 && (best === null || minutes < best)) best = minutes;
  }
  return best;
}
