import {
  MAX_TRAVEL_MINUTES,
  MAX_HIKE_HOURS,
  MAX_CANDIDATES_TO_CHECK,
  WANTED_RESULTS,
  TRANSIT_CONCURRENCY,
} from "./config.js";
import { fetchHikingRoutes } from "./overpass.js";
import { fetchWeatherBatch } from "./weather.js";
import { findNearestStation, getTravelMinutes } from "./transit.js";
import { getHistory, findEntry, addPlanned, markDone, removeEntry } from "./history.js";

const form = document.getElementById("search-form");
const dateInput = document.getElementById("date-input");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const summaryEl = document.getElementById("summary");
const searchBtn = document.getElementById("search-btn");
const historyEl = document.getElementById("history");

// Open-Meteo liefert Prognosen für ~16 Tage; wir begrenzen die Auswahl entsprechend.
function initDateInput() {
  const today = new Date();
  const max = new Date();
  max.setDate(max.getDate() + 15);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const toISO = (d) => d.toISOString().slice(0, 10);
  dateInput.min = toISO(today);
  dateInput.max = toISO(max);
  dateInput.value = toISO(tomorrow);
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

function estimateHikeHours(route) {
  // Grobe Schätzung nach SAC-Faustregel: 4 km/h in der Ebene + Aufstiegszeit.
  const base = route.distanceKm / 4;
  const ascentTime = (route.ascent || 0) / 350;
  return Math.round((base + ascentTime) * 10) / 10;
}

/** Einfacher Concurrency-Limiter, damit wir die öffentliche API nicht fluten. */
function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

let currentResultsById = new Map();

function planButtonHtml(route, dateISO) {
  const existing = findEntry(route.id, dateISO);
  return existing
    ? `<button type="button" class="plan-btn" disabled>📌 gemerkt</button>`
    : `<button type="button" class="plan-btn">📌 Für ${dateISO} merken</button>`;
}

function renderResults(results, dateISO, checkedCount, totalCandidates) {
  resultsEl.innerHTML = "";
  currentResultsById = new Map(results.map((r) => [r.id, r]));

  if (!results.length) {
    summaryEl.textContent =
      `Keine passende Wanderung gefunden (${checkedCount} von ${totalCandidates} ` +
      `sonnigen, gewitterfreien Routen auf ÖV-Erreichbarkeit geprüft). ` +
      `Versuch es mit einem anderen Datum.`;
    return;
  }

  summaryEl.textContent =
    `${results.length} Wanderungen für ${dateISO}: gutes Wetter, unter ` +
    `${MAX_TRAVEL_MINUTES} Min. ab Zürich HB erreichbar, an einem Tag machbar ` +
    `(${checkedCount} von ${totalCandidates} Kandidaten geprüft).`;

  for (const r of results) {
    const hikeHours = estimateHikeHours(r);
    const totalDayHours = Math.round((2 * (r.travelMin / 60) + hikeHours) * 10) / 10;
    const longDay = totalDayHours > 12;

    const card = document.createElement("article");
    card.className = "card";
    card.dataset.routeId = r.id;
    card.dataset.date = dateISO;
    card.innerHTML = `
      <h3>${r.name}</h3>
      <div class="badges">
        <span class="badge sun">☀️ ${r.weather.sunshineHours} h Sonne</span>
        <span class="badge">🌡️ ${r.weather.tempMax != null ? Math.round(r.weather.tempMax) + "°C" : "–"}</span>
        <span class="badge">🚂 ${r.travelMin} Min ab Zürich HB</span>
        ${longDay ? '<span class="badge warn">⚠️ langer Tag</span>' : ""}
      </div>
      <dl class="facts">
        <dt>Strecke</dt><dd>${r.distanceKm} km</dd>
        <dt>Aufstieg / Abstieg</dt><dd>${r.ascent ?? "–"} m / ${r.descent ?? "–"} m</dd>
        <dt>Geschätzte Gehzeit</dt><dd>${hikeHours} h</dd>
        <dt>Nächste Haltestelle</dt><dd>${r.station.name}</dd>
      </dl>
      <div class="links">
        <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/relation/${r.id}">Route auf OSM</a>
        <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${r.lat},${r.lon}">Karte</a>
      </div>
      <div class="card-actions">${planButtonHtml(r, dateISO)}</div>
    `;
    resultsEl.appendChild(card);
  }
}

function renderHistory() {
  const items = getHistory();
  if (!items.length) {
    historyEl.innerHTML = '<p class="muted">Noch keine Wanderung gemerkt.</p>';
    return;
  }

  historyEl.innerHTML = items
    .map((e) => {
      const meta = [
        e.plannedDate,
        e.stationName,
        e.travelMin != null ? `${e.travelMin} Min ab Zürich HB` : null,
        e.sunshineHours != null ? `${e.sunshineHours} h Sonne` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const statusBadge =
        e.status === "gemacht"
          ? `<span class="badge done">✅ gemacht am ${e.completedDate}</span>`
          : `<span class="badge">📌 geplant</span>`;
      return `
        <div class="history-item" data-route-id="${e.routeId}" data-date="${e.plannedDate}">
          <div class="history-main">
            <strong>${e.name}</strong>
            <span class="muted">${meta}</span>
          </div>
          <div class="history-actions">
            ${statusBadge}
            ${e.status !== "gemacht" ? '<button type="button" class="done-btn">Als gemacht markieren</button>' : ""}
            <button type="button" class="remove-btn" title="Entfernen">✕</button>
          </div>
        </div>
      `;
    })
    .join("");
}

resultsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".plan-btn");
  if (!btn || btn.disabled) return;
  const card = btn.closest(".card");
  const route = currentResultsById.get(Number(card.dataset.routeId));
  if (!route) return;
  addPlanned(route, card.dataset.date);
  btn.disabled = true;
  btn.textContent = "📌 gemerkt";
  renderHistory();
});

