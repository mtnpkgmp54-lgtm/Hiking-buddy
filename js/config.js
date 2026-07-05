// Zentrale Konstanten für die Wander-App

export const ZURICH_HB_NAME = "Zürich HB";

export const MAX_TRAVEL_MINUTES = 120; // Anforderung: < 2h ab Zürich HB
export const MIN_HIKE_KM = 4; // zu kurze Routen ausschliessen
export const MAX_HIKE_KM = 30; // an einem Tag machbar
export const MAX_HIKE_HOURS = 9; // reine Gehzeit, grobe Obergrenze für Tagestouren

// WMO weathercodes von Open-Meteo, die Gewitter bedeuten
export const THUNDERSTORM_CODES = [95, 96, 99];

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
export const TRANSPORT_API = "https://transport.opendata.ch/v1";
export const METEO_API = "https://api.open-meteo.com/v1/forecast";

export const ROUTES_CACHE_KEY = "hiking-app:routes-cache:v1";
export const ROUTES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const MAX_CANDIDATES_TO_CHECK = 60; // ÖV-Abfragen sind teuer -> begrenzen
export const WANTED_RESULTS = 20;
export const TRANSIT_CONCURRENCY = 5;
