// Bail mobilité 2.6.0 : calcul automatique du loyer conseillé (engine/mobilite.js 1.1.0, config/mobilite-loyer.json).
// Vérifie la formule à la main, les sources, les coefficients, le plafond, la confiance, le forfait de charges
// (jamais ajouté au loyer de marché), le loyer personnalisé et l'intégration dans les trois scénarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { estimerMobilite, estimerLoyerMobilite, segmentLogement, typologieLogement } from '../engine/mobilite.js';
import { validateSchema } from '../scripts/lib/schema.mjs';

const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const CFG = J('config/mobilite.json');
const REP = J('data/mobilite/reperes-loyers.json');
const L = J('config/mobilite-loyer.json');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const arr10 = (x) => Math.round(x / 10) * 10;
// Unité urbaine INSEE 2020 « Rennes » (35701), composition au 01/01/2026 : communes desservies qui en font partie.
const UU_RENNES = ['rennes', 'betton', 'bruz', 'cesson-sevigne', 'chantepie', 'chartres-de-bretagne', 'pace', 'saint-gregoire', 'saint-jacques-de-la-lande', 'vezin-le-coquet'];

// Logement neutre : tous les critères à leur valeur neutre, équipements obligatoires présents, aucun bonus.
const neutre = (over = {}) => ({
  commune: 'rennes', type: 'appartement', surface: 35, pieces: 2, chambres: 1, capacite: 2,
  etat: 'bon', modernite: 'standard', mobilier: 'standard', literie: 'standard', luminosite: 'normale',
  exterieur: 'aucun', stationnement: 'aucun', environnement: 'normal', etage: '1', ascenseur: false,
  equipements: { cuisine: true, four: true, microOndes: false }, ...over
});
const est = (over, forfait = 60) => estimerLoyerMobilite({ ...neutre(over), forfaitCharges: forfait }, L, REP);
const simulation = (over = {}) => ({
  logement: neutre(over.logement || {}), forfaitCharges: 60, dureeBail: 6, vacance: 1, chargesAnnuelles: 1800,
  remuneration: { mode: 'forfait_mensuel', valeur: 0 }, plateforme: { mode: 'aucun' }, ...over, ...(over.logement ? { logement: neutre(over.logement) } : {})
});

test('ML1. Formule vérifiée à la main : base nue × (1 + meublé) × (1 + bail mobilité) × surface − forfait', () => {
  const r = est({});
  assert.ok(r.ok);
  const base = REP.communes.rennes.app12.loyerM2; // 17,19 €/m² (Carte des loyers 2025, charges comprises, location nue)
  close(r.m2CC, base * 1.10 * 1.0 * 1.0);
  assert.equal(r.totalCC, arr10(base * 1.10 * 35)); // 661,8 → 660 €
  assert.equal(r.totalCC, 660);
  assert.equal(r.conseilleHC, 600);
  close(r.m2HC, 600 / 35);
  assert.equal(r.confiance, 'moyenne');
  assert.equal(r.segment, 'app12');
});

test('ML2. Fourchette : intervalle à 95 % publié ramené à 50 % (confiance moyenne), centrée sur le conseillé', () => {
  const r = est({});
  const ref = REP.communes.rennes.app12;
  const sigma = (Math.log(ref.hautM2) - Math.log(ref.basM2)) / (2 * 1.959964);
  assert.equal(r.totalCCbas, arr10(ref.loyerM2 * 1.1 * Math.exp(-0.6745 * sigma) * 35));
  assert.equal(r.totalCChaut, arr10(ref.loyerM2 * 1.1 * Math.exp(0.6745 * sigma) * 35));
  assert.ok(r.totalCCbas < r.totalCC && r.totalCC < r.totalCChaut);
  assert.ok(r.totalCCbas >= arr10(ref.basM2 * 1.1 * 35) && r.totalCChaut <= arr10(ref.hautM2 * 1.1 * 35), 'dans l’intervalle publié');
  assert.equal(r.basHC, r.totalCCbas - 60);
  assert.equal(r.hautHC, r.totalCChaut - 60);
});