historyEl.addEventListener("click", (e) => {
  const item = e.target.closest(".history-item");
  if (!item) return;
  const routeId = Number(item.dataset.routeId);
  const plannedDate = item.dataset.date;

  if (e.target.classList.contains("done-btn")) {
    markDone(routeId, plannedDate, new Date().toISOString().slice(0, 10));
    renderHistory();
  } else if (e.target.classList.contains("remove-btn")) {
    removeEntry(routeId, plannedDate);
    renderHistory();
  }
});

async function runSearch() {
  searchBtn.disabled = true;
  resultsEl.innerHTML = "";
  summaryEl.textContent = "";
  const dateISO = dateInput.value;

  try {
    const routes = await fetchHikingRoutes({ onStatus: setStatus });
    const feasible = routes.filter((r) => estimateHikeHours(r) <= MAX_HIKE_HOURS);

    setStatus(`Prüfe Wetter für ${feasible.length} Routen am ${dateISO}...`);
    const weatherMap = await fetchWeatherBatch(feasible, dateISO, { onStatus: setStatus });

    const sunnyCandidates = feasible
      .map((r) => ({ ...r, weather: weatherMap.get(r.id) }))
      .filter((r) => r.weather && !r.weather.thunderstorm)
      .sort((a, b) => b.weather.sunshineHours - a.weather.sunshineHours);

    const toCheck = sunnyCandidates.slice(0, MAX_CANDIDATES_TO_CHECK);
    const results = [];
    let checked = 0;
    let stop = false;
    const limit = pLimit(TRANSIT_CONCURRENCY);

    await Promise.all(
      toCheck.map((route) =>
        limit(async () => {
          if (stop) return;
          const station = await findNearestStation(route.lat, route.lon);
          if (!station) return;
          const travelMin = await getTravelMinutes(station.id, dateISO);
          checked++;
          setStatus(`Prüfe ÖV-Erreichbarkeit... (${checked}/${toCheck.length})`);
          if (travelMin != null && travelMin <= MAX_TRAVEL_MINUTES) {
            results.push({ ...route, station, travelMin });
            if (results.length >= WANTED_RESULTS) stop = true;
          }
        })
      )
    );

    results.sort((a, b) => b.weather.sunshineHours - a.weather.sunshineHours);
    setStatus("");
    renderResults(results, dateISO, checked, toCheck.length);
  } catch (err) {
    console.error(err);
    setStatus("");
    summaryEl.textContent = `Fehler: ${err.message}. Bitte später erneut versuchen.`;
  } finally {
    searchBtn.disabled = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});

initDateInput();
renderHistory();
