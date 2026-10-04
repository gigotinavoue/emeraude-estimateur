// Audit (lecture seule) : structure du parc de logements par nombre de pièces (Insee, recensement, Licence Ouverte)
// pour comparer les communes desservies aux villes de référence utilisées pour le mélange de tailles.
import { writeJson } from '../lib/util.mjs';

const GEOS = {
  Rennes: '35238', 'Saint-Malo': '35288', Vitré: '35360', Cesson: '35051', Bruz: '35047',
  'Lyon (réf. urbaine)': '69123', 'Bordeaux (réf.)': '33063', 'Biarritz (réf. littorale)': '64122', 'Anglet (réf. littorale)': '64024', 'Saint-Jean-de-Luz (réf. littorale)': '64483'
};

async function fetchGeo(code) {
  for (const y of [2026, 2025, 2024]) {
    const r = await fetch(`https://api.insee.fr/melodi/data/DS_RP_LOGEMENT_PRINC?GEO=${y}-COM-${code}&maxResult=5000`);
    if (!r.ok) continue;
    const j = await r.json();
    if (j.observations && j.observations.length) return j.observations;
  }
  return [];
}

export function summarize(obs) {
  const years = [...new Set(obs.map((o) => o.dimensions.TIME_PERIOD))].sort();
  const y = years[years.length - 1];
  const at = obs.filter((o) => o.dimensions.TIME_PERIOD === y && o.dimensions.RP_MEASURE === 'DWELLINGS');
  const val = (f) => at.filter(f).reduce((s, o) => s + o.measures.OBS_VALUE_NIVEAU.value, 0);
  const only = (o, keep) => Object.entries(o.dimensions).every(([d, v]) => keep.includes(d) || d === 'GEO' || d === 'TIME_PERIOD' || d === 'FREQ' || d === 'RP_MEASURE' || v === '_T');
  const rooms = {};
  for (const r of ['R1', 'R2', 'R3', 'R4', 'R_GE5']) rooms[r] = val((o) => o.dimensions.NOR === r && o.dimensions.OCS === 'DW_MAIN' && only(o, ['NOR', 'OCS']));
  const totalMain = Object.values(rooms).reduce((a, b) => a + b, 0);
  const share = Object.fromEntries(Object.entries(rooms).map(([k, v]) => [k, totalMain ? Math.round((v / totalMain) * 1000) / 1000 : null]));
  const all = val((o) => o.dimensions.OCS === '_T' && only(o, []));
  const sec = val((o) => o.dimensions.OCS === 'DW_SEC_DW_OCC' && only(o, ['OCS']));
  const houses = val((o) => o.dimensions.TDW === '1' && o.dimensions.OCS === 'DW_MAIN' && only(o, ['TDW', 'OCS']));
  return { year: y, mainDwellings: Math.round(totalMain), roomsShareMain: share, secondaryShare: all ? Math.round((sec / all) * 1000) / 1000 : null, housesShareMain: totalMain ? Math.round((houses / totalMain) * 1000) / 1000 : null };
}

if (process.argv[1].endsWith('insee-rooms.mjs')) {
  const out = {};
  for (const [name, code] of Object.entries(GEOS)) {
    const obs = await fetchGeo(code);
    out[name] = obs.length ? summarize(obs) : { error: 'aucune donnée' };
    const s = out[name];
    if (!s.error) console.log(`${name.padEnd(36)} ${s.year} · 1-2 pièces ${((s.roomsShareMain.R1 + s.roomsShareMain.R2) * 100).toFixed(0)} % · 3 p. ${(s.roomsShareMain.R3 * 100).toFixed(0)} % · 4 p. ${(s.roomsShareMain.R4 * 100).toFixed(0)} % · 5+ p. ${(s.roomsShareMain.R_GE5 * 100).toFixed(0)} % · maisons ${(s.housesShareMain * 100).toFixed(0)} % · résidences secondaires ${(s.secondaryShare * 100).toFixed(1)} %`);
  }
  writeJson('reports/audit-insee-pieces.json', { source: 'Insee, recensement de la population (DS_RP_LOGEMENT_PRINC), Licence Ouverte', generatedAt: new Date().toISOString(), communes: out });
}
