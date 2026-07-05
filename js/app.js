import {
  MAX_TRAVEL_MINUTES,
  MAX_HIKE_HOURS,
  TRANSIT_CONCURRENCY,
  SWISSTOPO_ATTRIBUTION,
  SWISSTOPO_BASEMAP_URL,
  SWISSTOPO_HIKING_TRAILS_URL,
  ZURICH_HB_LATLON,
  DEFAULT_MAP_ZOOM,
} from "./config.js";
import { loadHikes } from "./data.js";
import { fetchWeatherBatch } from "./weather.js";
import { findNearestStation, getTravelMinutes } from "./transit.js";
import { isDone, markDone, unmarkDone, getDoneDate } from "./history.js";

const dateInput = document.getElementById("date-input");
const typeWanderungCb = document.getElementById("type-wanderung");
const typeViaFerrataCb = document.getElementById("type-via-ferrata");
const hideDoneCb = document.getElementById("hide-done");
const surpriseBtn = document.getElementById("surprise-btn");
const statusEl = document.getElementById("status");
const detailsEl = document.getElementById("details");

let hikesById = new Map();
let weatherById = new Map(); // hikeId -> weather (inkl. ampel)
let transitById = new Map(); // hikeId -> { station, travelMin } | null
let markersById = new Map(); // hikeId -> L.Marker
let map;

function setStatus(text) {
  statusEl.textContent = text || "";
}

function initDateInput() {
  const today = new Date();
  const max = new Date();
  max.setDate(max.getDate() + 15); // Open-Meteo-Prognosehorizont
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const toISO = (d) => d.toISOString().slice(0, 10);
  dateInput.min = toISO(today);
  dateInput.max = toISO(max);
  dateInput.value = toISO(tomorrow);
}

function estimateHikeHours(hike) {
  const base = hike.distanceKm / 4;
  const ascentTime = (hike.ascentM || 0) / 350;
  return Math.round((base + ascentTime) * 10) / 10;
}

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

function initMap() {
  map = L.map("map").setView(ZURICH_HB_LATLON, DEFAULT_MAP_ZOOM);

  const basemap = L.tileLayer(SWISSTOPO_BASEMAP_URL, {
    attribution: SWISSTOPO_ATTRIBUTION,
    maxZoom: 18,
  }).addTo(map);

  const wanderwege = L.tileLayer(SWISSTOPO_HIKING_TRAILS_URL, {
    attribution: SWISSTOPO_ATTRIBUTION,
    maxZoom: 18,
    opacity: 0.9,
  }).addTo(map);

  L.control.layers(
    { "swisstopo Übersichtsplan": basemap },
    { "Wanderwege (swisstopo)": wanderwege }
  ).addTo(map);
}