test('ML3. Jamais la location nue comme loyer de bail mobilité : écart meublé appliqué, sourcé, distinct par commune', () => {
  assert.equal(L.meuble.parCommune.rennes, 0.10);
  assert.equal(L.meuble.defaut, 0.085);
  assert.match(L.sources.anilMeuble.label, /ANIL/);
  assert.match(L.sources.carteLoyers.portee, /NON meublé/);
  for (const c of Object.keys(REP.communes)) {
    const r = estimerLoyerMobilite({ ...neutre({ commune: c }), forfaitCharges: 0 }, L, REP);
    if (!r.ok) continue;
    assert.ok(r.m2CC > REP.communes[c].app12.loyerM2, `${c} : loyer meublé supérieur à la base nue`);
    close(r.coefficients.meuble, UU_RENNES.includes(c) ? 0.10 : 0.085);
  }
  assert.equal(L.mobilite.valeur, 0, 'aucune majoration bail mobilité sans donnée');
  assert.equal(L.mobilite.nature, 'HYPOTHÈSE');
});

test('ML4. Chaque critère a un effet documenté, dans le bon sens, et l’effet total est plafonné', () => {
  const ref = est({}).m2CC;
  const pct = (over) => est(over).m2CC / ref - 1;
  close(pct({ etat: 'entierement_renove' }), 0.05);
  close(pct({ etat: 'ancien' }), -0.05);
  close(pct({ exterieur: 'terrasse' }), 0.03);
  close(pct({ stationnement: 'place' }), 0.02);
  close(pct({ etage: 'rdc' }), -0.03);
  close(pct({ etage: '3plus', ascenseur: false }), -0.03);
  close(pct({ etage: '3plus', ascenseur: true }), 0.01);
  close(pct({ equipements: { cuisine: true, four: true, laveLinge: true, fibre: true } }), 0.025);
  // Tout au maximum : somme brute supérieure à 12 %, plafonnée.
  const max = est({ etat: 'entierement_renove', modernite: 'moderne', mobilier: 'haut', literie: 'haut', luminosite: 'tres', exterieur: 'terrasse', stationnement: 'place', environnement: 'calme', etage: '3plus', ascenseur: true,
    equipements: { cuisine: true, four: true, microOndes: true, laveLinge: true, laveVaisselle: true, secheLinge: true, television: true, fibre: true, climatisation: true, complementaires: true } });
  assert.ok(max.coefficients.qualiteBrute > 0.12);
  close(max.coefficients.qualite, 0.12);
  assert.ok(max.warnings.some((w) => /plafonné/.test(w)));
  const min = est({ etat: 'ancien', modernite: 'datee', mobilier: 'basique', literie: 'basique', luminosite: 'sombre', environnement: 'bruyant', etage: 'rdc' });
  close(min.coefficients.qualite, -0.12);
  // Chaque coefficient est numérique, borné et porte la nature HYPOTHÈSE.
  assert.equal(L.criteres.nature, 'HYPOTHÈSE');
  for (const def of Object.values(L.criteres.choix)) for (const [, v] of Object.values(def.options)) assert.ok(Math.abs(v) <= 0.05);
  for (const [, v] of Object.values(L.criteres.equipements)) assert.ok(v >= 0 && v <= 0.02);
});

test('ML5. Chambres, capacité et adresse sans effet sur le loyer (justifié) ; obligatoires sans décote mais signalés', () => {
  const ref = est({});
  assert.equal(est({ capacite: 4 }).totalCC, ref.totalCC);
  assert.equal(est({ chambres: 0 }).totalCC, ref.totalCC);
  assert.equal(est({ adresse: '12 rue de Paris' }).totalCC, ref.totalCC);
  for (const k of ['chambres', 'capacite', 'adresse']) assert.ok(L.criteres.sansEffet[k].length > 20);
  const sansFour = est({ equipements: { cuisine: true } });
  assert.equal(sansFour.totalCC, ref.totalCC);
  assert.equal(sansFour.confiance, 'faible');
  assert.ok(sansFour.warnings.some((w) => /2015-981/.test(w)));
  assert.ok(est({ capacite: 8 }).warnings.some((w) => /capacité/i.test(w)));
});

