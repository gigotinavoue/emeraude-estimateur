# Revue finale du modèle — moteur 1.2.0

Date : 4 octobre 2026. Revue en lecture seule : **aucune modification du moteur, de la configuration, de Framer ni de l'Embed de production ; aucune publication.**

Reproduction : `node scripts/audit/final-review.mjs` ; résultats dans `reports/revue-finale-data.json`.

Tests : **94 / 94** réussis, dont 6 nouveaux tests de revue (`tests/final-review.test.mjs`) qui verrouillent les propriétés ci-dessous.

## 1. Rennes T2 standard vs T2 hypercentre rénové

Logements comparés (exemples 1.2.0) :
- **A** : T2 40 m², 2 voyageurs, emplacement standard, sans équipement ;
- **B** : T2 45 m², 2 voyageurs, hypercentre, rénové + serrure connectée.

Tous deux : 10 mois, ménage 40 €, séjour 3 nuits (marché).

| Composante | A | B | Effet |
|---|---|---|---|
| Marché observé (Rennes Métropole 2024) | 80 € / 49 % | identique | — |
| Recalage vers le 1 chambre (mélange urbain) | −14,4 % prix, +1,1 pt | identique | — |
| Chambres (1) | ×1,00 | ×1,00 | — |
| Surface | 40 m² = typique → 0 | 45 m² → +1,5 % | prix ×1,015 |
| Capacité (2 = typique) | 0 | 0 | — |
| Emplacement | Standard → 0 | Hypercentre → +10 % prix, +3 pts | prix ×1,10 ; occupation +3 pts |
| Équipements | aucun | Rénové +4 % / +1 pt ; serrure +1 % / +1 pt | prix ×1,05 ; occupation +2 pts |
| Mois | 10 (mode nombre) | 10 | identique |
| Saisonnalité | profil urbain | profil urbain | identique |
| **Prix moyen par nuit** | **68,5 €** | **80,3 €** | **×1,172** (1,10 × 1,015 × 1,05) |
| **Occupation** | **50,1 %** | **55,1 %** | **+5,0 pts** (×1,0998) |
| **CA des nuits** | **10 427 €** | **13 445 €** | **×1,289** = 1,172 × 1,0998 |

**Le rapport observé (×1,2894) est égal au produit des effets attendus** (test R1, écart < 10⁻⁹). Marché, base de référence, saisonnalité et nombre de mois sont strictement identiques. **Aucun changement involontaire du moteur n'explique l'écart.** L'incertitude est la même (±7 %) car les deux logements sont standard.

## 2. Logement de référence Émeraude

Rennes, T2, 40 m², 1 chambre, 1 salle de bain, 2 voyageurs, hypercentre, rénové, 10 mois. Équipements standards = les 13 « essentiels » (sans effet dans la V2) + rénové. Commission 20 %, ménage 40 €, séjour 3 nuits, TVA non appliquée.

| | A. Ancien moteur | B. V2 initiale | C. V2 calibrée (1.1.0) | D. V2 1.2.0 |
|---|---|---|---|---|
| Prix moyen par nuit | 97 € | 88,8 € | 78,3 € | 78,3 € (affiché ≈ 78 €) |
| Occupation | 77,2 % | 53,0 % | 54,1 % | 54,1 % |
| Nuits disponibles | 304 | 304 | 304 | 304 |
| Nuits réservées | 235 | 161 | 164 | 164 |
| CA des nuits | 22 777 € | 14 311 € | 12 882 € | **≈ 12 900 €** |
| Frais Airbnb (15,5 % HT, nuits) | 3 530 € | 2 218 € | 1 997 € | ≈ 2 000 € |
| Revenu net avant commission | 19 247 € | 12 093 € | 10 885 € | ≈ 10 900 € |
| Commission Émeraude (20 %) | 3 849 € | 2 419 € | 2 177 € | ≈ 2 180 € |
| **Revenu propriétaire** | 15 397 € | 9 674 € | 8 708 € | **≈ 8 700 €** (8 100 – 9 300 €) |
| Fourchette (CA des nuits) | — | — | — | **12 000 – 13 800 € (±7 %)** |
| Confiance | — | — | — | **MEDIUM** : « Données de marché datant de 21 mois » ; **HIGH** avec des données de moins de 15 mois |
| Ménage collecté (séparé) | 3 120 € | 2 160 € | 2 200 € | ≈ 2 200 € |

