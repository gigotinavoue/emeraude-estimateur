import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../engine/index.js';
import { ctx, J, clone, baseRaw } from './helpers.mjs';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

// Base « logement de référence » attendue, recalculée indépendamment du moteur à partir de la configuration.
const CFG = J('config/config.json');
function refBase(profile = 'urbain', marketAdr = 80, marketOcc = 0.49) {
  const rc = CFG.referenceCalibration;
  if (!rc || !rc.enabled) return { adr: marketAdr, occ: marketOcc };
  const mix = rc.mixByProfile[profile];
  let a = 0; let n = 0; let o = 0; let l = 0;
  for (const [k, b] of Object.entries(CFG.size.bedrooms)) {
    a += (mix.nightsShare[k] || 0) * b.adr; n += mix.nightsShare[k] || 0;
    o += (mix.listingShare[k] || 0) * b.occPts; l += mix.listingShare[k] || 0;
  }
  return { adr: marketAdr / (a / n), occ: marketOcc - o / l / 100 };
}
const REF = refBase();
const B = (k) => CFG.size.bedrooms[k];
const R = (raw, c = ctx()) => {
  const r = estimate(raw, c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r;
};

test('1. Rennes T2 40 m² standard, 2 voyageurs (logement de référence) : base de référence, sans autre ajustement', () => {
  const r = R(baseRaw());
  const s = r.scenarios.realiste;
  close(s.adrAnnual, REF.adr);
  close(s.occupancyAnnual, REF.occ);
  close(r.data.market.adr, 80); // la donnée de marché affichée reste la valeur observée
  close(r.data.market.occupancy, 0.49);
  assert.equal(r.data.zone, 'Rennes Métropole');
  assert.equal(r.data.geoRole, 'epci');
});

test('1b. Rennes T2 40 m² avec 3 voyageurs : seule la correction de capacité s\'applique (+1 voyageur)', () => {
  const s = R(baseRaw({ guests: '3' })).scenarios.realiste;
  close(s.adrAnnual, REF.adr * (1 + CFG.size.guests.perGuest));
});

test('2. Studio 20 m², 2 voyageurs : facteur studio et surface (−5 m²), occupation du studio', () => {
  const s = R(baseRaw({ type: 'studio', bedrooms: '0', area: '20', guests: '2' })).scenarios.realiste;
  close(s.adrAnnual, REF.adr * B('0').adr * (1 - 5 * CFG.size.area.perM2));
  close(s.occupancyAnnual, REF.occ + B('0').occPts / 100);
});

test('3. T3 70 m², 2 chambres, 4 voyageurs (capacité typique) : facteur 2 chambres et surface +10 m²', () => {
  const s = R(baseRaw({ type: 't3', bedrooms: '2', area: '70', guests: '4' })).scenarios.realiste;
  close(s.adrAnnual, REF.adr * B('2').adr * (1 + 10 * CFG.size.area.perM2));
  close(s.occupancyAnnual, REF.occ + B('2').occPts / 100);
});

test('4. Maison 120 m², 4 chambres, 2 sdb (typique), 8 voyageurs : facteur 4+ et surface uniquement (pas de bonus maison ni sdb)', () => {
  const s = R(baseRaw({ type: 'maison', bedrooms: '4', bathrooms: '2', area: '120', guests: '8' })).scenarios.realiste;
  close(s.adrAnnual, REF.adr * B('4+').adr * (1 + 10 * CFG.size.area.perM2));
  assert.ok(s.model.secondaryMultiplier <= CFG.guards.adrSecondaryMultiplier[1]);
  close(s.occupancyAnnual, REF.occ + B('4+').occPts / 100);
});

test('5. Petite commune (Saint-Aubin-du-Cormier) : Liffré-Cormier, confiance moyenne', () => {
  const r = R(baseRaw({ commune: 'saint-aubin-du-cormier' }));
  assert.equal(r.data.zone, 'Liffré-Cormier Communauté');
  assert.equal(r.data.confidence.level, 'moyenne');
  assert.ok(r.data.confidence.reasons.some((x) => x.includes('petite taille')));
});

test('6. Châteaubourg : Vitré Communauté (son EPCI) ; repli Rennes Métropole puis département si absent', () => {
  let r = R(baseRaw({ commune: 'chateaubourg' }));
  assert.equal(r.data.zone, 'Vitré Communauté');
  const m = clone(J('tests/fixtures/market.valid.json'));
  delete m.markets['epci:vitre-communaute'];
  r = R(baseRaw({ commune: 'chateaubourg' }), ctx({ marketSources: [{ origin: 'remote', data: m }] }));
  assert.equal(r.data.zone, 'Rennes Métropole');
  assert.equal(r.data.geoRole, 'epci_voisin');
  assert.ok(r.data.fallbackMessages.some((x) => x.includes('marché voisin')));
  delete m.markets['epci:rennes-metropole'];
  r = R(baseRaw({ commune: 'chateaubourg' }), ctx({ marketSources: [{ origin: 'remote', data: m }] }));
  assert.equal(r.data.geoRole, 'departement');
  assert.equal(r.data.confidence.level, 'faible');
});

test('7. 10 mois (mode nombre) : 304,17 nuits disponibles, nuits louées = total annuel × 10/12', () => {
  const r10 = R(baseRaw({ monthsCount: '10' })).scenarios.realiste;
  const r12 = R(baseRaw({ monthsCount: '12' })).scenarios.realiste;
  close(r10.nightsAvailable, 10 * 365 / 12);
  close(r10.nightsBooked, r12.nightsBooked * 10 / 12, 1e-6);
  close(r10.nightsRevenue, r12.nightsRevenue * 10 / 12, 1e-6);
});

test('8. Juillet et août exclus (Saint-Malo, profil littoral) : CA inférieur à 10 mois « moyens »', () => {
  const sel = R(baseRaw({ commune: 'saint-malo', monthsMode: 'select', monthsSelected: [0, 1, 2, 3, 4, 5, 8, 9, 10, 11] })).scenarios.realiste;
  const cnt = R(baseRaw({ commune: 'saint-malo', monthsCount: '10' })).scenarios.realiste;
  assert.equal(sel.nightsAvailable, 303); // 365 − 31 (juillet) − 31 (août)
  assert.ok(sel.nightsRevenue < cnt.nightsRevenue * 0.9, `${sel.nightsRevenue} vs ${cnt.nightsRevenue}`);
});

test('9. 12 mois sélectionnés = 12 mois en nombre = base annuelle (normalisation des indices)', () => {
  const all = [...Array(12).keys()];
  const sel = R(baseRaw({ monthsMode: 'select', monthsSelected: all })).scenarios.realiste;
  const cnt = R(baseRaw({ monthsCount: '12' })).scenarios.realiste;
  close(sel.nightsRevenue, cnt.nightsRevenue, 1e-6);
  close(sel.nightsBooked, REF.occ * 365, 365 * REF.occ * 0.005);
  close(sel.nightsRevenue, REF.adr * REF.occ * 365, REF.adr * REF.occ * 365 * 0.005);
});

test('10. Les 32 équipements : effet plafonné à +10 % prix et +3 pts occupation', () => {
  const config = J('config/config.json');
  const s = R(baseRaw({ amenities: config.amenities.items.map((a) => a.id) })).scenarios.realiste;
  const a = s.adjustments.find((x) => x.id === 'amenities');
  close(a.adrEffectPct, 10);
  close(a.occEffectPts, 3);
});

test('11. Balcon + terrasse : seule la terrasse compte (groupe exclusif)', () => {
  const s = R(baseRaw({ amenities: ['balcon', 'terrasse'] })).scenarios.realiste;
  close(s.adjustments.find((x) => x.id === 'amenities').adrEffectPct, 4);
});

test('12. Équipements essentiels uniquement : aucun effet', () => {
  const config = J('config/config.json');
  const base = config.amenities.items.filter((a) => a.group === 'base').map((a) => a.id);
  const s = R(baseRaw({ amenities: base })).scenarios.realiste;
  close(s.adrAnnual, REF.adr);
  close(s.occupancyAnnual, REF.occ);
});

test('13. Ménage : de 0 à 500 € par séjour, le prix, l\'occupation et le CA des nuits ne changent jamais', () => {
  const a = R(baseRaw({ cleaningFee: '0' })).scenarios;
  const b = R(baseRaw({ cleaningFee: '500' })).scenarios;
  for (const id of ['prudent', 'realiste', 'performant']) {
    close(a[id].adr, b[id].adr);
    close(a[id].occupancy, b[id].occupancy);
    close(a[id].nightsRevenue, b[id].nightsRevenue);
    close(a[id].commission.amount, b[id].commission.amount);
    close(a[id].ownerIncome, b[id].ownerIncome);
    assert.equal(a[id].cleaning.collected, 0);
    assert.ok(b[id].cleaning.collected > 0);
  }
});

test('14. Ménage : définition « inconnue » affichée, ADR de marché non modifié (D8)', () => {
  const r = R(baseRaw());
  assert.equal(r.data.definitions.adrIncludesCleaning, 'unknown');
  close(r.data.market.adr, 80);
  assert.ok(r.explanation.market.definitionNotes.some((x) => x.includes('ménage')));
});

test('14b. Ménage : changer la durée de séjour ne modifie que le ménage', () => {
  const a = R(baseRaw({ avgStay: '2' })).scenarios.realiste;
  const b = R(baseRaw({ avgStay: '6' })).scenarios.realiste;
  close(a.nightsRevenue, b.nightsRevenue);
  assert.ok(a.cleaning.collected > b.cleaning.collected);
});

test('15. Commission : linéaire et répartition exacte du CA des nuits (D2, D1)', () => {
  for (const pct of ['0', '20', '50']) {
    const s = R(baseRaw({ commissionPct: pct })).scenarios.realiste;
    close(s.commission.base, s.nightsRevenue * (1 - 0.155));
    close(s.commission.amount, s.commission.base * Number(pct) / 100);
    close(s.ownerIncome + s.commission.amount + s.airbnb.onNights, s.nightsRevenue, 1e-6);
    close(s.emeraude.cleaningNet, s.cleaning.collected * (1 - 0.155), 1e-6);
  }
});

test('16. TVA sur frais Airbnb : désactivée par défaut ; activée, seules les lignes TVA, propriétaire et ménage net changent', () => {
  const off = R(baseRaw()).scenarios.realiste;
  const on = R(baseRaw({ vat: true })).scenarios.realiste;
  assert.equal(off.airbnb.vatEnabled, false);
  close(off.airbnb.vatOnNightsFee, 0);
  close(on.nightsRevenue, off.nightsRevenue);
  close(on.commission.amount, off.commission.amount);
  close(on.airbnb.vatOnNightsFee, off.airbnb.onNights * 0.2);
  close(off.ownerIncome - on.ownerIncome, on.airbnb.vatOnNightsFee);
});

test('17. Données absentes : bascule sur les données de secours, confiance faible', () => {
  const snap = J('tests/fixtures/market.valid.json');
  const r = R(baseRaw(), ctx({ marketSources: [{ origin: 'remote', data: { schemaVersion: 1, markets: {} } }, { origin: 'snapshot', data: snap }] }));
  assert.equal(r.data.origin, 'snapshot');
  assert.equal(r.data.confidence.level, 'faible');
  const none = estimate(baseRaw(), ctx({ marketSources: [{ origin: 'remote', data: null, note: 'Fichier indisponible.' }] }));
  assert.equal(none.ok, false);
  assert.ok(none.errors._global);
});

test('18. Données anciennes : fraîcheur rouge, confiance faible, calcul maintenu', () => {
  const m = clone(J('tests/fixtures/market.valid.json'));
  for (const v of Object.values(m.markets)) v.period = { start: '2021-01-01', end: '2021-12-31' };
  const r = R(baseRaw(), ctx({ marketSources: [{ origin: 'remote', data: m }] }));
  assert.equal(r.data.freshness.level, 'red');
  assert.equal(r.data.confidence.level, 'faible');
  assert.ok(r.scenarios.realiste.nightsRevenue > 0);
});

test('18b. Données 2024 au 04/10/2026 : fraîcheur orange (21 mois)', () => {
  const r = R(baseRaw());
  assert.equal(r.data.freshness.level, 'orange');
  assert.equal(r.data.freshness.months, 21);
});

test('19. Valeur aberrante (ADR 900 €, occupation 140 %) : niveau écarté, repli département avec motif', () => {
  const m = clone(J('tests/fixtures/market.valid.json'));
  m.markets['epci:rennes-metropole'].adr = 900;
  let r = R(baseRaw(), ctx({ marketSources: [{ origin: 'remote', data: m }] }));
  assert.equal(r.data.geoRole, 'departement');
  assert.ok(r.data.fallbackMessages.some((x) => x.includes('adr hors limites')));
  m.markets['epci:rennes-metropole'].adr = 80;
  m.markets['epci:rennes-metropole'].occupancy = 1.4;
  r = R(baseRaw(), ctx({ marketSources: [{ origin: 'remote', data: m }] }));
  assert.equal(r.data.geoRole, 'departement');
});

test('20. Fichier corrompu (illisible) : données de secours utilisées', () => {
  const snap = J('tests/fixtures/market.valid.json');
  const r = R(baseRaw(), ctx({ marketSources: [{ origin: 'remote', data: null, note: 'Fichier en ligne illisible.' }, { origin: 'snapshot', data: snap }] }));
  assert.equal(r.data.origin, 'snapshot');
  assert.ok(r.data.fallbackMessages.some((x) => x.includes('illisible')));
});

test('20b. Profil saisonnier corrompu : répartition uniforme et avertissement', () => {
  const m = clone(J('tests/fixtures/market.valid.json'));
  m.seasonality.urbain.occupancyIndex[3] = 'x';
  const r = R(baseRaw(), ctx({ marketSources: [{ origin: 'remote', data: m }] }));
  assert.equal(r.data.seasonality.fallback, true);
  assert.ok(r.warnings.some((w) => w.field === '_seasonality'));
});

test('22. Source segmentée par chambres : le facteur chambres est neutralisé (pas de double comptage)', () => {
  const m = clone(J('tests/fixtures/market.valid.json'));
  m.markets['commune:rennes'] = { ...m.markets['epci:rennes-metropole'], label: 'Rennes · 3 chambres (source test)', geoLevel: 'commune', segmentedBy: ['bedrooms'], adr: 150 };
  const s = R(baseRaw({ type: 't4', bedrooms: '3', area: '80', guests: '6' }), ctx({ marketSources: [{ origin: 'remote', data: m }] })).scenarios.realiste;
  assert.equal(s.model.bedroomFactor, 1);
  close(s.adrAnnual, 150);
});

test('23. Saisies invalides : erreurs par champ, jamais de NaN ; virgule décimale acceptée', () => {
  const bad = estimate(baseRaw({ area: '5', guests: 'abc', bedrooms: '1.5' }), ctx());
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.area && bad.errors.guests && bad.errors.bedrooms);
  const ok = R(baseRaw({ area: '40,5' }));
  assert.ok(Number.isFinite(ok.scenarios.realiste.nightsRevenue));
  const noMonths = estimate(baseRaw({ monthsMode: 'select', monthsSelected: [] }), ctx());
  assert.equal(noMonths.ok, false);
  assert.ok(noMonths.errors.monthsSelected);
});