test('ML6. Segments de la Carte des loyers : 1-2 pièces, 3 pièces et plus, maisons', () => {
  assert.equal(segmentLogement('appartement', 1), 'app12');
  assert.equal(segmentLogement('appartement', 2), 'app12');
  assert.equal(segmentLogement('appartement', 3), 'app3');
  assert.equal(segmentLogement('maison', 4), 'mai');
  assert.equal(typologieLogement('appartement', 6), 't5');
  const t3 = est({ surface: 65, pieces: 3, chambres: 2, capacite: 4 });
  close(t3.m2CC, REP.communes.rennes.app3.loyerM2 * 1.10);
  const m = est({ type: 'maison', surface: 90, pieces: 4, chambres: 3, capacite: 6 });
  assert.equal(m.segment, 'mai');
  assert.equal(m.saisie.etage, null, 'étage sans objet pour une maison');
  assert.equal(m.confiance, 'faible', 'écart meublé mesuré sur des appartements');
});

test('ML7. Confiance faible et fourchette élargie : peu d’annonces, surface atypique ; jamais de confiance élevée', () => {
  const faible = est({ commune: 'val-d-ize' });
  assert.equal(faible.confiance, 'faible');
  assert.ok(faible.warnings.some((w) => /Confiance faible/.test(w)));
  const ref = REP.communes['val-d-ize'].app12;
  const sigma = (Math.log(ref.hautM2) - Math.log(ref.basM2)) / (2 * 1.959964);
  assert.equal(faible.totalCChaut, arr10(ref.loyerM2 * 1.085 * Math.exp(1.2816 * sigma) * 35));
  assert.equal(est({ surface: 9, pieces: 1, chambres: 0, capacite: 1 }).confiance, 'faible');
  assert.equal(est({ surface: 120 }).confiance, 'faible');
  assert.ok(!('elevee' in L.confiance.niveaux));
});

test('ML8. Forfait de charges : libre, jamais ajouté au loyer de marché, ne change pas le total payé par le locataire', () => {
  const a = est({}, 0);
  const b = est({}, 120);
  assert.equal(a.totalCC, b.totalCC);
  assert.equal(a.conseilleHC - b.conseilleHC, 120);
  const sa = estimerMobilite(simulation({ forfaitCharges: 0, chargesAnnuelles: 1800 }), CFG, REP, L).scenarios.central;
  const sb = estimerMobilite(simulation({ forfaitCharges: 120, chargesAnnuelles: 1800 }), CFG, REP, L).scenarios.central;
  close(sa.encaisse, sb.encaisse, 1e-6);
  close(sa.revenuNet, sb.revenuNet, 1e-6);
  // Sans forfait renseigné : pas de loyer hors charges, pas de simulation.
  const sans = estLoyerSansForfait();
  assert.equal(sans.conseilleHC, null);
  assert.ok(sans.totalCC > 0);
  const r = estimerMobilite(simulation({ forfaitCharges: '' }), CFG, REP, L);
  assert.equal(r.ok, false);
  assert.ok(r.errors.forfaitCharges);
  // Forfait supérieur au loyer total : refusé.
  assert.ok(!estimerMobilite(simulation({ forfaitCharges: 2000 }), CFG, REP, L).ok);
});
function estLoyerSansForfait() { return estimerLoyerMobilite(neutre(), L, REP); }