Lecture :
- **A → B** : base de marché publiée (occupation 49 % au lieu de 66 %), plafonds sur les équipements, essentiels sans effet.
- **B → C** : recalage du mélange de tailles et suppression de la pénalité de capacité.
- **C → D** : montants identiques au centime (test R2) ; la version 1.2.0 ajoute arrondis, fourchette et confiance.

## 3. Fraîcheur des données — recherche au 4 octobre 2026

| Source | Publication la plus récente | Contenu utile au modèle | Utilisable comme nouvelle base ? |
|---|---|---|---|
| Ille & Vilaine Tourisme — bilan « hébergements locatifs » (par intercommunalité) | **2024** (publié en avril 2025). **Aucune édition 2025 en ligne** | Prix, occupation, nuits, séjour par intercommunalité | Base actuelle, inchangée |
| Ille & Vilaine Tourisme — **« Chiffres clés 2025 » (édition 2026, juin 2026)** | 2025 | Fréquentation 2025 et panorama des modes d'hébergement, à l'échelle départementale. **Texte non extractible automatiquement** (PDF de 11 Mo) ; contenu exact sur les meublés non vérifié | **À vérifier manuellement**. Probablement départemental, donc pas un remplacement des bases par intercommunalité |
| AUDIAR — Observatoire du tourisme, **bilan 2025** (juillet 2026) | 2025, Rennes Métropole | 2 360 annonces actives / mois (stable vs 2 400 en 2024), dont 1 710 logements entiers ; nuitées marchandes −6 % sur 10 mois ; ~1 900 meublés déclarés (1 500 à Rennes) ; taxe de séjour plateformes 703 591 € (+3 %). **Aucun prix moyen ni taux d'occupation des meublés** | Non : contexte et tendance uniquement. Licence non précisée |
| Eurostat (`tour_ce_oarc`) | 2025 | Rennes : 225 633 nuits louées (−6,3 % vs 2024), séjour moyen 2,98 nuits | Déjà utilisé en contrôle ; pas de prix |
| Insee (hôtellerie) | Mai 2026 | Saisonnalité urbaine | Déjà utilisé |
| Saint-Malo Agglomération, Vitré Communauté, Liffré-Cormier | — | Aucune publication ouverte trouvée sur les prix ou l'occupation des meublés | — |

**Conclusion** : **aucune donnée 2025 de prix et d'occupation des meublés par intercommunalité n'est disponible** en source libre au 4 octobre 2026. La base 2024 reste la plus fiable. Les signaux 2025 (Eurostat −6 % de nuits à Rennes ; AUDIAR offre stable) sont cohérents avec le scénario prudent, mais ne justifient pas de modifier la base. Rien n'a été remplacé.

**À faire manuellement** : ouvrir « Chiffres clés 2025 » (lien ci-dessous) et vérifier s'il contient, pour les locations meublées, un prix moyen et un taux d'occupation 2025 par intercommunalité. Si c'est le cas, il pourra alimenter la procédure annuelle (`data/raw/adt35/`).
https://www.ille-et-vilaine-tourisme.bzh/app/uploads/bretagne-35/2026/06/2025_Chiffres-Cles.pdf

## 4. Niveau de confiance selon l'âge des données (test R3)

Fraîcheur = mois écoulés depuis la **fin de la période** couverte (31/12 pour une année).

