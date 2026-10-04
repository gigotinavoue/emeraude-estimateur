// Réplique EXACTE du calcul de l'Embed v1 (legacy/embed-v1-backup.html, fonction calculate()).
// Ne pas modifier : sert uniquement à la comparaison ancien / nouveau moteur.
// La parité avec le script d'origine est vérifiée par tests/legacy.parity.test.mjs.

export const LEGACY_MARKETS = {
  'Rennes': [68, 0.66, '1 451 annonces'],
  'Cesson-Sévigné': [74, 0.57, '105 annonces'],
  'Saint-Grégoire': [86, 0.55, '48 annonces'],
  'Chantepie': [62, 0.58, '67 annonces'],
  'Bruz': [77, 0.57, '133 annonces'],
  'Pacé': [86, 0.61, '37 annonces'],
  'Betton': [90, 0.58, '29 annonces'],
  'Saint-Jacques-de-la-Lande': [79, 0.58, '157 annonces'],
  'Vezin-le-Coquet': [147, 0.53, '45 annonces'],
  'Chartres-de-Bretagne': [68, 0.54, '33 annonces'],
  'Châteaubourg': [66, 0.56, '46 annonces'],
  'Liffré': [100, 0.57, '44 annonces'],
  'Vitré': [60, 0.61, '113 annonces'],
  'Saint-Aubin-du-Cormier': [107, 0.45, '21 annonces'],
  'Saint-Malo': [117, 0.62, '1 986 annonces'],
  "Val-d'Izé": [90, 0.63, '12 annonces']
};

export const LEGACY_EQ = [
  ['Fibre / Wi-Fi haut débit', 0.015, 0.01], ['TV connectée', 0.01, 0.005], ['Balcon', 0.04, 0.01], ['Terrasse / extérieur', 0.07, 0.015],
  ['Vue dégagée / agréable', 0.04, 0.01], ['Parking privé', 0.06, 0.02], ['Parking facile à proximité', 0.02, 0.005], ['Ascenseur', 0.02, 0.005],
  ['Climatisation', 0.03, 0.01], ['Chauffage performant', 0.01, 0.005], ['Cuisine équipée', 0.02, 0.005], ['Four', 0.005, 0.002],
  ['Micro-ondes', 0.005, 0.002], ['Lave-vaisselle', 0.02, 0.005], ['Lave-linge', 0.015, 0.005], ['Sèche-linge', 0.015, 0.003],
  ['Machine à café', 0.01, 0.002], ['Bouilloire', 0.003, 0.001], ['Grille-pain', 0.003, 0.001], ['Réfrigérateur / congélateur', 0.005, 0.001],
  ['Plaques de cuisson', 0.005, 0.001], ['Literie premium', 0.04, 0.01], ['Canapé convertible', 0.02, 0.005], ['Espace de travail', 0.02, 0.01],
  ['Équipement bébé', 0.01, 0.002], ['Sèche-cheveux', 0.003, 0.001], ['Fer + table à repasser', 0.003, 0.001], ['Draps et serviettes inclus', 0.005, 0.002],
  ['Serrure connectée / entrée autonome', 0.025, 0.015], ['Logement rénové / décoration soignée', 0.07, 0.025], ['Calme / bonne isolation phonique', 0.03, 0.01], ['Check-in flexible', 0.015, 0.01]
];

// i = { city, type, bed, bath, area, guest, months, loc, commission, cleaningFee, stayLength, eq: [indices] }
// Les saisies sont traitées comme dans l'Embed : `+valeur || défaut`.
export function legacyCalculate(i) {
  const m = LEGACY_MARKETS[i.city];
  const type = i.type;
  const bed = +i.bed || 0;
  const bath = +i.bath || 1;
  const area = +i.area || 10;
  const guest = +i.guest || 1;
  const months = Math.min(12, Math.max(1, +i.months || 1));
  const loc = i.loc;
  const comm = Math.min(50, Math.max(0, +i.commission || 0));
  const cleaningFee = Math.max(0, +i.cleaningFee || 0);
  const stayLength = Math.min(30, Math.max(1, +i.stayLength || 1));

  const ta = { Studio: 0, T1: 0.03, T2: 0.10, T3: 0.22, 'T4+': 0.38, Maison: 0.35 }[type] || 0;
  const to = { Studio: 0, T1: 0, T2: 0.01, T3: 0.02, 'T4+': 0.02, Maison: 0.02 }[type] || 0;
  const la = { Hypercentre: 0.15, 'Très central': 0.10, Central: 0.06, 'Quartier recherché': 0.03, Standard: 0, 'Périphérie': -0.08 }[loc] || 0;
  const lo = { Hypercentre: 0.04, 'Très central': 0.03, Central: 0.02, 'Quartier recherché': 0.01, Standard: 0, 'Périphérie': -0.03 }[loc] || 0;

  let ea = 0;
  let eo = 0;
  for (const idx of i.eq || []) {
    ea += LEGACY_EQ[+idx][1];
    eo += LEGACY_EQ[+idx][2];
  }

  const aa = Math.max(-0.05, Math.min(0.08, (area - 35) * 0.0025));
  const ca = Math.max(-0.03, Math.min(0.12, (guest - 2) * 0.025));
  const ba = Math.max(-0.02, Math.min(0.06, (bath - 1) * 0.03));
  const bea = Math.max(-0.03, Math.min(0.10, (bed - 1) * 0.04));

  const adr = Math.round(m[0] * (1 + ta + la + ea + aa + ca + bea + ba));
  const occ = Math.max(0.40, Math.min(0.88, m[1] + to + lo + eo + ca / 2 + bea / 2));
  const avail = months * 365 / 12;

  const lowAdr = adr * 0.90;
  const midAdr = adr;
  const highAdr = adr * 1.10;
  const lowOcc = Math.max(0.35, occ - 0.10);
  const midOcc = occ;
  const highOcc = Math.min(0.92, occ + 0.07);
  const lowCA = lowAdr * avail * lowOcc;
  const midCA = midAdr * avail * midOcc;
  const highCA = highAdr * avail * highOcc;

  const airbnbRate = 0.155;
  const airbnb = midCA * airbnbRate;
  const netAfterAirbnb = midCA - airbnb;
  const conc = netAfterAirbnb * comm / 100;
  const owner = netAfterAirbnb - conc;
  const occupiedNights = midCA > 0 ? midCA / midAdr : 0;
  const stays = Math.max(0, Math.round(occupiedNights / stayLength));
  const cleaningCollected = stays * cleaningFee;

  return {
    adr: midAdr, occ, avail, occupiedNights,
    annual: midCA, monthly: midCA / months, airbnb, netAfterAirbnb, concierge: conc, owner,
    stays, cleaningCollected,
    low: { adr: lowAdr, occ: lowOcc, ca: lowCA },
    mid: { adr: midAdr, occ: midOcc, ca: midCA },
    high: { adr: highAdr, occ: highOcc, ca: highCA }
  };
}
