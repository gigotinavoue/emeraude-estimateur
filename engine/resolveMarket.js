// Résolution de la base de marché d'une commune, avec chaîne de repli.
import { isNum } from './safe.js';

export function checkMarketEntry(m, validation) {
  if (!m || typeof m !== 'object') return { ok: false, reason: 'entrée absente' };
  if (m.status && m.status !== 'ok') return { ok: false, reason: `statut « ${m.status} »` };
  const checks = [
    ['adr', m.adr, validation.adr],
    ['occupancy', m.occupancy, validation.occupancy],
    ['avgStay', m.avgStay, validation.avgStay]
  ];
  for (const [k, v, range] of checks) {
    if (!isNum(v)) return { ok: false, reason: `${k} manquant ou invalide` };
    if (v < range[0] || v > range[1]) return { ok: false, reason: `${k} hors limites (${v})` };
  }
  if (!m.period || !m.period.end) return { ok: false, reason: 'période absente' };
  return { ok: true };
}

export function marketChain(commune, communesCfg) {
  const chain = [`commune:${commune.id}`, `epci:${commune.epci}`];
  const epci = communesCfg.epci[commune.epci];
  for (const f of (epci && epci.fallback) || []) if (!chain.includes(f)) chain.push(f);
  const dep = communesCfg.departement.id;
  if (!chain.includes(dep)) chain.push(dep);
  return chain;
}

// Renvoie la première base valide de la chaîne, ou null.
export function resolveMarket(communeId, market, communesCfg, config) {
  const commune = communesCfg.communes.find((c) => c.id === communeId);
  if (!commune || !market || !market.markets) return null;
  const chain = marketChain(commune, communesCfg);
  const ownEpci = `epci:${commune.epci}`;
  const reasons = [];
  for (const key of chain) {
    const m = market.markets[key];
    if (!m) {
      if (!key.startsWith('commune:')) reasons.push({ key, reason: 'aucune donnée publiée' });
      continue;
    }
    const check = checkMarketEntry(m, config.validation);
    if (!check.ok) {
      reasons.push({ key, reason: check.reason });
      continue;
    }
    let geoRole;
    if (key.startsWith('commune:')) geoRole = 'commune';
    else if (key === ownEpci) geoRole = 'epci';
    else if (key.startsWith('epci:')) geoRole = 'epci_voisin';
    else geoRole = 'departement';
    return { key, commune, entry: m, geoRole, fallbackReasons: reasons, ownEpciLabel: (communesCfg.epci[commune.epci] || {}).label || commune.epci };
  }
  return { key: null, commune, entry: null, geoRole: null, fallbackReasons: reasons };
}