function makeIcon(hike, ampel, done) {
  const emoji = hike.type === "via_ferrata" ? "🧗" : "🥾";
  const classes = ["marker", ampel || "grau", done ? "done" : ""].filter(Boolean).join(" ");
  return L.divIcon({
    html: `<div class="${classes}">${emoji}</div>`,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function updateMarker(hike) {
  const marker = markersById.get(hike.id);
  if (!marker) return;
  const ampel = weatherById.get(hike.id)?.ampel || "grau";
  marker.setIcon(makeIcon(hike, ampel, isDone(hike.id)));
}

function typeCheckboxOk(hike) {
  if (hike.type === "via_ferrata") return typeViaFerrataCb.checked;
  return typeWanderungCb.checked;
}

function applyFilters() {
  for (const hike of hikesById.values()) {
    const marker = markersById.get(hike.id);
    if (!marker) continue;
    const shouldShow = typeCheckboxOk(hike) && (!hideDoneCb.checked || !isDone(hike.id));
    const isShown = map.hasLayer(marker);
    if (shouldShow && !isShown) marker.addTo(map);
    if (!shouldShow && isShown) map.removeLayer(marker);
  }
}

function ampelLabel(ampel) {
  return { gruen: "☀️ gutes Wetter", gelb: "🌤️ durchzogen", rot: "⛈️ Gewitter/Regen" }[ampel] || "⏳ wird geprüft";
}

function renderDetails(hike) {
  const weather = weatherById.get(hike.id);
  const transit = transitById.get(hike.id);
  const hikeHours = estimateHikeHours(hike);
  const done = isDone(hike.id);
  const doneDate = done ? getDoneDate(hike.id) : null;

  const transitHtml = transit
    ? `${transit.travelMin} Min ab Zürich HB (${transit.station.name})` +
      (transit.travelMin > MAX_TRAVEL_MINUTES ? ' <span class="warn">⚠️ über 2h</span>' : "")
    : transit === null
      ? "keine ÖV-Verbindung gefunden"
      : "wird geprüft...";

  const weatherHtml = weather
    ? `${ampelLabel(weather.ampel)} · ☀️ ${weather.sunshineHours} h Sonne` +
      (weather.tempMax != null ? ` · 🌡️ ${Math.round(weather.tempMax)}°C` : "")
    : "wird geprüft...";

  detailsEl.hidden = false;
  detailsEl.innerHTML = `
    ${hike.imageUrl ? `<img class="details-image" src="${hike.imageUrl}" alt="${hike.name}" />` : ""}
    <h3>${hike.type === "via_ferrata" ? "🧗" : "🥾"} ${hike.name}</h3>
    <dl class="facts">
      <dt>Typ</dt><dd>${hike.type === "via_ferrata" ? "Klettersteig" : "Wanderung"}</dd>
      <dt>Strecke</dt><dd>${hike.distanceKm} km</dd>
      <dt>Aufstieg / Abstieg</dt><dd>${hike.ascentM ?? "–"} m / ${hike.descentM ?? "–"} m</dd>
      <dt>Geschätzte Gehzeit</dt><dd>${hikeHours} h</dd>
      <dt>ÖV ab Zürich HB</dt><dd>${transitHtml}</dd>
      <dt>Wetter</dt><dd>${weatherHtml}</dd>
    </dl>
    <div class="details-actions">
      ${
        done
          ? `<span class="badge done">✅ gemacht am ${doneDate}</span>
             <button type="button" id="unmark-done-btn">↩️ nicht mehr als gemacht</button>`
          : `<button type="button" id="mark-done-btn">✅ Als gemacht markieren</button>`
      }
      ${hike.sourceUrl ? `<a target="_blank" rel="noopener" href="${hike.sourceUrl}">Originalquelle</a>` : ""}
      <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${hike.start.lat},${hike.start.lon}">Karte</a>
    </div>
  `;

  document.getElementById("mark-done-btn")?.addEventListener("click", () => {
    markDone(hike.id, new Date().toISOString().slice(0, 10));
    updateMarker(hike);
    renderDetails(hike);
    applyFilters();
  });
  document.getElementById("unmark-done-btn")?.addEventListener("click", () => {
    unmarkDone(hike.id);
    updateMarker(hike);
    renderDetails(hike);
    applyFilters();
  });
}

function createMarkers() {
  for (const hike of hikesById.values()) {
    const marker = L.marker([hike.start.lat, hike.start.lon], {
      icon: makeIcon(hike, "grau", isDone(hike.id)),
    });
    marker.bindTooltip(hike.name, { direction: "top" });
    marker.on("click", () => renderDetails(hike));
    markersById.set(hike.id, marker);
    marker.addTo(map);
  }
}

async function loadTransitForAllHikes() {
  const dateISO = dateInput.value;
  const limit = pLimit(TRANSIT_CONCURRENCY);
  let checked = 0;
  const hikes = [...hikesById.values()];

  await Promise.all(
    hikes.map((hike) =>
      limit(async () => {
        try {
          const station = await findNearestStation(hike.start.lat, hike.start.lon);
          const travelMin = station ? await getTravelMinutes(station.id, dateISO) : null;
          transitById.set(hike.id, station && travelMin != null ? { station, travelMin } : null);
        } catch {
          transitById.set(hike.id, null);
        }
        checked++;
        setStatus(`Prüfe ÖV-Erreichbarkeit... (${checked}/${hikes.length})`);
      })
    )
  );
}

async function refreshWeather() {
  const dateISO = dateInput.value;
  const hikes = [...hikesById.values()];
  const points = hikes.map((h) => ({ id: h.id, lat: h.start.lat, lon: h.start.lon }));

  setStatus(`Prüfe Wetter für ${dateISO}...`);
  weatherById = await fetchWeatherBatch(points, dateISO, { onStatus: setStatus });

  for (const hike of hikesById.values()) updateMarker(hike);
  setStatus("");
}

function surprise() {
  const pool = [...hikesById.values()].filter((hike) => {
    if (!typeCheckboxOk(hike) || isDone(hike.id)) return false;
    if (weatherById.get(hike.id)?.ampel !== "gruen") return false;
    const transit = transitById.get(hike.id);
    return transit && transit.travelMin <= MAX_TRAVEL_MINUTES;
  });

  if (!pool.length) {
    setStatus("Keine passende Tour gefunden - versuch ein anderes Datum oder andere Filter.");
    return;
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  map.flyTo([pick.start.lat, pick.start.lon], 12);
  markersById.get(pick.id)?.openTooltip();
  renderDetails(pick);
}

async function init() {
  initDateInput();
  initMap();

  setStatus("Lade Touren...");
  const hikes = await loadHikes();
  // "an einem Tag machbar" ist ein hartes Kriterium - zu lange Touren erst gar
  // nicht als Marker anlegen statt sie dauerhaft auf "wird geprüft" stehen zu lassen.
  const dayHikes = hikes.filter((h) => estimateHikeHours(h) <= MAX_HIKE_HOURS);
  hikesById = new Map(dayHikes.map((h) => [h.id, h]));

  createMarkers();

  dateInput.addEventListener("change", refreshWeather);
  typeWanderungCb.addEventListener("change", applyFilters);
  typeViaFerrataCb.addEventListener("change", applyFilters);
  hideDoneCb.addEventListener("change", applyFilters);
  surpriseBtn.addEventListener("click", surprise);

  await loadTransitForAllHikes();
  await refreshWeather();
  applyFilters();
}

init().catch((err) => {
  console.error(err);
  setStatus(`Fehler: ${err.message}`);
});
