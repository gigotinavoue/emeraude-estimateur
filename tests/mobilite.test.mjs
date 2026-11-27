// Parcours « bail mobilité » (2.5.0) : moteur indépendant, configuration, repères, scénarios et artifact.
// Vérifie aussi que le parcours courte durée reste strictement identique à la version initiale.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { estimerMobilite, cycleMobilite, calculerScenario, validerSaisieMobilite, repereLoyer, MOBILITE_ENGINE_VERSION } from '../engine/mobilite.js';
import { validateSchema } from '../scripts/lib/schema.mjs';
import { buildReperes } from '../scripts/build-mobilite-reperes.mjs';
import { buildArtifact } from '../scripts/build-artifact.mjs';
import { grille } from '../scripts/audit/parite-courte-duree.mjs';
import { bundleModules } from '../scripts/build-embed.mjs';

const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const CFG = J('config/mobilite.json');
const REP = J('data/mobilite/reperes-loyers.json');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// Saisie complète de base : aucun frais facultatif, aucune plateforme, rémunération forfaitaire nulle.
const base = (over = {}) => ({
  commune: 'rennes', typologie: 't2', surface: 40, loyer: 900, forfaitCharges: 60, dureeBail: 6, vacance: 1, chargesAnnuelles: 1800,
  remuneration: { mode: 'forfait_mensuel', valeur: 0 }, plateforme: { mode: 'aucun' }, ...over
});
const central = (over) => {
  const r = estimerMobilite(base(over), CFG, REP);
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r.scenarios.central;
};

test('MB1. Bail d’un mois sans vacance : 12 rotations, 12 mois loués', () => {
  const c = cycleMobilite(1, 0);
  assert.deepEqual([c.cycle, c.rotations, c.moisLoues, c.moisVacants, c.occupation], [1, 12, 12, 0, 1]);
  const s = central({ dureeBail: 1, vacance: 0 });
  close(s.revenuLocatifBrut, 900 * 12);
  close(s.rotations, 12);
});

test('MB2. Bail de trois mois et un mois de vacance : 3 rotations, 9 mois loués', () => {
  const c = cycleMobilite(3, 1);
  assert.deepEqual([c.cycle, c.rotations, c.moisLoues, c.moisVacants], [4, 3, 9, 3]);
  close(c.occupation, 0.75);
  const s = central({ dureeBail: 3, vacance: 1 });
  close(s.revenuLocatifBrut, 900 * 9);
  close(s.chargesRecuperees, 60 * 9);
  close(s.loyerNonPercuVacance, 900 * 3);
});

test('MB3. Bail de dix mois (maximum légal) et deux mois de vacance : 1 rotation, 10 mois loués', () => {
  const c = cycleMobilite(10, 2);
  assert.deepEqual([c.cycle, c.rotations, c.moisLoues], [12, 1, 10]);
  const s = central({ dureeBail: 10, vacance: 2 });
  close(s.occupation, 10 / 12);
  assert.ok(!estimerMobilite(base({ dureeBail: 11 }), CFG, REP).ok, 'durée de 11 mois refusée');
  assert.ok(!estimerMobilite(base({ dureeBail: 0.5 }), CFG, REP).ok, 'durée inférieure à 1 mois refusée');
});

test('MB4. Vacance nulle : douze mois loués, occupation 100 %, aucun loyer perdu', () => {
  for (const d of [1, 2.5, 4, 6, 10]) {
    const s = central({ dureeBail: d, vacance: 0 });
    close(s.moisLoues, 12);
    close(s.occupation, 1);
    close(s.loyerNonPercuVacance, 0);
    close(s.rotations, 12 / d);
  }
});

test('MB5. Vacance entre deux baux : plus de vacance, moins de mois loués et moins de revenu', () => {
  const vals = [0, 0.5, 1, 2, 3].map((v) => central({ vacance: v }));
  for (let i = 1; i < vals.length; i++) {
    assert.ok(vals[i].moisLoues < vals[i - 1].moisLoues);
    assert.ok(vals[i].revenuNet < vals[i - 1].revenuNet);
  }
  close(vals[2].moisLoues, 12 * 6 / 7);
  close(vals[2].moisLoues + vals[2].moisVacants, 12);
});

