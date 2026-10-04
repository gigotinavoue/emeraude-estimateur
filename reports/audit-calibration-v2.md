# Audit et calibration du modèle V2 — phase 4

Date : 4 octobre 2026 · moteur 1.1.0 · configuration `2026-10-v2-calibration` (la configuration précédente est archivée dans `config/history/config-2026-10-v1.json`).

Rien n'a été modifié dans Framer ni publié sur /estimateur. Aucun coefficient n'a été changé parce qu'il « semblait » trop haut ou trop bas : chaque changement ci-dessous s'appuie sur une donnée publique gratuite ou sur un double comptage démontré par un test.

## Synthèse

- **Ce qui change** :
  - la courbe par nombre de chambres, devenue plus pentue (les grands logements étaient sous-estimés) ;
  - la capacité typique par taille et l'effet d'un voyageur supplémentaire ;
  - trois doubles comptages supprimés (bonus maison, canapé convertible, salle de bain typique) ;
  - **un recalage de la moyenne de marché vers le logement de référence**.
- **Effet global** sur la batterie de 25 logements représentatifs des 16 communes : CA des nuits **−9 % en moyenne par rapport à la V2 initiale**, **−37 % par rapport à l'ancien outil**.
  - Les petits logements baissent (−9 à −10 % à Rennes, −18 à −19 % à Saint-Malo).
  - Les grands appartements montent (T5 4 ch. +7 %).
  - Les maisons baissent (−8 à −12 %) : bonus maison supprimé et occupation des grandes tailles plus basse.
- **Ce qui reste incertain** : le mélange de tailles de Saint-Malo, l'écart de niveau entre communes d'une même intercommunalité, l'occupation des logements très performants, et la définition des données Lighthouse (frais de ménage, nuits bloquées).
- **Tests** : 55 sur 55 réussis, dont 11 nouveaux tests de double comptage et d'aberration.

## Sources examinées

| Source | Date | Territoire | Définition | Licence / réutilisation | Fiabilité | Usage retenu |
|---|---|---|---|---|---|---|
| Ille & Vilaine Tourisme, bilan hébergements locatifs (Lighthouse) | 2024, publié avril 2025 | EPCI, département (mensuel) | Logements entiers Airbnb / Abritel / Booking : occupation, prix moyen par jour, nuits, durée de séjour | Non précisée (citation de chiffres agrégés) | Élevée sur le niveau ; définitions ménage et nuits bloquées non précisées | **Inchangé : base de marché** |
| Eurostat `tour_ce_oarc`, `tour_ce_omn12` | 2025 / 2026 | Rennes, Bretagne | Séjours, nuits louées, nuitées via 4 plateformes | Réutilisation libre avec mention | Élevée (données des plateformes) | Inchangé : contrôles (séjour moyen Rennes 2,98 nuits ≈ 3,0 Lighthouse) |
| Insee Melodi `DS_TOUR_FREQ` | 2025 | Ille-et-Vilaine | Occupation hôtelière mensuelle | Licence Ouverte 2.0 | Élevée, mais ce sont des hôtels | Inchangé : saisonnalité urbaine (approximation) |
| **Inside Airbnb** (nouveau) | Juin 2026 | Lyon (2 944 logements), Bordeaux (4 356), Pays basque (5 528) | Logements entiers actifs, < 30 nuits min. ; prix affichés, occupation estimée par le projet | **CC BY 4.0** ; le projet demande de ne pas republier et d'agir dans l'esprit de sa mission (logement) | Moyenne : prix affichés (pas réalisés), occupation modélisée, villes hors zone | **Rapports de structure uniquement** (écarts entre tailles, capacité typique, mélange de tailles). Aucune donnée brute stockée ni republiée |
| **Carte des loyers 2025** (nouveau) | Annonces jusqu'au 30/09/2025 | 16 communes | Loyer d'annonce au m², location nue, T1-T2 / T3+ / maison | Licence Ouverte 2.0 | Élevée pour les loyers ; lien avec la location courte durée non établi | **Audit uniquement** (sensibilité communale, non appliquée) |
| AUDIAR, observatoire du tourisme 2024 | 2024 | Rennes Métropole | Hôtellerie mensuelle, annonces actives (AirDNA cité) | Non précisée | Moyenne | Information : Rennes = 3/4 des annonces de logements entiers de la métropole (sert à la pondération de la sensibilité communale) |
| Tourisme Bretagne, bilan 2024 | 2024 | Bretagne | Totaux régionaux | Non précisée | — | Aucune ventilation par taille ou par mois : non utilisable |
| Airbnb (frais) | Bascule au 13/10/2026 | France | Frais hôte unique 15,5 % HT | Information publique (sources de presse concordantes) | Élevée | Confirme 15,5 % ; voir l'incertitude sur le niveau de prix 2024 |