test('ML9. Trois scénarios recalculés à partir du loyer conseillé, identiques à une saisie manuelle du même loyer', () => {
  const r = estimerMobilite(simulation(), CFG, REP, L);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.loyer.source, 'estimation');
  assert.equal(r.saisie.loyer, 600);
  const manuel = estimerMobilite({ commune: 'rennes', typologie: 't2', surface: 35, loyer: 600, forfaitCharges: 60, dureeBail: 6, vacance: 1, chargesAnnuelles: 1800, remuneration: { mode: 'forfait_mensuel', valeur: 0 }, plateforme: { mode: 'aucun' } }, CFG, REP);
  for (const id of ['prudent', 'central', 'optimiste']) close(r.scenarios[id].revenuNet, manuel.scenarios[id].revenuNet, 1e-9);
  // Calcul à la main du central : bail 6 mois + 1 mois de vacance → 12/7 rotations, 72/7 mois loués.
  close(r.scenarios.central.revenuNet, (600 + 60) * 72 / 7 - 1800);
  assert.ok(r.scenarios.prudent.revenuNet < r.scenarios.central.revenuNet && r.scenarios.central.revenuNet < r.scenarios.optimiste.revenuNet);
});

test('ML10. Loyer personnalisé : remplace l’estimation dans les revenus, signalé comme modification personnelle', () => {
  const r = estimerMobilite(simulation({ loyerPersonnalise: 750 }), CFG, REP, L);
  assert.ok(r.ok);
  assert.equal(r.loyer.source, 'personnalise');
  assert.equal(r.saisie.loyer, 750);
  assert.equal(r.loyer.ecartPersonnalise, 150);
  assert.equal(r.loyer.estimation.conseilleHC, 600, 'le loyer conseillé reste affiché');
  assert.match(r.warnings[0], /modifié par le propriétaire/);
  close(r.scenarios.central.revenuLocatifBrut, 750 * 72 / 7);
  const bad = estimerMobilite(simulation({ loyerPersonnalise: 'abc' }), CFG, REP, L);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.loyerPersonnalise);
});

test('ML11. Saisie incomplète : erreurs explicites par champ, aucune valeur inventée', () => {
  const r = estimerLoyerMobilite({ commune: 'rennes' }, L, REP);
  assert.equal(r.ok, false);
  for (const k of ['type', 'surface', 'pieces', 'chambres', 'capacite']) assert.ok(r.errors[k], k);
  assert.equal(estimerLoyerMobilite(neutre({ commune: 'paris' }), L, REP).errors.commune, 'Commune : hors de la zone desservie.');
  assert.ok(estimerLoyerMobilite(neutre({ pieces: 2.5 }), L, REP).errors.pieces);
  const m = estimerMobilite(simulation({ logement: { surface: '' } }), CFG, REP, L);
  assert.ok(m.errors.logement_surface);
  // Critère inconnu : neutre et signalé, jamais une valeur inventée.
  const x = est({ etat: 'luxueux' });
  assert.equal(x.saisie.etat, 'bon');
  assert.ok(x.warnings.some((w) => /neutres/.test(w)));
});

test('ML12. Configuration : schéma, sources datées, contrat 1.0.0 conservé, moteur embarqué identique', () => {
  assert.deepEqual(validateSchema(L, J('schemas/mobilite-loyer.schema.json')), []);
  assert.deepEqual(validateSchema(CFG, J('schemas/mobilite-config.schema.json')), []);
  for (const s of Object.values(L.sources)) assert.ok(s.url.startsWith('https://') && s.portee.length > 30);
  const brut = JSON.stringify(L).toLowerCase();
  for (const mot of ['lighthouse', 'airroi', 'airdna']) assert.ok(!brut.includes(mot), mot);
  // Sans config de loyer (contrat 1.0.0) : loyer saisi utilisé tel quel, aucune estimation.
  const legacy = estimerMobilite({ commune: 'rennes', typologie: 't2', surface: 35, loyer: 900, forfaitCharges: 60, dureeBail: 6, vacance: 1, chargesAnnuelles: 1800, remuneration: { mode: 'forfait_mensuel', valeur: 0 }, plateforme: { mode: 'aucun' } }, CFG, REP);
  assert.equal(legacy.saisie.loyer, 900);
  assert.equal(legacy.loyer, undefined);
  const h = fs.readFileSync('dist/estimateur-artifact.html', 'utf8');
  const box = { window: {} };
  vm.runInNewContext(/\/\* Moteur bail mobilité[^\n]*\n([\s\S]*?)\n<\/script>/.exec(h)[1], box);
  const a = box.window.EmeraudeMobilite.estimerMobilite(simulation({ logement: { etat: 'renove', exterieur: 'balcon' } }), CFG, REP, L);
  assert.equal(JSON.stringify(a), JSON.stringify(estimerMobilite(simulation({ logement: { etat: 'renove', exterieur: 'balcon' } }), CFG, REP, L)));
});

