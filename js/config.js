// Zentrale Konstanten für die Wander-App

export const ZURICH_HB_NAME = "Zürich HB";

export const MAX_TRAVEL_MINUTES = 120; // Anforderung: < 2h ab Zürich HB
export const MAX_HIKE_HOURS = 7; // reine Gehzeit, Tagestour-Obergrenze

// WMO weathercodes von Open-Meteo, die Gewitter bedeuten
export const THUNDERSTORM_CODES = [95, 96, 99];

// Ampel-Schwellen fürs Tageswetter (siehe weather.js:scoreDay)
export const AMPEL_RED_PRECIP_PROB = 70;
export const AMPEL_GREEN_MIN_SUNSHINE_HOURS = 5;
export const AMPEL_GREEN_MAX_PRECIP_PROB = 30;

export const TRANSPORT_API = "https://transport.opendata.ch/v1";
export const METEO_API = "https://api.open-meteo.com/v1/forecast";

export const HIKES_DATA_URL = "data/hikes.json";
export const TRANSIT_CONCURRENCY = 5;

// swisstopo WMTS: https://api3.geo.admin.ch/services/sdiservices.html#wmts
export const SWISSTOPO_ATTRIBUTION =
  '&copy; <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>';
export const SWISSTOPO_BASEMAP_URL =
  "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg";
export const SWISSTOPO_HIKING_TRAILS_URL =
  "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png";

export const ZURICH_HB_LATLON = [47.3782, 8.5402];
export const DEFAULT_MAP_ZOOM = 8;
