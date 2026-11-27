// Parcours bail mobilité : construit data/mobilite/reperes-loyers.json à partir des fichiers de la Carte des loyers 2025
// déjà présents dans data/raw/carte-loyers/ (lecture seule, aucun téléchargement, aucune donnée Lighthouse ni AirROI).
// Les valeurs publiées concernent la location NUE à l'année : elles servent de repère indicatif, jamais au calcul.
// Fiabilité : « indicatif » si la commune a sa propre estimation (TYPPRED = commune) et au moins 30 annonces ;
// sinon « faible » (estimation de maille, peu d'annonces). Aucune majoration « meublé » n'est appliquée.
import { readJson, writeJson } from './lib/util.mjs';
import { readRents } from './audit/rent-index.mjs';

const MIN_ANNONCES = 30;
const round2 = (x) => Math.round(x * 100) / 100;
const num = (s) => Number(String(s).replace(',', '.'));

export function buildReperes() {
  const communes = readJson('config/communes.json').communes.filter((c) => c.active);
  const kinds = { app12: readRents('app12'), app3: readRents('app3'), mai: readRents('mai') };
  const out = {
    schemaVersion: 1,
    source: {
      id: 'carte_loyers',
      label: 'Carte des loyers 2025 (ANIL / ministère du Logement)',
      url: 'https://www.data.gouv.fr/fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/',
      licence: 'Licence Ouverte Etalab 2.0',
      periode: 'Annonces SeLoger et leboncoin publiées jusqu’au 30/09/2025',
      recupereLe: '2026-10-04'
    },
    definition: 'Loyer d’annonce prédit au m², charges comprises, logement NON meublé loué à l’année, avec intervalle de prédiction à 95 %. Repère indicatif : ce n’est ni un loyer meublé, ni un loyer de bail mobilité.',
    meuble: { donnees: null, note: 'Aucune source publique fiable de loyers meublés par commune et par typologie n’a été identifiée : loyer à saisir.' },
    dureeBail: { donnees: null, note: 'Aucune statistique publique de durée moyenne des baux mobilité par commune n’a été identifiée : durée à saisir.' },
    vacance: { donnees: null, note: 'Aucune statistique publique de vacance entre deux baux mobilité n’a été identifiée : vacance à saisir.' },
    communes: {}
  };
  for (const c of communes) {
    const e = { insee: c.insee, label: c.label };
    for (const [k, table] of Object.entries(kinds)) {
      const r = table[c.insee];
      if (!r || !(r.loypredm2 > 0)) { e[k] = null; continue; }
      const maille = r.TYPPRED === 'commune' ? 'commune' : 'maille';
      e[k] = {
        loyerM2: round2(r.loypredm2), basM2: round2(num(r['lwr.IPm2'])), hautM2: round2(num(r['upr.IPm2'])),
        maille, annoncesCommune: r.nbobs_com,
        fiabilite: maille === 'commune' && r.nbobs_com >= MIN_ANNONCES ? 'indicatif' : 'faible'
      };
    }
    out.communes[c.id] = e;
  }
  return out;
}

if (process.argv[1].endsWith('build-mobilite-reperes.mjs')) {
  const r = buildReperes();
  writeJson('data/mobilite/reperes-loyers.json', r);
  console.log(`data/mobilite/reperes-loyers.json : ${Object.keys(r.communes).length} communes`);
}