test('MB6. Douze mois loués au plus, même avec un cycle qui ne divise pas l’année', () => {
  for (const [d, v] of [[10, 0], [7, 0], [5, 0], [9.5, 0]]) {
    const c = cycleMobilite(d, v);
    assert.ok(c.moisLoues <= 12);
    close(c.moisLoues, 12);
  }
  const s = central({ dureeBail: 10, vacance: 0 });
  close(s.rotations, 1.2);
});

test('MB7. Frais de rotation : (ménage + linge + kit) × rotations, déduits du revenu net', () => {
  const sans = central({ dureeBail: 3, vacance: 1 });
  const avec = central({ dureeBail: 3, vacance: 1, menage: 70, linge: 25, kit: 15 });
  close(avec.frais.rotation, (70 + 25 + 15) * 3);
  close(avec.frais.menage, 210);
  close(sans.revenuNet - avec.revenuNet, 330);
  assert.equal(avec.revenuLocatifBrut, sans.revenuLocatifBrut);
});

test('MB8. Frais de plateforme configurables : aucun, pourcentage du loyer, forfait par bail', () => {
  const a = central({ plateforme: { mode: 'aucun' } });
  const p = central({ plateforme: { mode: 'pourcentage_loyer', valeur: 5 } });
  const f = central({ dureeBail: 3, vacance: 1, plateforme: { mode: 'forfait_bail', valeur: 100 } });
  close(a.frais.plateforme, 0);
  close(p.frais.plateforme, a.revenuLocatifBrut * 0.05);
  close(a.revenuNet - p.revenuNet, a.revenuLocatifBrut * 0.05);
  close(f.frais.plateforme, 300);
  const sansChoix = estimerMobilite(base({ plateforme: {} }), CFG, REP);
  assert.ok(!sansChoix.ok && sansChoix.errors.plateformeMode, 'le mode de plateforme doit être choisi explicitement');
  assert.ok(estimerMobilite(base({ plateforme: { mode: 'pourcentage_loyer' } }), CFG, REP).errors.plateformeValeur);
});

test('MB9. Rémunération Émeraude variable : modes, assiettes et frais complémentaires', () => {
  const d = { dureeBail: 3, vacance: 1 }; // 3 rotations, 9 mois loués
  const pct = central({ ...d, remuneration: { mode: 'pourcentage', valeur: 10, assiette: 'loyer' } });
  close(pct.remuneration.total, 900 * 9 * 0.1);
  close(pct.remuneration.assiette, 900 * 9);
  const pcc = central({ ...d, remuneration: { mode: 'pourcentage', valeur: 10, assiette: 'loyer_charges' } });
  close(pcc.remuneration.total, (900 + 60) * 9 * 0.1);
  close(central({ ...d, remuneration: { mode: 'forfait_mensuel', valeur: 50 } }).remuneration.total, 600);
  close(central({ ...d, remuneration: { mode: 'forfait_mois_loue', valeur: 50 } }).remuneration.total, 450);
  close(central({ ...d, remuneration: { mode: 'forfait_rotation', valeur: 120 } }).remuneration.total, 360);
  const comp = central({ ...d, remuneration: { mode: 'forfait_rotation', valeur: 120, fraisRotation: 40, fraisAnnuels: 100 } });
  close(comp.remuneration.total, 360 + 120 + 100);
  close(comp.remuneration.rotation, 120);
  for (const t of [8, 12, 15]) close(central({ remuneration: { mode: 'pourcentage', valeur: t, assiette: 'loyer' } }).remuneration.total, central({}).revenuLocatifBrut * t / 100);
  // Aucun taux par défaut : un mode sans valeur ou sans assiette est refusé.
  const e = estimerMobilite(base({ remuneration: { mode: 'pourcentage' } }), CFG, REP).errors;
  assert.ok(e.remunerationValeur && e.remunerationAssiette);
  assert.ok(estimerMobilite(base({ remuneration: {} }), CFG, REP).errors.remunerationMode);
  // Bornes du pourcentage cohérentes avec le message « entre 0 et 100 » : 0 et 100 acceptés, au-delà refusé.
  close(central({ remuneration: { mode: 'pourcentage', valeur: 0, assiette: 'loyer', fraisRotation: 50 } }).remuneration.total, 50 * central({}).rotations);
  assert.ok(estimerMobilite(base({ remuneration: { mode: 'pourcentage', valeur: 100, assiette: 'loyer' } }), CFG, REP).ok);
  for (const x of [-1, 100.5]) assert.equal(estimerMobilite(base({ remuneration: { mode: 'pourcentage', valeur: x, assiette: 'loyer' } }), CFG, REP).errors.remunerationValeur, 'Rémunération Émeraude : pourcentage entre 0 et 100 attendu.');
  assert.equal(JSON.stringify(CFG.remuneration).match(/"(taux|valeur|defaut|default)"\s*:/), null, 'aucun taux fixé dans la configuration');
});

