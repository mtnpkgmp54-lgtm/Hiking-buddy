const HISTORY_KEY = "hiking-app:history:v1";

function load() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // localStorage voll/deaktiviert -> Verlauf geht in dieser Session halt verloren.
  }
}

export function entryKey(routeId, plannedDate) {
  return `${routeId}|${plannedDate}`;
}

export function getHistory() {
  return load().sort((a, b) => b.savedAt - a.savedAt);
}

export function findEntry(routeId, plannedDate) {
  return load().find((e) => e.routeId === routeId && e.plannedDate === plannedDate) || null;
}

export function addPlanned(route, plannedDate) {
  const list = load();
  if (list.some((e) => e.routeId === route.id && e.plannedDate === plannedDate)) {
    return list; // schon gemerkt
  }
  list.push({
    routeId: route.id,
    name: route.name,
    distanceKm: route.distanceKm,
    ascent: route.ascent,
    lat: route.lat,
    lon: route.lon,
    stationName: route.station?.name ?? null,
    travelMin: route.travelMin ?? null,
    sunshineHours: route.weather?.sunshineHours ?? null,
    plannedDate,
    status: "geplant",
    completedDate: null,
    savedAt: Date.now(),
  });
  save(list);
  return list;
}

export function markDone(routeId, plannedDate, completedDate) {
  const list = load();
  const entry = list.find((e) => e.routeId === routeId && e.plannedDate === plannedDate);
  if (entry) {
    entry.status = "gemacht";
    entry.completedDate = completedDate;
    save(list);
  }
  return list;
}

export function removeEntry(routeId, plannedDate) {
  const list = load().filter((e) => !(e.routeId === routeId && e.plannedDate === plannedDate));
  save(list);
  return list;
}