| Âge | Fraîcheur | Effet | Exemple : données 2024 | Exemple : données 2025 |
|---|---|---|---|---|
| ≤ 15 mois | verte | **HIGH possible** (si aucun autre facteur) | jusqu'au 31/03/2026 | jusqu'au 31/03/2027 |
| > 15 et ≤ 27 mois | orange | **MEDIUM au plus** (+2 % d'incertitude) | 01/04/2026 → 31/03/2027 | 01/04/2027 → 31/03/2028 |
| > 27 mois | rouge | **LOW** (règle impérative, +6 %) | à partir d'avril 2027 | à partir d'avril 2028 |

**HIGH n'est pas théorique.** Dès qu'une base de moins de 15 mois est fournie, Rennes T2, Rennes T3 et le logement de référence passent en HIGH (tests U1, U2, R2, R3).

Contrainte pratique : la publication intervient environ 4 mois après la fin de l'année (bilan 2024 publié en avril 2025). La fenêtre HIGH dure donc environ 11 mois par an, si la publication est à l'heure.

## 5. Fourchettes (test R4)

| Logement | Central | Fourchette | ± | Confiance (réelle / données récentes) | Largeur |
|---|---|---|---|---|---|
| Rennes T2 standard | 10 400 € | 9 700 – 11 200 € | 7 % | MEDIUM / HIGH | 14 % |
| Rennes T2 hypercentre rénové (référence) | 12 900 € | 12 000 – 13 800 € | 7 % | MEDIUM / HIGH | 14 % |
| Rennes T3 | 14 500 € | 13 500 – 15 500 € | 7 % | MEDIUM / HIGH | 14 % |
| Saint-Malo T2 | 12 900 € | 11 300 – 14 400 € | 12 % | MEDIUM / MEDIUM | 24 % |
| Saint-Malo T3 | 17 900 € | 15 700 – 20 000 € | 12 % | MEDIUM / MEDIUM | 24 % |
| Vitré T2 | 10 400 € | 9 600 – 11 200 € | 8 % | MEDIUM / MEDIUM | 15 % |
| Bruz T2 | 10 400 € | 9 600 – 11 300 € | 8 % | MEDIUM / MEDIUM | 16 % |
| Betton T2 | 10 400 € | 9 600 – 11 300 € | 8 % | MEDIUM / MEDIUM | 16 % |

Vérifié :
- **aucune borne négative** ;
- **largeur ≤ 2 × plafond (50 %)**, en pratique 14 à 24 % ;
- **les logements plus incertains ont une fourchette plus large** : côtier ±12 % > petit marché et communes signalées ±8 % > Rennes standard ±7 %.

Le Saint-Malo T3 (2 chambres) n'est pas « grand » (le seuil est de 3 chambres) : sa fourchette est celle du profil côtier.

## 6. Frais Airbnb, commission et ménage (test R5)

Logement de référence :

```
CA brut des nuits                                  12 882 €
− Frais Airbnb sur les nuits (15,5 % HT)          − 1 997 €
= Revenu net avant commission Émeraude             10 885 €
− Commission Émeraude (20 % de ce net, D2)        − 2 177 €
= Revenu propriétaire final                         8 708 €   (affiché ≈ 8 700 €, fourchette 8 100 – 9 300 €)

Ménage (flux séparé) : 2 200 € collectés − 341 € de frais Airbnb (à la charge d'Émeraude, D1) = 1 859 € pour Émeraude
```

- Chaîne exacte au centime.
- Faire varier le ménage de 0 à 200 € ne modifie ni le CA des nuits, ni la commission, ni le revenu propriétaire : **aucun double comptage**.
- TVA sur les frais Airbnb : option séparée, désactivée par défaut (D3).

**Remarque de présentation (non bloquante, non modifiée)** : dans l'interface V2, la tuile « Ménages collectés » est placée entre « Commission » et « Revenu propriétaire ». Les montants sont justes, mais on pourrait croire que le ménage fait partie de la chaîne. Il serait plus clair de la placer à part, avec la mention « collectés séparément ». C'est une retouche d'affichage, à faire avec votre accord.

## 7. Contrôles de cohérence (test R6) — tous satisfaits

| Propriété | Résultat |
|---|---|
| Qualité croissante → revenu non décroissant | 10 427 ≤ 10 636 ≤ 11 699 € |
| T2 → T3 : prix par nuit en hausse | 68,5 → 99,3 € (×1,45) |
| Capacité 2 → 3 → 4 (T2) : revenu non décroissant | 10 427 ≤ 11 053 ≤ 11 679 € |
| Chambres croissantes : prix et revenu croissants | 9 063 < 10 427 < 14 516 < 16 208 < 21 902 € |
| Standard → hypercentre : prix non décroissant | 68,5 → 75,3 € |
| Ajout « rénové » : prix non décroissant | 68,5 → 71,2 € |
| Moins de mois (nombre) : CA en baisse, prix par nuit inchangé | CA 12 513 → 8 342 € ; prix 68,49 → 68,49 € |
| Mois choisis (sans juillet-août) : variation du prix par nuit due à la seule saisonnalité | −2,5 % (juillet-août sont des mois chers en profil urbain) |
| Ordre prudent ≤ réaliste ≤ performant | 8 logements sur 8 |

## 8. Verdict

Voir la réponse de synthèse. Aucun problème bloquant n'a été trouvé ; le moteur n'a pas été modifié.