test('24. Scénarios : écart = variation annuelle observée bornée 3–8 pts ; prudent ≤ réaliste ≤ performant', () => {
  const r = R(baseRaw({ location: 'hypercentre', amenities: ['renove'] }));
  const { prudent, realiste, performant } = r.scenarios;
  assert.equal(realiste.model.scenarioDeltaPts, 0);
  assert.equal(prudent.model.scenarioDeltaPts, -5); // Rennes Métropole : −5 pts observés
  assert.equal(performant.model.scenarioDeltaPts, 5);
  assert.ok(prudent.nightsRevenue < realiste.nightsRevenue && realiste.nightsRevenue < performant.nightsRevenue);
  const liff = R(baseRaw({ commune: 'liffre' })); // −2 pts observés -> borné à 3
  assert.equal(liff.scenarios.prudent.model.scenarioDeltaPts, -3);
  const vit = R(baseRaw({ commune: 'vitre' })); // −7 pts observés
  assert.equal(vit.scenarios.performant.model.scenarioDeltaPts, 7);
});

test('25. Méthodologie : marché, ajustements (hypothèses) et résultat bien séparés', () => {
  const r = R(baseRaw({ location: 'central' }));
  const e = r.explanation;
  assert.ok(e.market.title.includes('marché'));
  assert.ok(e.adjustments.title.includes('hypothèses'));
  assert.ok(e.adjustments.reference.includes('HYPOTHÈSE') || e.adjustments.reference.includes('Hypothèse'));
  assert.ok(e.adjustments.items.every((a) => a.kind === 'hypothese_emeraude' || a.kind === 'market_segment'));
  assert.ok(e.result.title.includes('Résultat'));
  close(e.market.lines.find((l) => l.label.includes('Prix moyen')).value, 80);
});

test('26. Calibration Émeraude : observation/signal sans effet, calibration et données solides plafonnées', () => {
  const mk = (listings, ratio) => {
    const m = clone(J('tests/fixtures/market.valid.json'));
    m.emeraude.segments = [{ key: 'epci:rennes-metropole|bedrooms:1', listings, listingMonths: listings * 12, ratioAdr: ratio, ratioOcc: 1, period: { start: '2027-01', end: '2027-12' } }];
    return R(baseRaw(), ctx({ marketSources: [{ origin: 'remote', data: m }] }));
  };
  let r = mk(4, 1.5);
  assert.equal(r.data.calibration.level, 'signal');
  close(r.scenarios.realiste.adrAnnual, REF.adr);
  r = mk(7, 1.2);
  assert.equal(r.data.calibration.level, 'calibration');
  close(r.data.calibration.weight, 0.33);
  close(r.scenarios.realiste.adrAnnual, REF.adr * (1 + 0.33 * 0.2));
  r = mk(20, 1.5);
  assert.equal(r.data.calibration.level, 'solide');
  close(r.scenarios.realiste.adrAnnual, REF.adr * 1.2); // effet plafonné à +20 %
});