test('MB10. Charges annuelles : déduites en totalité, forfait récupéré distingué, jamais compté comme revenu net', () => {
  const a = central({ chargesAnnuelles: 1800 });
  const b = central({ chargesAnnuelles: 2400 });
  close(a.revenuNet - b.revenuNet, 600);
  close(a.chargesNonCouvertes, 1800 - a.chargesRecuperees);
  // Le revenu net vaut loyers − charges non couvertes − frais : le forfait n'augmente le net que de ce qu'il compense.
  close(a.revenuNet, a.revenuLocatifBrut - a.chargesNonCouvertes - a.frais.plateforme - a.frais.rotation - a.remuneration.total);
  const sansForfait = central({ forfaitCharges: 0 });
  close(a.revenuNet - sansForfait.revenuNet, a.chargesRecuperees);
  const r = estimerMobilite(base({ forfaitCharges: 200, chargesAnnuelles: 1200 }), CFG, REP);
  assert.ok(r.warnings.some((w) => w.includes('manifestement disproportionné')));
});

test('MB11. Absence de données : aucun chiffre inventé, champs signalés, frais facultatifs non déduits et signalés', () => {
  const vide = estimerMobilite({}, CFG, REP);
  assert.equal(vide.ok, false);
  assert.equal(vide.scenarios, undefined);
  for (const k of ['commune', 'typologie', 'surface', 'loyer', 'forfaitCharges', 'dureeBail', 'vacance', 'chargesAnnuelles', 'remunerationMode', 'plateformeMode']) assert.ok(vide.errors[k], k);
  for (const k of ['loyer', 'dureeBail', 'vacance', 'chargesAnnuelles', 'forfaitCharges']) assert.ok(estimerMobilite(base({ [k]: '' }), CFG, REP).errors[k], `${k} vide refusé`);
  const r = estimerMobilite(base(), CFG, REP);
  assert.deepEqual(r.nonRenseignes, ['Ménage par rotation', 'Linge par rotation', 'Kit d’accueil et consommables par rotation']);
  assert.ok(r.warnings.some((w) => w.includes('non déduit') && w.includes('surestimé')));
  close(r.scenarios.central.frais.rotation, 0);
  assert.ok(estimerMobilite(base({ commune: 'paris' }), CFG, REP).errors.commune, 'commune hors zone refusée');
  // Zéro saisi explicitement : accepté et distinct de « non renseigné ».
  assert.deepEqual(estimerMobilite(base({ menage: 0, linge: '0', kit: '0' }), CFG, REP).nonRenseignes, []);
  // Repères : aucune donnée de loyer meublé, de durée de bail ni de vacance n'est fournie.
  assert.equal(REP.meuble.donnees, null);
  assert.equal(REP.dureeBail.donnees, null);
  assert.equal(REP.vacance.donnees, null);
});

test('MB12. Revenu net : conservation des flux et lecture des chaînes saisies', () => {
  const s = central({ dureeBail: 4, vacance: 1.5, menage: 60, linge: 20, kit: 10, remuneration: { mode: 'pourcentage', valeur: 12, assiette: 'loyer', fraisRotation: 30, fraisAnnuels: 50 }, plateforme: { mode: 'pourcentage_loyer', valeur: 3 } });
  close(s.encaisse, s.revenuLocatifBrut + s.chargesRecuperees);
  close(s.encaisse, s.revenuNet + s.frais.chargesAnnuelles + s.frais.plateforme + s.frais.rotation + s.remuneration.total, 1e-6);
  close(s.revenuNetMensuelMoyen * 12, s.revenuNet);
  const t = estimerMobilite(base({ loyer: '900,00 €', forfaitCharges: ' 60 ', dureeBail: '6', vacance: '1' }), CFG, REP);
  assert.ok(t.ok);
  close(t.scenarios.central.revenuNet, central({}).revenuNet);
  // Cas chiffré à la main : 900 € × (12 × 6/7) + 60 € × (12 × 6/7) − 1 800 € = 8 074,29 €.
  close(central({}).revenuNet, (900 + 60) * 72 / 7 - 1800, 1e-6);
});

