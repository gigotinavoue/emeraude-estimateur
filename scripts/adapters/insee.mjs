// Adaptateur Insee Melodi : taux d'occupation hôtelier mensuel (Ille-et-Vilaine), proxy de saisonnalité urbaine.
import { readJsonIfExists } from '../lib/util.mjs';

const SOURCE = 'insee_hotels';

export function run() {
  return parseHotels(readJsonIfExists('data/raw/insee/ds_tour_freq_dep35_hotels.json'));
}

// `raw` = fichier brut { retrievedAt, data } ; utilisable aussi sur une réponse candidate.
export function parseHotels(raw) {
  if (!raw || !raw.data || !Array.isArray(raw.data.observations)) return [];
  const obs = [];
  for (const o of raw.data.observations) {
    const d = o.dimensions || {};
    if (d.TOUR_MEASURE !== 'PLACE_OCCUPANCY_RATE' || d.FREQ !== 'M' || d.ACTIVITY !== 'I551') continue;
    if ((d.HOTEL_STA && d.HOTEL_STA !== '_T') || (d.TOUR_RESID && d.TOUR_RESID !== '_T')) continue;
    const m = /^(\d{4})-(\d{2})$/.exec(d.TIME_PERIOD || '');
    const v = o.measures && o.measures.OBS_VALUE_NIVEAU && o.measures.OBS_VALUE_NIVEAU.value;
    if (!m || typeof v !== 'number') continue;
    const y = m[1];
    const mi = Number(m[2]) - 1;
    const last = new Date(Date.UTC(Number(y), mi + 1, 0)).getUTCDate();
    obs.push({
      id: `${SOURCE}|${y}-${m[2]}|departement:35|hotelOccupancy`, source: SOURCE,
      geo: { level: 'departement', id: '35', label: 'Ille-et-Vilaine' },
      segment: { roomType: 'hotel', bedrooms: 'all' }, metric: 'hotelOccupancy', value: v / 100, unit: 'ratio',
      period: { start: `${y}-${m[2]}-01`, end: `${y}-${m[2]}-${last}`, granularity: 'month', month: mi },
      retrievedAt: raw.retrievedAt, status: 'ok'
    });
  }
  return obs;
}
