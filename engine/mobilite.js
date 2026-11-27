// Moteur « bail mobilité » : module INDÉPENDANT du moteur courte durée (aucun import d'engine/*.js, aucune donnée
// Lighthouse, AirROI, Eurostat ou Insee). Fonctions pures : estimerMobilite(raw, cfg, reperes).
//   raw     : valeurs saisies (nombres ou chaînes ; vide = non renseigné) ;
//   cfg     : config/mobilite.json ;
//   reperes : data/mobilite/reperes-loyers.json (facultatif ; repère affiché, jamais utilisé dans le calcul).
//
// Modèle (par scénario, en régime établi sur 12 mois) :
//   cycle            = durée du bail + vacance entre deux baux (mois)
//   rotations / an   = 12 / cycle
//   mois loués / an  = min(12, rotations × durée du bail) ; occupation pendant un bail signé = 100 %
//   occupation       = mois loués / 12
//   revenu locatif brut      = loyer × mois loués
//   charges récupérées       = forfait de charges × mois loués (compense des charges : pas un revenu net)
//   revenu net propriétaire  = loyer + forfait encaissés − charges réelles annuelles − frais de plateforme
//                              − rémunération Émeraude − (ménage + linge + kit) × rotations
// Aucune valeur n'est inventée : un champ obligatoire vide bloque le calcul ; un frais facultatif vide n'est pas
// déduit et il est signalé comme tel.

