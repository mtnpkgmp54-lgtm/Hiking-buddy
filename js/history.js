const HISTORY_KEY = "hiking-app:done-v2";

function load() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(map) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(map));
  } catch {
    // localStorage voll/deaktiviert -> Status geht in dieser Session halt verloren.
  }
}

/** Map hikeId -> ISO-Datum, an dem die Tour gemacht wurde. */
export function getDoneMap() {
  return load();
}

export function isDone(hikeId) {
  return Boolean(load()[hikeId]);
}

export function getDoneDate(hikeId) {
  return load()[hikeId] || null;
}

export function markDone(hikeId, doneDateISO) {
  const map = load();
  map[hikeId] = doneDateISO;
  save(map);
  return map;
}

export function unmarkDone(hikeId) {
  const map = load();
  delete map[hikeId];
  save(map);
  return map;
}

export function exportDone() {
  return JSON.stringify(load(), null, 2);
}

export function importDone(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") throw new Error("Ungültiges Format.");
  save(parsed);
  return parsed;
}