test('MB13. Scénarios : prudent ≤ central ≤ optimiste ; préavis d’un mois et vacance dans le prudent ; bornes respectées', () => {
  const r = estimerMobilite(base({ menage: 60 }), CFG, REP);
  const { prudent, central: c, optimiste } = r.scenarios;
  assert.ok(prudent.revenuNet <= c.revenuNet && c.revenuNet <= optimiste.revenuNet);
  assert.ok(prudent.moisLoues <= c.moisLoues && c.moisLoues <= optimiste.moisLoues);
  assert.deepEqual([prudent.hypotheses.dureeBail, prudent.hypotheses.vacance], [5, 2]);
  assert.equal(CFG.scenarios.prudent.departAnticipeMois, CFG.cadreLegal.preavisLocataireMois, 'départ anticipé du prudent = préavis légal');
  assert.deepEqual([c.hypotheses.dureeBail, c.hypotheses.vacance], [6, 1]);
  assert.deepEqual([optimiste.hypotheses.dureeBail, optimiste.hypotheses.vacance], [6, 0.5]);
  const court = estimerMobilite(base({ dureeBail: 1, vacance: 0 }), CFG, REP).scenarios;
  assert.equal(court.prudent.hypotheses.dureeBail, 1, 'jamais moins d’un mois');
  assert.equal(court.optimiste.hypotheses.vacance, 0, 'jamais de vacance négative');
  // Hypothèses modifiables, sans effet sur le central.
  const h = estimerMobilite(base({ menage: 60, hypotheses: { prudent: { departAnticipeMois: 0, vacanceSupplementaireMois: 2 } } }), CFG, REP).scenarios;
  assert.deepEqual([h.prudent.hypotheses.dureeBail, h.prudent.hypotheses.vacance], [6, 3]);
  close(h.central.revenuNet, c.revenuNet);
  assert.equal(CFG.scenarios.nature, 'HYPOTHÈSE');
  for (const id of ['prudent', 'central', 'optimiste']) assert.ok(r.scenarios[id].description.length > 10);
});

test('MB14. Configuration et repères : schémas dédiés, sources identifiées, aucune donnée Lighthouse ou AirROI', () => {
  assert.deepEqual(validateSchema(CFG, J('schemas/mobilite-config.schema.json')), []);
  assert.deepEqual(validateSchema(REP, J('schemas/mobilite-reperes.schema.json')), []);
  assert.deepEqual(buildReperes(), REP, 'data/mobilite/reperes-loyers.json à jour : node scripts/build-mobilite-reperes.mjs');
  assert.equal(REP.source.id, 'carte_loyers');
  assert.match(REP.definition, /NON meublé/);
  const brut = JSON.stringify(REP) + JSON.stringify(CFG);
  for (const mot of ['lighthouse', 'airroi', 'airdna', 'eurostat', 'tour_freq', 'adt35']) assert.ok(!brut.toLowerCase().includes(mot), mot);
  const src = fs.readFileSync('engine/mobilite.js', 'utf8');
  assert.ok(!/^\s*import\s/m.test(src), 'moteur bail mobilité sans import');
  assert.ok(!/market\.json|adrAnnual|ENGINE_VERSION = /.test(src.replace('MOBILITE_ENGINE_VERSION = ', '')), 'aucune dépendance au moteur courte durée');
  const cfgCourte = fs.readFileSync('config/config.json', 'utf8');
  assert.ok(!cfgCourte.includes('mobilite'), 'configuration courte durée non modifiée');
});

