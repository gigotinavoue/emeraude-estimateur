// Forfait ménage indicatif par séjour, calculé depuis la grille config/forfait-menage.json.
// Fonction pure : elle produit une valeur transmise au moteur comme frais de ménage ; elle ne calcule aucun flux financier.
// Linge, consommables, coût des prestataires et marge interne n'entrent pas dans ce calcul.

function nombre(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  return s !== '' && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

function palierMaison(surface, paliers) {
  return paliers.find((x) => x.surfaceLimite === null || (x.limiteIncluse ? surface <= x.surfaceLimite : surface < x.surfaceLimite));
}

// Renvoie le forfait en euros, ou null si le logement est incomplet (le moteur signale alors le champ concerné).
export function estimerForfaitMenage(logement, grille) {
  const surface = nombre(logement.area);
  const chambres = nombre(logement.bedrooms);
  const sallesDeBain = nombre(logement.bathrooms);
  const capacite = nombre(logement.guests);
  if (surface === null || chambres === null || sallesDeBain === null || capacite === null) return null;

  if (logement.isHouse) {
    const m = grille.maison;
    const palier = palierMaison(surface, m.paliers);
    const supplement = Math.min(m.plafondSupplements, Math.floor(Math.max(0, sallesDeBain - palier.sallesDeBainReference)) * m.supplementSalleDeBain);
    return Math.min(m.plafondForfait, palier.forfait + supplement);
  }

  const a = grille.appartement;
  const base = a.bases.filter((x) => chambres >= x.chambresMin).pop();
  const s = a.supplements;
  const surfaceSup = Math.min(s.surface.plafond, Math.floor(Math.max(0, surface - base.surfaceReference) / s.surface.trancheM2) * s.surface.montant);
  const bainSup = Math.floor(Math.max(0, sallesDeBain - s.salleDeBain.reference)) * s.salleDeBain.montant;
  const capaciteSup = capacite - base.capaciteReference >= s.capacite.ecartMin ? s.capacite.montant : 0;
  return base.forfait + Math.min(s.plafondTotal, surfaceSup + bainSup + capaciteSup);
}