**Écartées** : AirROI et AirDNA (conditions d'utilisation), collecte des annonces Airbnb, API Meublés (réservée aux collectivités).

**Inside Airbnb, point de vigilance** : la licence CC BY 4.0 autorise un usage commercial avec mention de la source. Le projet demande toutefois de ne pas republier les données et d'en faire un usage cohérent avec sa mission. Nous n'utilisons que des ratios agrégés, avec mention dans la méthodologie. **Décision à confirmer par vous (D10).**

## 1. Coefficients conservés

| Coefficient | Valeur | Nature | Raison |
|---|---|---|---|
| Base de marché par EPCI (prix, occupation, séjour) | Lighthouse 2024 | Donnée de marché | Aucune source gratuite plus fiable ou plus fine. La Carte des loyers (2025) n'a pas été substituée : plus récente mais mesure autre chose (location nue) |
| Surface | ±0,3 %/m² autour de la surface typique, plafond ±6 % | Hypothèse | Pas de donnée gratuite sur la surface en location courte durée. Surfaces typiques cohérentes avec la Carte des loyers (T1-T2 = 37 m², T3+ = 72 m²) |
| Emplacement | hypercentre +10 % / +3 pts … périphérie −6 % / −3 pts ; défaut « Standard » | Hypothèse | Aucune donnée publique infra-communale. À taille égale, la dispersion des prix entre médiane et quartile supérieur est de ×1,20 à ×1,33 : les bornes de l'emplacement restent dans cet intervalle |
| Équipements (hors canapé) | essentiels 0 ; confort 0,5–1 % ; atouts 1–4 % ; plafond +10 % / +3 pts ; exclusivités | Hypothèse | Aucune source gratuite ne mesure l'effet causal d'un équipement |
| Garde-fous | multiplicateur de prix [0,85 ; 1,25] ; occupation [25 % ; 80 %] et ±10 pts ; 90 %/mois | Garde-fou | Le plafond ×1,25 correspond au quartile supérieur des prix à taille égale (×1,20 à ×1,33) |
| Saisonnalité | Urbain : Insee hôtels 2025 + prix Lighthouse amorti ×0,5 ; littoral : Lighthouse 2024 | Donnée (approximation) | Aucun profil mensuel public des meublés de Rennes (AUDIAR ne publie que l'hôtellerie). Contrôle Eurostat : pic en août cohérent |
| Scénarios | Écart = variation annuelle observée (borné 3–8 pts) ; prudent : atouts à 50 % ; performant : +3 % prix | Hypothèse adossée au marché | Méthode conservée (voir §8 : limite détectée sur les logements très performants) |
| Frais de ménage | Séparés du CA des nuits ; prix de marché non corrigé (D8) | Règle | Invariance testée (0 à 500 € sans effet sur le CA des nuits) |
| Frais Airbnb | 15,5 % HT sur nuits + ménage ; TVA en option (non appliquée par défaut) | Règle | Confirmé : frais hôte unique en France au 13/10/2026 |
| Commission Émeraude | Taux × (nuits − frais Airbnb sur nuits) (D2) | Règle métier | Inchangé |
| Calibration par les données Émeraude | Niveaux observation / signal / calibration / solide | Règle | Inchangé (aucune donnée interne pour l'instant) |

## 2. Coefficients modifiés

| Coefficient | Avant | Après | Justification |
|---|---|---|---|
| Prix par nombre de chambres (studio / 1 / 2 / 3 / 4+) | 0,80 / 1 / 1,30 / 1,60 / 1,90 | **0,82 / 1 / 1,45 / 1,85 / 2,50** | Régression du prix à capacité, salles de bain et type égaux, dans les 3 villes : studio −14 à −21 %, 2 ch. +27 à +47 %, 3 ch. +81 à +104 %, 4+ ch. +154 à +200 %. L'ancienne courbe sous-estimait nettement les 3 chambres et plus. Valeurs retenues proches de Lyon, la ville la plus comparable à Rennes et la plus prudente |
| Occupation par nombre de chambres | +2 / 0 / −2 / −4 / −6 pts | **+3 / 0 / −2 / −8 / −8 pts** | Écart médian d'occupation par rapport au 1 chambre : studio +2,7 à +4,9 ; 2 ch. −1,6 à −3,3 ; 3 ch. −5,5 à −11,5 ; 4+ ch. −4,1 à −11,5 |
| Capacité typique | 2 / 3 / 5 / 6 / 8 | **2 / 2 / 4 / 6 / 8** | Capacité médiane par taille, identique dans les 3 villes (sauf 3 pour le 1 chambre au Pays basque) |
| Effet d'un voyageur supplémentaire à taille égale | 3 %, plafond 6 % | **6 %, plafond 12 %** | Mesuré à +5,9 à +8,2 % ; valeur retenue = minimum observé |
| Salles de bain | +3 % si ≥ 2 sdb et ≥ 2 ch. | **+3 % par salle de bain au-delà de la configuration typique** (1, ou 2 pour 4 ch. et plus), plafond 6 % | Double comptage : la 2e salle de bain d'un 4 chambres est déjà dans le facteur chambres |

## 3. Coefficients supprimés (mis à zéro)

| Coefficient | Avant | Après | Justification |
|---|---|---|---|
| Bonus « maison » | +5 % | **0** | Une fois chambres et capacité connues, l'effet n'est pas robuste (Bordeaux −6,6 %, Pays basque +2,9 %, Lyon +13,3 %). Il doublonnait aussi avec l'atout « terrasse / extérieur » (test DC2) |
| Canapé convertible | +0,5 % | **0** | Le couchage supplémentaire est déjà compté par la capacité (test DC3) |

Le type T1/T2/T3/T4 reste sans effet propre (test DC1) : il ne sert qu'au récapitulatif et aux contrôles de cohérence.

## 4. Nouveau coefficient

**Recalage de la moyenne de marché vers le logement de référence** (`referenceCalibration`, hypothèse Émeraude).

- **Problème détecté** : la moyenne publiée (Rennes Métropole 80 €, 49 %) mélange studios, 1, 2, 3 chambres et plus. La traiter comme le prix d'un 1 chambre surestime systématiquement les logements courants.
- **Règle de cohérence** : appliqué au mélange de tailles du marché, le modèle doit restituer la moyenne publiée. Le test DC8 le vérifie à 0,5 % près.
- **Calcul** :
  - prix de référence = prix de marché ÷ Σ (part des nuits × facteur de taille) ;
  - occupation de référence = occupation de marché − Σ (part des annonces × écart d'occupation).
- **Mélange de tailles** (hypothèse : le mélange local n'est pas publié) :
  - urbain = Lyon, d'où un prix de référence = marché ÷ 1,168 (−14 %) et une occupation +1,1 pt ;
  - littoral = Pays basque, d'où un prix de référence = marché ÷ 1,347 (−26 %) et une occupation +2,9 pts.
- **Affichage** : les valeurs de marché affichées restent les valeurs observées (80 €, 49 %). Le recalage apparaît comme une ligne d'ajustement « hypothèse Émeraude » (test DC11).

## 5. Justification résumée de chaque changement

1. **Courbe chambres et occupation par taille** : mesures concordantes dans trois marchés français indépendants. Le sens de l'écart est le même partout ; l'ampleur varie, d'où le choix des valeurs les plus prudentes (Lyon).
2. **Capacité typique et effet par voyageur** : mesure directe à taille égale. Le minimum observé est retenu.
3. **Salles de bain, maison, canapé** : suppression de doubles comptages démontrés par construction et par les tests.
4. **Recalage de référence** : identité mathématique (le modèle doit restituer la moyenne qu'il utilise). Seules les proportions du mélange sont empruntées à des villes comparables.

## 6. Sources utilisées

Voir le tableau ci-dessus. Données et scripts :
- `data/raw/carte-loyers/` (Carte des loyers 2025, département 35) ;
- `scripts/audit/structure-check.mjs` (ratios Inside Airbnb ; les fichiers bruts restent hors dépôt) ;
- `reports/audit-structure-taille.json` (résultats agrégés) ;
- `scripts/audit/rent-index.mjs`, `scripts/audit/ladder.mjs`, `scripts/audit/calibration-compare.mjs` ;
- `reports/audit-calibration-data.json`.

### Échelle des tailles — Rennes, logement standard, 10 mois

| Logement | V2 initiale : prix / occ. / CA | V2 calibrée : prix / occ. / CA | CA relatif au T2 (calibrée) | Repère Inside Airbnb (CA médian relatif au 1 ch.) |
|---|---|---|---|---|
| Studio 22 m², 2 voy. | 63 € / 51 % / 9 839 € | 56 € / 53,1 % / 8 981 € | ×0,86 | ×0,83 à ×0,96 |
| T2 1 ch. 40 m², 2 voy. | 78 € / 49 % / 11 566 € | 68 € / 50,1 % / 10 427 € | ×1,00 | ×1,00 |
| T3 2 ch. 60 m², 4 voy. | 101 € / 47 % / 14 422 € | 99 € / 48,1 % / 14 516 € | ×1,39 | ×1,16 à ×1,35 |
| T4 3 ch. 80 m², 6 voy. | 128 € / 45 % / 17 520 € | 127 € / 42,1 % / 16 208 € | ×1,55 | ×0,97 à ×1,29 |
| T5 4 ch. 110 m², 8 voy., 2 sdb | 157 € / 43 % / 20 477 € | 171 € / 42,1 % / 21 902 € | ×2,10 | ×1,43 à ×2,74 |
| Maison 3 ch. 95 m², 6 voy. | 140 € / 45 % / 19 224 € | 132 € / 42,1 % / 16 937 € | ×1,62 | — |
| Maison 4 ch. 120 m², 8 voy., 2 sdb | 169 € / 43 % / 22 146 € | 176 € / 42,1 % / 22 559 € | ×2,16 | — |

Les repères de CA Inside Airbnb sont bruités : leur occupation est estimée à partir des avis. Pour les 3 chambres, ils sont **inférieurs** au modèle, ce qui en fait un point d'incertitude (§8).

## 7. Comparaison avant / après — 25 logements fictifs représentatifs des 16 communes

Hypothèses : 10 mois, commission 20 %, ménage 40 €, séjour 3 nuits ; scénario réaliste. « V2 » = configuration initiale, « calibrée » = configuration actuelle.

| Logement | Zone | Prix/nuit : ancien → V2 → calibrée | Occupation : ancien → V2 → calibrée | CA nuits : ancien → V2 → calibrée (écart calibrée/V2) | Revenu propriétaire : ancien → V2 → calibrée | Fourchette calibrée (prudent – performant) | Explication V2 → calibrée |
|---|---|---|---|---|---|---|---|
| Rennes · studio 22 m² · 2 voy. | Rennes Métropole | 68 € → 65 € → **57 €** | 66,5 % → 52,0 % → **54,1 %** | 13 754 € → 10 332 € → **9 425 €** (-9 %) | 9 298 € → 6 985 € → **6 371 €** | 8 343 € – 10 606 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres -20.0 → -18.0 % prix, 2.0 → 3.0 pts occ. |
| Rennes · T2 40 m² · 2 voy. · standard | Rennes Métropole | 76 € → 78 € → **68 €** | 67,0 % → 49,0 % → **50,1 %** | 15 488 € → 11 566 € → **10 427 €** (-10 %) | 10 470 € → 7 818 € → **7 049 €** | 9 386 € – 11 813 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Rennes · T2 45 m² · hypercentre · rénové · serrure connectée | Rennes Métropole | 96 € → 93 € → **82 €** | 76,0 % → 54,0 % → **55,1 %** | 22 192 € → 15 227 € → **13 702 €** (-10 %) | 15 002 € → 10 293 € → **9 262 €** | 10 928 € – 15 394 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Rennes · T3 62 m² · 4 voy. · central | Rennes Métropole | 100 € → 107 € → **105 €** | 75,5 % → 48,0 % → **49,1 %** | 22 965 € → 15 567 € → **15 661 €** (+1 %) | 15 524 € → 10 523 € → **10 587 €** | 13 568 € – 17 775 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 30.0 → 45.0 % prix ; capacité -3.0 → 0.0 % prix |
| Rennes · T4 3 ch. 80 m² · 6 voy. | Rennes Métropole | 112 € → 128 € → **127 €** | 77,0 % → 45,0 % → **42,1 %** | 26 231 € → 17 520 € → **16 208 €** (-7 %) | 17 732 € → 11 844 € → **10 956 €** | 14 281 € – 18 679 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 60.0 → 85.0 % prix, -4.0 → -8.0 pts occ. |
| Rennes · T5 4 ch. 110 m² · 8 voy. · 2 sdb | Rennes Métropole | 116 € → 157 € → **171 €** | 79,0 % → 43,0 % → **42,1 %** | 27 874 € → 20 477 € → **21 902 €** (+7 %) | 18 843 € → 13 842 € → **14 806 €** | 19 298 € – 25 241 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 90.0 → 150.0 % prix, -6.0 → -8.0 pts occ. ; salles de bain 3.0 → 0.0 % prix |
| Rennes · maison 3 ch. 95 m² · 6 voy. · jardin · quartier recherché | Rennes Métropole | 116 € → 149 € → **140 €** | 79,5 % → 46,0 % → **43,1 %** | 28 050 € → 20 846 € → **18 394 €** (-12 %) | 18 962 € → 14 092 € → **12 434 €** | 15 582 € – 21 146 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 60.0 → 85.0 % prix, -4.0 → -8.0 pts occ. ; bonus maison 5.0 → 0.0 % prix |
| Cesson-Sévigné · T2 42 m² · 2 voy. | Rennes Métropole | 87 € → 80 € → **71 €** | 60,0 % → 50,0 % → **51,1 %** | 15 878 € → 12 229 € → **11 021 €** (-10 %) | 10 733 € → 8 267 € → **7 450 €** | 9 690 € – 12 463 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Saint-Grégoire · T3 65 m² · 4 voy. · parking | Rennes Métropole | 124 € → 105 € → **104 €** | 63,5 % → 48,0 % → **49,1 %** | 23 950 € → 15 398 € → **15 491 €** (+1 %) | 16 190 € → 10 409 € → **10 472 €** | 13 554 € – 17 582 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 30.0 → 45.0 % prix ; capacité -3.0 → 0.0 % prix |
| Chantepie · T2 40 m² · 2 voy. | Rennes Métropole | 69 € → 78 € → **68 €** | 59,0 % → 49,0 % → **50,1 %** | 12 383 € → 11 566 € → **10 427 €** (-10 %) | 8 371 € → 7 818 € → **7 049 €** | 9 386 € – 11 813 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Bruz · T3 60 m² · 4 voy. | Rennes Métropole | 106 € → 101 € → **99 €** | 63,5 % → 47,0 % → **48,1 %** | 20 473 € → 14 422 € → **14 516 €** (+1 %) | 13 840 € → 9 749 € → **9 813 €** | 13 005 € – 16 507 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 30.0 → 45.0 % prix ; capacité -3.0 → 0.0 % prix |
| Pacé · maison 3 ch. 100 m² · 6 voy. · terrasse · parking | Rennes Métropole | 150 € → 152 € → **144 €** | 75,5 % → 46,0 % → **43,1 %** | 34 447 € → 21 328 € → **18 820 €** (-12 %) | 23 286 € → 14 418 € → **12 722 €** | 15 879 € – 21 636 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 60.0 → 85.0 % prix, -4.0 → -8.0 pts occ. ; bonus maison 5.0 → 0.0 % prix |
| Betton · T2 42 m² · 2 voy. | Rennes Métropole | 101 € → 78 € → **69 €** | 59,0 % → 49,0 % → **50,1 %** | 18 125 € → 11 635 € → **10 490 €** (-10 %) | 12 253 € → 7 865 € → **7 091 €** | 9 442 € – 11 884 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Saint-Jacques-de-la-Lande · T2 40 m² · 2 voy. | Rennes Métropole | 88 € → 78 € → **68 €** | 59,0 % → 49,0 % → **50,1 %** | 15 792 € → 11 566 € → **10 427 €** (-10 %) | 10 676 € → 7 818 € → **7 049 €** | 9 386 € – 11 813 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Vezin-le-Coquet · T2 38 m² · 2 voy. | Rennes Métropole | 163 € → 77 € → **68 €** | 54,0 % → 49,0 % → **50,1 %** | 26 773 € → 11 496 € → **10 365 €** (-10 %) | 18 098 € → 7 771 € → **7 007 €** | 9 330 € – 11 742 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Chartres-de-Bretagne · maison 3 ch. 90 m² · 6 voy. | Rennes Métropole | 114 € → 144 € → **136 €** | 66,5 % → 45,0 % → **42,1 %** | 23 059 € → 19 706 € → **17 362 €** (-12 %) | 15 588 € → 13 321 € → **11 736 €** | 15 003 € – 20 009 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 60.0 → 85.0 % prix, -4.0 → -8.0 pts occ. ; bonus maison 5.0 → 0.0 % prix |
| Châteaubourg · maison 3 ch. 95 m² · 6 voy. · terrasse | Vitré Communauté | 111 € → 148 € → **140 €** | 68,5 % → 44,0 % → **41,1 %** | 23 127 € → 19 866 € → **17 475 €** (-12 %) | 15 634 € → 13 430 € → **11 813 €** | 14 217 € – 21 068 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 60.0 → 85.0 % prix, -4.0 → -8.0 pts occ. ; bonus maison 5.0 → 0.0 % prix |
| Liffré · T2 40 m² · 2 voy. | Liffré-Cormier Communauté | 111 € → 85 € → **75 €** | 58,0 % → 45,0 % → **46,1 %** | 19 582 € → 11 670 € → **10 542 €** (-10 %) | 13 238 € → 7 889 € → **7 126 €** | 9 855 € – 11 565 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Vitré · T2 45 m² · 2 voy. · central | Vitré Communauté | 71 € → 82 € → **73 €** | 64,0 % → 49,0 % → **50,1 %** | 13 821 € → 12 288 € → **11 079 €** (-10 %) | 9 343 € → 8 307 € → **7 489 €** | 9 281 € – 13 007 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; capacité -3.0 → 0.0 % prix |
| Saint-Aubin-du-Cormier · maison 3 ch. 90 m² · 6 voy. | Liffré-Cormier Communauté | 180 € → 158 € → **149 €** | 57,5 % → 41,0 % → **38,1 %** | 31 481 € → 19 727 € → **17 262 €** (-12 %) | 21 281 € → 13 336 € → **11 669 €** | 15 595 € – 19 181 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 60.0 → 85.0 % prix, -4.0 → -8.0 pts occ. ; bonus maison 5.0 → 0.0 % prix |
| Val-d'Izé · maison 3 ch. 100 m² · 6 voy. | Vitré Communauté | 157 € → 155 € → **146 €** | 77,5 % → 45,0 % → **42,1 %** | 37 009 € → 21 204 € → **18 681 €** (-12 %) | 25 018 € → 14 334 € → **12 629 €** | 14 848 € – 22 445 € | recalage marché → 1 chambre -14 % prix, +1.1 pt occupation ; courbe chambres 60.0 → 85.0 % prix, -4.0 → -8.0 pts occ. ; bonus maison 5.0 → 0.0 % prix |
| Saint-Malo · studio 22 m² · intra-muros (hypercentre) | Saint-Malo Agglomération | 127 € → 104 € → **79 €** | 64,5 % → 50,0 % → **53,9 %** | 24 916 € → 15 783 € → **12 933 €** (-18 %) | 16 843 € → 10 669 € → **8 743 €** | 11 314 € – 14 056 € | recalage marché → 1 chambre -26 % prix, +2.9 pt occupation ; courbe chambres -20.0 → -18.0 % prix, 2.0 → 3.0 pts occ. |
| Saint-Malo · T2 40 m² · 2 voy. · central | Saint-Malo Agglomération | 137 € → 119 € → **91 €** | 65,0 % → 46,0 % → **48,9 %** | 27 086 € → 16 635 € → **13 519 €** (-19 %) | 18 310 € → 11 245 € → **9 139 €** | 12 369 € – 14 780 € | recalage marché → 1 chambre -26 % prix, +2.9 pt occupation ; capacité -3.0 → 0.0 % prix |
| Saint-Malo · T2 40 m² · central · juillet et août exclus | Saint-Malo Agglomération | 137 € → 112 € → **85 €** | 65,0 % → 41,9 % → **44,6 %** | 27 086 € → 14 176 € → **11 521 €** (-19 %) | 18 310 € → 9 583 € → **7 788 €** | 10 541 € – 12 595 € | recalage marché → 1 chambre -26 % prix, +2.9 pt occupation ; capacité -3.0 → 0.0 % prix |
| Saint-Malo · maison 4 ch. 120 m² · 8 voy. · 2 sdb · terrasse · vue | Saint-Malo Agglomération | 209 € → 267 € → **241 €** | 77,5 % → 39,0 % → **39,9 %** | 49 267 € → 31 670 € → **29 230 €** (-8 %) | 33 305 € → 21 409 € → **19 760 €** | 26 266 € – 32 372 € | recalage marché → 1 chambre -26 % prix, +2.9 pt occupation ; courbe chambres 90.0 → 150.0 % prix, -6.0 → -8.0 pts occ. ; salles de bain 3.0 → 0.0 % prix ; bonus maison 5.0 → 0.0 % prix |

**Sensibilité non appliquée — indice communal (Carte des loyers 2025, T1-T2, €/m²), Rennes Métropole**

| Commune | Loyer T1-T2 €/m² | Rapport à la moyenne pondérée de l'EPCI | Facteur si élasticité 0,5 |
|---|---|---|---|
| Rennes | 17,19 | 1,031 | 1,016 |
| Cesson-Sévigné | 15,55 | 0,933 | 0,966 |
| Saint-Grégoire | 15,59 | 0,935 | 0,967 |
| Chantepie | 15,52 | 0,932 | 0,965 |
| Bruz | 14,75 | 0,885 | 0,941 |
| Pacé | 14,78 | 0,887 | 0,942 |
| Betton | 14,12 | 0,847 | 0,920 |
| Saint-Jacques-de-la-Lande | 15,33 | 0,920 | 0,959 |
| Vezin-le-Coquet | 15,48 | 0,929 | 0,964 |
| Chartres-de-Bretagne | 14,73 | 0,884 | 0,940 |

Lecture des écarts V2 → calibrée :
- **T2 et studios** (−9 à −10 % ; Saint-Malo −18 à −19 %) : recalage de référence. La capacité typique passe à 2 voyageurs, ce qui supprime l'ancienne pénalité de −3 % et compense en partie.
- **T3 2 chambres** (≈ +1 %) : la courbe plus pentue (+45 % au lieu de +30 %) compense le recalage.
- **T5 4 chambres** (+7 %) : la courbe plus pentue (+150 % au lieu de +90 %) l'emporte sur le recalage et sur l'occupation plus basse.
- **Maisons 3 chambres** (−12 %) : la courbe plus pentue est neutralisée par l'occupation des 3 chambres (−8 pts au lieu de −4), la suppression du bonus maison (−5 %) et le recalage.

## 8. Logements où le modèle reste incertain

1. **Saint-Malo (tous logements)** : l'effet du recalage dépend fortement du mélange de tailles supposé. Pour un T2 central :
   - mélange littoral (retenu) : **91 €** / 48,9 % / 13 519 € ;
   - mélange urbain : 105 € / 47,1 % / 15 019 € ;
   - sans recalage : 123 € / 46,0 % / 17 150 €.

   L'écart atteint ±10 % sur le CA. Le mélange littoral (Pays basque, beaucoup de maisons) est plausible pour l'agglomération (Cancale, Saint-Coulomb ; séjour moyen 3,7 nuits, profil familial), mais il n'est pas vérifié pour Saint-Malo intra-muros.
2. **Communes de périphérie de Rennes Métropole** : elles reçoivent la moyenne d'une intercommunalité dont Rennes représente 3/4 des annonces. Les loyers T1-T2 y sont de 7 à 15 % inférieurs à la moyenne pondérée (Betton −15 %, Bruz −12 %, Chartres −12 %). Si le prix de la location courte durée suivait ces écarts avec une élasticité de 0,5, l'estimation baisserait de 3 à 8 %. **Non appliqué** : la relation loyer / location courte durée n'est pas mesurée. Le champ « Emplacement » reste le levier.
3. **Logements très performants** : à taille égale, le quartile supérieur d'occupation est 12 à 30 pts au-dessus de la médiane (Inside Airbnb). Le scénario « Performant » n'ajoute que l'écart annuel du marché (+3 à +7 pts) et +3 % de prix, plus au maximum +6 pts liés à l'emplacement et aux équipements. **Le modèle sous-estime probablement les logements gérés de façon très efficace** (proches du quartile supérieur). Correction non appliquée : les définitions d'occupation diffèrent entre Inside Airbnb (sur l'année) et Lighthouse (non précisé). La bonne source sera les logements gérés par Émeraude.
4. **Maisons et 3 chambres** : les repères de CA relatifs (Inside Airbnb) sont plus bas que le modèle pour les 3 chambres et plus hauts pour certaines 4+ chambres. Le résultat dépend de l'hypothèse d'occupation −8 pts : incertitude ±10 %.
5. **Niveau des prix 2024 et frais Airbnb** : en 2024, une partie des hôtes était encore au modèle de frais partagés (3 % côté hôte). Les prix publiés pourraient donc être exprimés avant la bascule du 13/10/2026, après laquelle les hôtes tendent à relever leurs prix pour absorber les 15,5 %. Effet possible : sous-estimation du prix de quelques pour cent à ~15 %. Non corrigé, faute de mesure.
6. **Définitions Lighthouse** (ménage inclus ou non dans le prix ; nuits bloquées) : toujours non déterminées (D8).
7. **Liffré-Cormier** (9 482 nuits) : petit échantillon, confiance « Moyenne ».

## 9. Recommandations pour la prochaine phase

1. **Valider ou refuser l'usage d'Inside Airbnb** pour la structure de tailles (D10). En cas de refus, revenir à la courbe V2 initiale (archivée) et désactiver le recalage, en sachant qu'elle sous-estime les grands logements et surestime les petits.
2. **Données Émeraude** : dès 5 logements gérés par segment (niveau « calibration »), elles corrigeront directement les trois incertitudes principales (Saint-Malo, périphérie, logements performants). Priorité : exporter 12 mois de données réelles au format de `data/emeraude/README.md`.
3. **Saint-Malo** : choisir entre le mélange littoral et un mélange intermédiaire (D11), ou attendre des données internes.
4. **Indice communal** (Carte des loyers) : ne l'activer qu'avec une élasticité mesurée sur vos propres logements (D12).
5. **Scénario « Performant »** : envisager un scénario « quartile supérieur » une fois les données internes disponibles, plutôt qu'avec des données d'autres villes.
6. **Publication 2025 d'Ille & Vilaine Tourisme** : à intégrer dès sa sortie (procédure annuelle du README). Elle actualisera la base et la fraîcheur.

## Décisions demandées

| # | Question | Recommandation |
|---|---|---|
| D10 | Utiliser Inside Airbnb (CC BY 4.0, mention dans la méthodologie) pour la structure de tailles et le recalage ? | Oui : c'est la seule source gratuite et légale qui mesure ces écarts ; usage limité à des ratios agrégés |
| D11 | Mélange de tailles pour Saint-Malo : littoral (Pays basque) ou intermédiaire ? | Littoral, en signalant la confiance « Moyenne » pour Saint-Malo, jusqu'à disposer de données internes |
| D12 | Indice communal fondé sur les loyers (−3 à −8 % en périphérie) ? | Pas maintenant : à calibrer sur vos logements |
| D13 | Scénario « Performant » relevé vers le quartile supérieur ? | Pas maintenant, faute de données comparables ; à revoir avec les données Émeraude |