export const MOBILITE_ENGINE_VERSION = '1.1.0';
export const SCENARIOS_MOBILITE = ['prudent', 'central', 'optimiste'];

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function lireNombre(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/\s| |€|%/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Cycle d'un bail : durée du bail + vacance. Exporté pour les tests et l'affichage de la méthode.
export function cycleMobilite(dureeBail, vacance) {
  const cycle = dureeBail + vacance;
  const rotations = 12 / cycle;
  const moisLoues = Math.min(12, rotations * dureeBail);
  return { cycle, rotations, moisLoues, moisVacants: 12 - moisLoues, occupation: moisLoues / 12 };
}

// Valide et normalise la saisie. Renvoie { ok, errors, warnings, saisie, nonRenseignes }.
export function validerSaisieMobilite(raw, cfg, communesValides = null) {
  const errors = {};
  const warnings = [];
  const nonRenseignes = [];
  const b = cfg.bornes;
  const r = raw || {};
  const s = {};

  const requis = (cle, libelle, [min, max], { entier = false } = {}) => {
    const n = lireNombre(r[cle]);
    if (n === null) { errors[cle] = `${libelle} : à renseigner.`; return null; }
    if (Number.isNaN(n)) { errors[cle] = `${libelle} : nombre attendu.`; return null; }
    if (n < min || n > max) { errors[cle] = `${libelle} : valeur entre ${min} et ${max} attendue.`; return null; }
    if (entier && !Number.isInteger(n)) { errors[cle] = `${libelle} : nombre entier attendu.`; return null; }
    return n;
  };
  const facultatif = (cle, libelle, [min, max]) => {
    const n = lireNombre(r[cle]);
    if (n === null) { nonRenseignes.push(libelle); return null; }
    if (Number.isNaN(n) || n < min || n > max) { errors[cle] = `${libelle} : valeur entre ${min} et ${max} attendue.`; return null; }
    return n;
  };

  const communes = communesValides;
  s.commune = typeof r.commune === 'string' && r.commune ? r.commune : null;
  if (!s.commune) errors.commune = 'Commune : à choisir.';
  else if (communes && !communes.includes(s.commune)) errors.commune = 'Commune : hors de la zone desservie.';
  s.typologie = typeof r.typologie === 'string' && cfg.typologies[r.typologie] ? r.typologie : null;
  if (!s.typologie) errors.typologie = 'Typologie : à choisir.';
  s.surface = requis('surface', 'Surface', b.surface);
  s.loyer = requis('loyer', 'Loyer mensuel hors charges', b.loyerMensuel);
  s.forfaitCharges = requis('forfaitCharges', 'Forfait mensuel de charges', b.forfaitChargesMensuel);
  const d = cfg.cadreLegal.dureeBailMois;
  s.dureeBail = requis('dureeBail', 'Durée moyenne d’un bail (mois)', [d.min, d.max]);
  s.vacance = requis('vacance', 'Vacance entre deux baux (mois)', b.vacanceMois);
  s.chargesAnnuelles = requis('chargesAnnuelles', 'Charges annuelles réelles du logement', b.chargesAnnuelles);
  s.menage = facultatif('menage', 'Ménage par rotation', b.fraisParRotation);
  s.linge = facultatif('linge', 'Linge par rotation', b.fraisParRotation);
  s.kit = facultatif('kit', 'Kit d’accueil et consommables par rotation', b.fraisParRotation);

  // Rémunération Émeraude : mode, valeur et assiette paramétrables ; aucun taux par défaut.
  const rem = r.remuneration || {};
  s.remuneration = { mode: rem.mode, valeur: null, assiette: null, fraisRotation: null, fraisAnnuels: null };
  if (!cfg.remuneration.modes[rem.mode]) errors.remunerationMode = 'Rémunération Émeraude : mode à choisir.';
  else if (rem.mode === 'pourcentage') {
    const n = lireNombre(rem.valeur);
    // 0 % accepté, comme un forfait de 0 € : rémunération éventuellement portée par les frais complémentaires.
    if (n === null || Number.isNaN(n) || n < b.pourcentage[0] || n > b.pourcentage[1]) errors.remunerationValeur = `Rémunération Émeraude : pourcentage entre ${b.pourcentage[0]} et ${b.pourcentage[1]} attendu.`;
    else s.remuneration.valeur = n;
    if (!cfg.remuneration.assiettes[rem.assiette]) errors.remunerationAssiette = 'Rémunération Émeraude : assiette à choisir.';
    else s.remuneration.assiette = rem.assiette;
  } else {
    const n = lireNombre(rem.valeur);
    if (n === null || Number.isNaN(n) || n < 0 || n > b.fraisAnnuels[1]) errors.remunerationValeur = 'Rémunération Émeraude : montant du forfait à renseigner.';
    else s.remuneration.valeur = n;
  }
  for (const [cle, libelle, borne] of [['fraisRotation', 'Frais de mise en place par rotation (Émeraude)', b.fraisParRotation], ['fraisAnnuels', 'Frais fixes annuels (Émeraude)', b.fraisAnnuels]]) {
    const n = lireNombre(rem[cle]);
    if (n === null) continue; // frais complémentaires facultatifs : absents = aucun frais complémentaire convenu
    if (Number.isNaN(n) || n < borne[0] || n > borne[1]) errors['remuneration_' + cle] = `${libelle} : valeur entre ${borne[0]} et ${borne[1]} attendue.`;
    else s.remuneration[cle] = n;
  }

  // Frais de plateforme : choix explicite, y compris « aucun ».
  const pl = r.plateforme || {};
  s.plateforme = { mode: pl.mode, valeur: null };
  if (!cfg.plateforme.modes[pl.mode]) errors.plateformeMode = 'Frais de plateforme : choisir « aucun » ou un mode.';
  else if (pl.mode !== 'aucun') {
    const n = lireNombre(pl.valeur);
    const borne = pl.mode === 'pourcentage_loyer' ? b.pourcentage : b.fraisParRotation;
    if (n === null || Number.isNaN(n) || n < borne[0] || n > borne[1]) errors.plateformeValeur = 'Frais de plateforme : valeur à renseigner.';
    else s.plateforme.valeur = n;
  }

  if (isNum(s.loyer) && isNum(s.forfaitCharges) && isNum(s.chargesAnnuelles) && s.forfaitCharges * 12 > s.chargesAnnuelles && s.chargesAnnuelles >= 0) {
    warnings.push('Le forfait de charges dépasse, sur douze mois, les charges annuelles saisies : vérifiez la répartition des charges ; un forfait ne doit pas être manifestement disproportionné.');
  }
  if (nonRenseignes.length) warnings.push(`Non renseigné(s), donc non déduit(s) : ${nonRenseignes.join(', ')}. Le revenu net est surestimé d’autant.`);
  if (s.remuneration.mode === 'pourcentage' && s.remuneration.assiette === 'loyer_charges') warnings.push('Assiette « loyer et forfait de charges » : la rémunération porte aussi sur des sommes qui compensent des charges.');
  return { ok: Object.keys(errors).length === 0, errors, warnings, saisie: s, nonRenseignes };
}

// Calcul d'un scénario à partir de la saisie validée et des hypothèses (durée effective, vacance effective).
export function calculerScenario(s, hyp, cfg) {
  const d = cfg.cadreLegal.dureeBailMois;
  const dureeBail = Math.min(d.max, Math.max(d.min, s.dureeBail - (hyp.departAnticipeMois || 0)));
  const vacance = Math.max(0, s.vacance + (hyp.vacanceSupplementaireMois || 0));
  const c = cycleMobilite(dureeBail, vacance);
  const revenuLocatifBrut = s.loyer * c.moisLoues;
  const chargesRecuperees = s.forfaitCharges * c.moisLoues;
  const encaisse = revenuLocatifBrut + chargesRecuperees;

  let plateforme = 0;
  if (s.plateforme.mode === 'pourcentage_loyer') plateforme = revenuLocatifBrut * s.plateforme.valeur / 100;
  else if (s.plateforme.mode === 'forfait_bail') plateforme = s.plateforme.valeur * c.rotations;

  const rem = s.remuneration;
  let assiette = null;
  let remunerationBase = 0;
  if (rem.mode === 'pourcentage') {
    assiette = rem.assiette === 'loyer_charges' ? encaisse : revenuLocatifBrut;
    remunerationBase = assiette * rem.valeur / 100;
  } else if (rem.mode === 'forfait_mensuel') remunerationBase = rem.valeur * 12;
  else if (rem.mode === 'forfait_mois_loue') remunerationBase = rem.valeur * c.moisLoues;
  else if (rem.mode === 'forfait_rotation') remunerationBase = rem.valeur * c.rotations;
  const remunerationRotation = (rem.fraisRotation || 0) * c.rotations;
  const remunerationAnnuelle = rem.fraisAnnuels || 0;
  const remuneration = remunerationBase + remunerationRotation + remunerationAnnuelle;

  const parRotation = { menage: s.menage || 0, linge: s.linge || 0, kit: s.kit || 0 };
  const fraisRotation = (parRotation.menage + parRotation.linge + parRotation.kit) * c.rotations;
  const chargesNonCouvertes = s.chargesAnnuelles - chargesRecuperees;
  const fraisEtDepenses = plateforme + fraisRotation + s.chargesAnnuelles;
  const revenuNet = encaisse - s.chargesAnnuelles - plateforme - remuneration - fraisRotation;
  return {
    hypotheses: { dureeBail, vacance, departAnticipeMois: hyp.departAnticipeMois || 0, vacanceSupplementaireMois: hyp.vacanceSupplementaireMois || 0 },
    cycle: c.cycle, rotations: c.rotations, moisLoues: c.moisLoues, moisVacants: c.moisVacants, occupation: c.occupation,
    revenuLocatifBrut, chargesRecuperees, encaisse,
    loyerNonPercuVacance: s.loyer * c.moisVacants,
    frais: { plateforme, menage: parRotation.menage * c.rotations, linge: parRotation.linge * c.rotations, kit: parRotation.kit * c.rotations, rotation: fraisRotation, chargesAnnuelles: s.chargesAnnuelles, total: fraisEtDepenses },
    chargesNonCouvertes,
    remuneration: { assiette, base: remunerationBase, rotation: remunerationRotation, annuelle: remunerationAnnuelle, total: remuneration },
    revenuNet,
    revenuNetMensuelMoyen: revenuNet / 12
  };
}

// Repère de loyer (Carte des loyers, location nue) : affiché à titre indicatif, jamais utilisé dans le calcul.
export function repereLoyer(commune, typologie, surface, cfg, reperes) {
  if (!reperes || !reperes.communes || !commune || !typologie) return { disponible: false, raison: 'Repère indisponible.' };
  const c = reperes.communes[commune];
  const t = cfg.typologies[typologie];
  const r = c && t ? c[t.repere] : null;
  if (!r) return { disponible: false, raison: 'Aucun repère publié pour cette commune et cette typologie : loyer à saisir.' };
  const out = { disponible: true, segment: t.repere, loyerM2: r.loyerM2, basM2: r.basM2, hautM2: r.hautM2, fiabilite: r.fiabilite, maille: r.maille, annonces: r.annoncesCommune, nonMeuble: true };
  if (isNum(surface) && surface > 0) {
    const arr = (x) => Math.round(x / 10) * 10;
    out.mensuelBas = arr(r.basM2 * surface);
    out.mensuelHaut = arr(r.hautM2 * surface);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Loyer conseillé (1.1.0) : calcul automatique à partir des caractéristiques du logement. cfgLoyer = config/mobilite-loyer.json.
//   prix au m² (charges comprises) = base location nue (Carte des loyers) × (1 + écart meublé) × (1 + écart bail mobilité)
//                                    × (1 + somme plafonnée des critères)
//   loyer total conseillé          = prix au m² × surface
//   loyer conseillé hors charges   = loyer total conseillé − forfait de charges choisi par le propriétaire
// Fourchette : intervalle de prédiction à 95 % de la Carte des loyers, ramené à 50 % ou 80 % (erreur log-normale).
const arrondir = (x, pas) => Math.round(x / pas) * pas;

export function segmentLogement(type, pieces) {
  if (type === 'maison') return 'mai';
  if (type === 'appartement' && isNum(pieces)) return pieces <= 2 ? 'app12' : 'app3';
  return null;
}

export function typologieLogement(type, pieces) {
  if (type === 'maison') return 'maison';
  if (type !== 'appartement' || !isNum(pieces)) return null;
  return pieces >= 5 ? 't5' : 't' + Math.max(1, Math.round(pieces));
}

export function estimerLoyerMobilite(lg, cfgLoyer, reperes) {
  const L = cfgLoyer;
  const b = L.bornes;
  const r = lg || {};
  const errors = {};
  const warnings = [];
  const s = {};
  const entier = (cle, libelle, [min, max]) => {
    const n = lireNombre(r[cle]);
    if (n === null) { errors[cle] = `${libelle} : à renseigner.`; return null; }
    if (Number.isNaN(n) || n < min || n > max || !Number.isInteger(n)) { errors[cle] = `${libelle} : nombre entier entre ${min} et ${max} attendu.`; return null; }
    return n;
  };
  s.commune = typeof r.commune === 'string' && r.commune ? r.commune : null;
  const com = s.commune && reperes && reperes.communes ? reperes.communes[s.commune] : null;
  if (!s.commune) errors.commune = 'Commune : à choisir.';
  else if (!com) errors.commune = 'Commune : hors de la zone desservie.';
  s.adresse = typeof r.adresse === 'string' ? r.adresse.trim().slice(0, 200) : '';
  s.type = r.type === 'appartement' || r.type === 'maison' ? r.type : null;
  if (!s.type) errors.type = 'Type de logement : à choisir.';
  const surf = lireNombre(r.surface);
  if (surf === null) errors.surface = 'Surface : à renseigner.';
  else if (Number.isNaN(surf) || surf < b.surface[0] || surf > b.surface[1]) errors.surface = `Surface : valeur entre ${b.surface[0]} et ${b.surface[1]} m² attendue.`;
  else s.surface = surf;
  s.pieces = entier('pieces', 'Nombre de pièces', b.pieces);
  s.chambres = entier('chambres', 'Nombre de chambres', b.chambres);
  s.capacite = entier('capacite', 'Capacité d’accueil', b.capacite);

  // Critères qualitatifs : valeur inconnue ou absente = option neutre par défaut (aucun ajustement), signalée.
  const C = L.criteres;
  const details = [];
  const neutres = [];
  for (const [cle, def] of Object.entries(C.choix)) {
    const choisi = def.options[r[cle]] ? r[cle] : def.defaut;
    if (!def.options[r[cle]]) neutres.push(def.label);
    s[cle] = choisi;
    const [libelle, valeur] = def.options[choisi];
    details.push({ critere: cle, label: def.label, choix: libelle, valeur });
  }
  if (s.type === 'appartement') {
    const E = C.etage;
    const choisi = E.options[r.etage] ? r.etage : E.defaut;
    if (!E.options[r.etage]) neutres.push(E.label);
    s.etage = choisi;
    s.ascenseur = r.ascenseur === true;
    let [libelle, valeur] = E.options[choisi];
    if (choisi === '3plus') { valeur = s.ascenseur ? E.troisPlusAvecAscenseur : E.troisPlusSansAscenseur; libelle += s.ascenseur ? ', avec ascenseur' : ', sans ascenseur'; }
    else if (s.ascenseur) libelle += ', avec ascenseur';
    details.push({ critere: 'etage', label: 'Étage', choix: libelle, valeur });
  } else { s.etage = null; s.ascenseur = null; }
  s.equipements = {};
  for (const [cle, [libelle, valeur]] of Object.entries(C.equipements)) {
    s.equipements[cle] = r.equipements ? r.equipements[cle] === true : false;
    if (s.equipements[cle]) details.push({ critere: cle, label: libelle, choix: 'présent', valeur });
  }
  s.obligatoires = {};
  for (const cle of ['cuisine', 'four', 'microOndes']) s.obligatoires[cle] = r.equipements ? r.equipements[cle] === true : false;
  const brut = details.reduce((t, d) => t + d.valeur, 0);
  const [pmin, pmax] = C.plafond;
  const qualite = Math.min(pmax, Math.max(pmin, brut));

  if (Object.keys(errors).length) return { ok: false, errors, warnings, saisie: s };

  // Contrôles de cohérence : signalés, jamais corrigés à la place du propriétaire.
  if (s.chambres >= s.pieces && s.pieces > 1) warnings.push('Le nombre de chambres paraît élevé au regard du nombre de pièces : vérifiez la saisie.');
  if (s.capacite > 2 * Math.max(1, s.chambres) + 2) warnings.push('La capacité d’accueil paraît élevée au regard du nombre de chambres : elle n’augmente pas le loyer estimé.');
  if (!s.obligatoires.cuisine || !(s.obligatoires.four || s.obligatoires.microOndes)) warnings.push('Équipements minimaux d’un meublé non cochés (cuisine équipée, et four ou micro-ondes : décret n° 2015-981). Un bail mobilité exige un logement meublé complet ; l’estimation suppose qu’il le sera.');
  if (neutres.length) warnings.push(`Critères non précisés, comptés comme neutres (0 %) : ${neutres.join(', ')}.`);
  if (brut !== qualite) warnings.push(`Les critères cumulent ${Math.round(brut * 1000) / 10} % : ajustement plafonné à ${Math.round(qualite * 1000) / 10} %.`);

  const segment = segmentLogement(s.type, s.pieces);
  s.typologie = typologieLogement(s.type, s.pieces);
  const ref = com[segment];
  if (!ref) return { ok: false, errors: { commune: `Aucune référence publiée pour ${com.label} dans la catégorie « ${L.segments[segment].label} » : estimation impossible, une étude d’annonces comparables est nécessaire.` }, warnings, saisie: s };

  const raisons = [];
  if (ref.fiabilite !== 'indicatif') raisons.push('référence communale estimée sur peu d’annonces');
  if (!(ref.annoncesCommune >= L.confiance.minAnnonces)) raisons.push(`moins de ${L.confiance.minAnnonces} annonces dans la commune pour cette catégorie`);
  const [smin, smax] = L.segments[segment].surfaceTypique;
  if (s.surface < smin || s.surface > smax) raisons.push(`surface atypique pour un ${L.segments[segment].label} (repère ${smin} à ${smax} m²)`);
  if (s.type === 'maison') raisons.push('écart meublé / nu mesuré par l’ANIL sur des appartements');
  if (!s.obligatoires.cuisine || !(s.obligatoires.four || s.obligatoires.microOndes)) raisons.push('équipements minimaux du meublé non confirmés');
  const confiance = raisons.length ? 'faible' : 'moyenne';
  if (confiance === 'faible') warnings.push(`Confiance faible : ${raisons.join(' ; ')}. Vérifiez le loyer avec des annonces comparables avant de le proposer.`);

  const meuble = isNum(L.meuble.parCommune[s.commune]) ? L.meuble.parCommune[s.commune] : L.meuble.defaut;
  const mobilite = L.mobilite.valeur;
  const facteur = (1 + meuble) * (1 + mobilite) * (1 + qualite);
  // Intervalle : erreur log-normale ; sigma déduit de l'intervalle à 95 % publié (± 1,96 sigma).
  const sigma = (Math.log(ref.hautM2) - Math.log(ref.basM2)) / (2 * 1.959964);
  const z = L.confiance.zFourchette[confiance];
  const m2CC = ref.loyerM2 * facteur;
  const m2CCbas = m2CC * Math.exp(-z * sigma);
  const m2CChaut = m2CC * Math.exp(z * sigma);
  const pas = L.arrondiEuros;
  const totalCC = arrondir(m2CC * s.surface, pas);
  const totalCCbas = arrondir(m2CCbas * s.surface, pas);
  const totalCChaut = arrondir(m2CChaut * s.surface, pas);

  const forfait = lireNombre(r.forfaitCharges);
  const out = {
    ok: true, saisie: s, warnings, segment, segmentLabel: L.segments[segment].label, confiance, raisonsConfiance: raisons,
    base: { loyerM2: ref.loyerM2, basM2: ref.basM2, hautM2: ref.hautM2, annonces: ref.annoncesCommune, fiabilite: ref.fiabilite, commune: com.label },
    coefficients: { meuble, mobilite, qualite, qualiteBrute: brut, facteur, details },
    m2CC, m2CCbas, m2CChaut, totalCC, totalCCbas, totalCChaut,
    forfait: isNum(forfait) && forfait >= 0 ? forfait : null,
    conseilleHC: null, basHC: null, hautHC: null, m2HC: null
  };
  if (out.forfait !== null) {
    out.conseilleHC = totalCC - out.forfait;
    out.basHC = totalCCbas - out.forfait;
    out.hautHC = totalCChaut - out.forfait;
    out.m2HC = out.conseilleHC / s.surface;
    if (!(out.basHC > 0)) return { ok: false, errors: { forfaitCharges: 'Forfait de charges : supérieur ou égal au loyer total conseillé (bas de fourchette).' }, warnings, saisie: s };
  }
  return out;
}

export function estimerMobilite(raw, cfg, reperes = null, cfgLoyer = null) {
  // 1.1.0 : si raw.logement est fourni, le loyer est calculé (ou remplacé par raw.loyerPersonnalise) ; sinon, raw.loyer
  // saisi est utilisé comme en 1.0.0 (contrat inchangé).
  let loyer = null;
  if (raw && raw.logement && cfgLoyer) {
    const est = estimerLoyerMobilite({ ...raw.logement, forfaitCharges: raw.forfaitCharges }, cfgLoyer, reperes);
    const perso = lireNombre(raw.loyerPersonnalise);
    const sl = est.saisie || {};
    const derive = { ...raw, commune: sl.commune, typologie: sl.typologie, surface: sl.surface, loyer: perso !== null ? raw.loyerPersonnalise : (est.ok ? est.conseilleHC : null) };
    loyer = { estimation: est, source: perso !== null ? 'personnalise' : 'estimation', ecartPersonnalise: perso !== null && est.ok && isNum(est.conseilleHC) && !Number.isNaN(perso) ? perso - est.conseilleHC : null };
    const v0 = validerSaisieMobilite(derive, cfg, reperes && reperes.communes ? Object.keys(reperes.communes) : null);
    if (!est.ok || !v0.ok) {
      const errors = { ...v0.errors };
      // Erreurs du logement à la place des erreurs dérivées (commune, typologie, surface, loyer).
      for (const k of ['commune', 'typologie', 'surface']) delete errors[k];
      if (perso === null || !est.ok) delete errors.loyer;
      if (perso !== null && v0.errors.loyer) errors.loyerPersonnalise = 'Loyer personnalisé : ' + v0.errors.loyer.split(' : ').slice(1).join(' : ');
      for (const [k, m] of Object.entries(est.errors || {})) errors[k === 'forfaitCharges' ? 'forfaitCharges' : 'logement_' + k] = m;
      return { ok: false, errors, warnings: [...(est.warnings || []), ...v0.warnings], loyer, engineVersion: MOBILITE_ENGINE_VERSION };
    }
    raw = derive;
  }
  const v = validerSaisieMobilite(raw, cfg, reperes && reperes.communes ? Object.keys(reperes.communes) : null);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, engineVersion: MOBILITE_ENGINE_VERSION };
  const s = v.saisie;
  const hypotheses = (raw && raw.hypotheses) || {};
  const scenarios = {};
  for (const id of SCENARIOS_MOBILITE) {
    const base = cfg.scenarios[id];
    const h = hypotheses[id] || {};
    const pick = (k) => (isNum(lireNombre(h[k])) ? lireNombre(h[k]) : base[k]);
    scenarios[id] = { id, label: base.label, description: base.description, ...calculerScenario(s, { departAnticipeMois: Math.max(0, pick('departAnticipeMois')), vacanceSupplementaireMois: pick('vacanceSupplementaireMois') }, cfg) };
  }
  const warnings = (loyer && loyer.source === 'estimation' ? loyer.estimation.warnings : []).concat(v.warnings);
  if (loyer && loyer.source === 'personnalise') warnings.unshift(cfgLoyer.texts.personnalise);
  if (scenarios.central.revenuNet < 0) warnings.push('Revenu net négatif dans le scénario central : les charges et les frais dépassent les loyers perçus.');
  return {
    ok: true,
    engineVersion: MOBILITE_ENGINE_VERSION,
    configVersion: cfg.version,
    saisie: s,
    nonRenseignes: v.nonRenseignes,
    warnings,
    scenarios,
    repere: repereLoyer(s.commune, s.typologie, s.surface, cfg, reperes),
    ...(loyer ? { loyer: { ...loyer, utilise: s.loyer } } : {})
  };
}