test('ML13. Écart meublé par unité urbaine : 10 % pour les 10 communes de l’unité urbaine de Rennes, 8,5 % ailleurs, nature documentée', () => {
  assert.deepEqual(Object.keys(L.meuble.parCommune).sort(), [...UU_RENNES].sort());
  for (const c of UU_RENNES) assert.equal(L.meuble.parCommune[c], 0.10, c);
  const autres = Object.keys(REP.communes).filter((c) => !UU_RENNES.includes(c));
  assert.deepEqual(autres.sort(), ['chateaubourg', 'liffre', 'saint-aubin-du-cormier', 'saint-malo', 'val-d-ize', 'vitre']);
  for (const c of autres) close(est({ commune: c }).coefficients.meuble, 0.085);
  // Calcul à la main, Bruz (unité urbaine de Rennes) : 14,75 × 1,10 × 35 = 567,9 → 570 € CC.
  assert.equal(est({ commune: 'bruz' }).totalCC, 570);
  // Saint-Malo (hors unité urbaine de Rennes) : 15,73 × 1,085 × 35 = 597,3 → 600 € CC.
  assert.equal(est({ commune: 'saint-malo' }).totalCC, 600);
  assert.match(L.meuble.justification, /à confirmer/);
  assert.match(L.sources.inseeUnitesUrbaines.url, /insee\.fr/);
  for (const k of Object.keys(L.meuble.parCommuneNature)) assert.match(L.meuble.parCommuneNature[k], /SOURCE|LECTURE|HYPOTHÈSE/);
});

test('ML14. Versions harmonisées : artifact 2.6.0, moteur bail mobilité 1.1.0, configurations 1.1.0', () => {
  const engine = fs.readFileSync('engine/mobilite.js', 'utf8');
  const v = /MOBILITE_ENGINE_VERSION = '([^']+)'/.exec(engine)[1];
  assert.equal(v, '1.1.0');
  assert.equal(CFG.version, 'mobilite-' + v);
  assert.equal(L.version, 'mobilite-loyer-' + v);
  assert.match(fs.readFileSync('scripts/build-artifact.mjs', 'utf8'), /version: '2\.6\.0'/);
});

test('ML15. Forfait de charges et frais en pourcentage : total encaissé inchangé, seul l’effet de l’assiette convenue joue', () => {
  const pct = (forfait, rem, plat) => estimerMobilite(simulation({ forfaitCharges: forfait, remuneration: rem, plateforme: plat }), CFG, REP, L).scenarios.central;
  // Rémunération sur le loyer hors charges : un forfait plus élevé réduit l’assiette, exactement de taux × Δforfait × mois loués.
  const a = pct(60, { mode: 'pourcentage', valeur: 20, assiette: 'loyer' }, { mode: 'aucun' });
  const b = pct(120, { mode: 'pourcentage', valeur: 20, assiette: 'loyer' }, { mode: 'aucun' });
  close(a.encaisse, b.encaisse, 1e-6);
  close(b.revenuNet - a.revenuNet, 0.20 * 60 * a.moisLoues, 1e-6);
  // Assiette « loyer et forfait » : aucun effet du forfait sur le revenu net.
  const c = pct(60, { mode: 'pourcentage', valeur: 20, assiette: 'loyer_charges' }, { mode: 'aucun' });
  const d = pct(120, { mode: 'pourcentage', valeur: 20, assiette: 'loyer_charges' }, { mode: 'aucun' });
  close(c.revenuNet, d.revenuNet, 1e-6);
});
