// Ajustements du modèle Émeraude : taille, emplacement, équipements.
// Tous les coefficients proviennent de config.json (hypothèses de modélisation).
import { clamp } from './safe.js';
import { bedroomsKey } from './inputs.js';

export function sizeAdjustments(p, config, segmentedBy = []) {
  const s = config.size;
  const bk = bedroomsKey(p.bedrooms);
  const ref = s.bedrooms[bk];
  const out = [];
  const segBed = segmentedBy.includes('bedrooms');
  out.push({
    id: 'bedrooms',
    label: `Nombre de chambres (${p.bedrooms})`,
    kind: segBed ? 'market_segment' : 'hypothese_emeraude',
    factor: segBed ? 1 : ref.adr,
    occPts: segBed ? 0 : ref.occPts,
    detail: segBed ? 'Déjà intégré par la source (données par nombre de chambres).' : `Coefficient ${ref.adr.toFixed(2)} par rapport au logement de référence (1 chambre).`
  });
  const area = clamp((p.area - ref.typicalArea) * s.area.perM2, -s.area.cap, s.area.cap);
  out.push({ id: 'area', label: `Surface (${p.area} m² vs ${ref.typicalArea} m² typique)`, kind: 'hypothese_emeraude', secondary: area, occPts: 0 });
  const guestsAdj = segmentedBy.includes('guests') ? 0 : clamp((p.guests - ref.typicalGuests) * s.guests.perGuest, -s.guests.cap, s.guests.cap);
  out.push({ id: 'guests', label: `Capacité (${p.guests} vs ${ref.typicalGuests} voyageurs typiques)`, kind: 'hypothese_emeraude', secondary: guestsAdj, occPts: 0 });
  let bath;
  let bathDetail = '';
  if (s.bathrooms.perExtraBathroom !== undefined) {
    // Seules les salles de bain AU-DELÀ de la configuration typique de la taille comptent (évite le double comptage avec les chambres).
    const typical = ref.typicalBathrooms ?? 1;
    bath = clamp(Math.max(0, p.bathrooms - typical) * s.bathrooms.perExtraBathroom, 0, s.bathrooms.cap);
    bathDetail = `Configuration typique pour cette taille : ${typical} salle(s) de bain.`;
  } else {
    bath = p.bathrooms >= s.bathrooms.minBathrooms && p.bedrooms >= s.bathrooms.minBedrooms ? s.bathrooms.bonus : 0;
  }
  out.push({ id: 'bathrooms', label: `Salles de bain (${p.bathrooms})`, kind: 'hypothese_emeraude', secondary: bath, occPts: 0, detail: bathDetail });
  const isHouse = !!(config.types[p.type] && config.types[p.type].isHouse);
  out.push({ id: 'house', label: 'Maison', kind: 'hypothese_emeraude', secondary: isHouse ? s.house.adr : 0, occPts: 0 });
  return out;
}

export function locationAdjustment(p, config, positiveBonusFactor = 1) {
  const lv = config.location.levels[p.location] || config.location.levels[config.location.default];
  const f = (x) => (x > 0 ? x * positiveBonusFactor : x);
  return { id: 'location', label: `Emplacement (${lv.label})`, kind: 'hypothese_emeraude', secondary: f(lv.adr), occPts: f(lv.occPts) };
}

export function amenityAdjustment(p, config, positiveBonusFactor = 1) {
  const items = config.amenities.items.filter((a) => p.amenities.includes(a.id));
  const byExclusive = new Map();
  let adr = 0;
  let occ = 0;
  for (const a of items) {
    if (a.exclusive) {
      const prev = byExclusive.get(a.exclusive);
      if (!prev || a.adr > prev.adr) byExclusive.set(a.exclusive, a);
    } else {
      adr += a.adr;
      occ += a.occPts;
    }
  }
  for (const a of byExclusive.values()) {
    adr += a.adr;
    occ += a.occPts;
  }
  const capped = adr > config.amenities.caps.adr || occ > config.amenities.caps.occPts;
  adr = Math.min(adr, config.amenities.caps.adr);
  occ = Math.min(occ, config.amenities.caps.occPts);
  return {
    id: 'amenities',
    label: `Équipements et atouts (${items.length} cochés)`,
    kind: 'hypothese_emeraude',
    secondary: adr * positiveBonusFactor,
    occPts: occ * positiveBonusFactor,
    detail: capped ? 'Plafond global des équipements atteint.' : 'Les équipements essentiels sont sans effet.'
  };
}