test('MB15. Repère de loyer : location nue, intervalle arrondi, jamais utilisé dans le calcul', () => {
  const r = repereLoyer('rennes', 't2', 40, CFG, REP);
  assert.ok(r.disponible && r.nonMeuble);
  assert.equal(r.mensuelBas % 10, 0);
  assert.equal(r.mensuelHaut % 10, 0);
  assert.ok(r.mensuelBas < r.mensuelHaut);
  assert.equal(repereLoyer('val-d-ize', 't2', 40, CFG, REP).fiabilite, 'faible');
  assert.equal(repereLoyer('rennes', null, 40, CFG, REP).disponible, false);
  const sansRep = estimerMobilite(base(), CFG, null);
  close(sansRep.scenarios.central.revenuNet, central({}).revenuNet);
});

test('MB16. Artifact 2.5.0 : choix initial, deux parcours séparés, moteur courte durée embarqué à l’identique', () => {
  const r = buildArtifact({ write: false });
  assert.equal(r.changed, false, 'artifact désynchronisé : npm run build:artifact');
  assert.equal(r.version, '2.5.0');
  assert.equal(r.engineVersion, '1.3.1');
  assert.equal(r.mobiliteEngineVersion, MOBILITE_ENGINE_VERSION);
  assert.ok(r.references.every((x) => x.ok));
  const h = fs.readFileSync('dist/estimateur-artifact.html', 'utf8');
  assert.ok(h.includes('Location courte durée Airbnb') && h.includes('Location en bail mobilité'));
  assert.ok(h.includes('id="app" hidden') && h.includes('id="mobApp" hidden'), 'aucun parcours affiché avant le choix');
  const snap = JSON.parse(/const SNAPSHOT=(\{.*\});\r?\nconst REMOTE/.exec(h)[1]);
  assert.equal(snap.mobilite, undefined, 'aucune donnée bail mobilité dans les données courte durée');
  const mob = JSON.parse(/const MOBILITE=(\{.*\});\n/.exec(h)[1]);
  assert.deepEqual(mob.config, CFG);
  assert.deepEqual(mob.reperes, REP);
  assert.ok(!JSON.stringify(mob).includes('markets'), 'aucune donnée de marché courte durée dans le parcours bail mobilité');
  // Le moteur bail mobilité embarqué donne les mêmes résultats que le module.
  const box = { window: {} };
  vm.runInNewContext(/\/\* Moteur bail mobilité[^\n]*\n([\s\S]*?)\n<\/script>/.exec(h)[1], box);
  const a = box.window.EmeraudeMobilite.estimerMobilite(base({ menage: 50 }), CFG, REP);
  assert.equal(JSON.stringify(a), JSON.stringify(estimerMobilite(base({ menage: 50 }), CFG, REP)));
  // Le moteur courte durée embarqué est le regroupement exact des fichiers figés d'engine/, sans engine/mobilite.js.
  const eng = /\/\* Moteur de calcul \(généré depuis engine\/\*\.js\) \*\/\n([\s\S]*?)\n<\/script>/.exec(h)[1];
  const order = ['safe.js', 'inputs.js', 'quality.js', 'resolveMarket.js', 'adjustments.js', 'core.js', 'uncertainty.js', 'index.js'];
  assert.equal(eng, bundleModules('engine', order, 'window.EmeraudeEngine={estimate:estimate,ENGINE_VERSION:ENGINE_VERSION};'));
  assert.ok(!eng.includes('estimerMobilite'));
});

test('MB17. Parcours courte durée strictement identique à la version initiale (288 cas, résultats complets)', () => {
  const ref = J('tests/fixtures/courte-duree-parite.json').cases;
  const got = grille();
  assert.equal(Object.keys(got).length, 288);
  const ecarts = Object.keys(ref).filter((k) => !got[k] || got[k].sha256 !== ref[k].sha256);
  assert.deepEqual(ecarts, []);
  assert.ok(Object.values(ref).every((x) => x.ok));
});

test('MB18. calculerScenario et validerSaisieMobilite exportés : contrat stable', () => {
  const v = validerSaisieMobilite(base(), CFG, Object.keys(REP.communes));
  assert.ok(v.ok);
  const s = calculerScenario(v.saisie, { departAnticipeMois: 0, vacanceSupplementaireMois: 0 }, CFG);
  for (const k of ['revenuLocatifBrut', 'chargesRecuperees', 'frais', 'remuneration', 'revenuNet', 'moisLoues', 'rotations', 'occupation']) assert.ok(k in s, k);
});
