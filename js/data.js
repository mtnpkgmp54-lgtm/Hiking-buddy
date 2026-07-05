import { HIKES_DATA_URL } from "./config.js";

/**
 * Lädt die kuratierte Touren-Liste (Wanderungen + Klettersteige).
 * Quelle: data/hikes.json - manuell kuratiert bzw. per
 * scripts/fetch-myswitzerland.mjs aus der MySwitzerland Open Data API befüllt.
 */
export async function loadHikes() {
  const res = await fetch(HIKES_DATA_URL);
  if (!res.ok) throw new Error(`Touren-Daten konnten nicht geladen werden (Status ${res.status})`);
  return res.json();
}
