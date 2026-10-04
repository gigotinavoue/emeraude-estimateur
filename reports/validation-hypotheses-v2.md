# Validation des hypothèses et analyse de sensibilité — phase 5

Date : 4 octobre 2026 · moteur 1.1.0 · configuration `2026-10-v2-calibration`.

**Périmètre** : analyse uniquement.
- Le moteur, la configuration de production, l'Embed, Framer et la préversion n'ont **pas** été modifiés.
- Toutes les variantes sont des **copies de configuration** construites par `scripts/audit/sensitivity.mjs`.
- Les calculs sont déterministes (aucun tirage aléatoire) et s'appuient sur des entrées figées : `tests/fixtures/market.valid.json`, `reports/audit-insee-pieces.json`, `reports/audit-structure-taille.json`.
- Commande de reproduction : `node scripts/audit/sensitivity.mjs`. Les résultats sont dans `reports/validation-hypotheses-data.json`.

## 0. Rappel du modèle testé

Pour un logement de la commune *c* rattachée à l'intercommunalité *e* :

1. **Données de marché observées** (Ille & Vilaine Tourisme / Lighthouse 2024, par intercommunalité) : prix moyen *P_e*, occupation *O_e*.
2. **Recalage vers le logement de référence (1 chambre)**, avec un mélange de tailles *m* (part des nuits *n_k*, part des annonces *l_k*) et la courbe *f_k* :
   - prix de référence = *P_e* ÷ Σ *n_k·f_k* ;
   - occupation de référence = *O_e* − Σ *l_k·Δocc_k*.
3. **Ajustements du logement** : facteur chambres *f_k* et Δocc_k ; corrections de surface, capacité et salles de bain par rapport à la configuration typique de la taille ; emplacement ; équipements (plafonnés) ; garde-fous.
4. **Saisonnalité mensuelle**, puis nuits, CA des nuits, ménage séparé, frais Airbnb, commission, revenu propriétaire.
5. **Scénarios** :
   - prudent = atouts positifs comptés à 50 % et occupation − Δ ;
   - performant = occupation + Δ et +3 % de prix ;
   - Δ = variation annuelle observée du marché, bornée entre 3 et 8 pts.

Hypothèses communes à toutes les simulations : 10 mois disponibles (mode « nombre »), commission 20 %, ménage 40 €, séjour 3 nuits, emplacement « Standard », sans équipement sauf mention.

## 1. Nouvelles données locales examinées

| Source | Période | Territoire | Granularité | Licence | Variable | Intérêt réel |
|---|---|---|---|---|---|---|
| **Insee, recensement** (`DS_RP_LOGEMENT_PRINC`, API Melodi) | 2023 | Commune (Rennes, Saint-Malo, Vitré, Cesson, Bruz + villes de référence) | Résidences principales par nombre de pièces ; part de maisons ; part de résidences secondaires | Licence Ouverte 2.0 | Structure du **parc de logements** (pas des meublés de tourisme) | **Utile** : sert à vérifier que les villes de référence ressemblent aux nôtres, et à construire un mélange « proxy local » |
| **DATAtourisme**, export Bretagne (data.gouv) | Octobre 2026 | Commune | Fiches des offices de tourisme | Licence Ouverte | Meublés référencés (223 à Saint-Malo, 43 à Rennes) ; **taille presque jamais renseignée** dans l'export simplifié (12 et 2 fiches) | **Inutilisable** en l'état. L'export complet (JSON-LD) contient peut-être une capacité : piste non vérifiée |
| **Atout France**, hébergements classés | Quotidien | France | Établissement | Licence Ouverte | Hébergements **collectifs** classés uniquement (hôtels, campings, résidences) | **Inutilisable** : les meublés n'y figurent pas |
| AUDIAR, observatoire du tourisme 2024 | 2024 | Rennes Métropole | Annuel / mensuel (hôtellerie) | Non précisée | Rennes = 3/4 des annonces de logements entiers ; ~2 240 annonces actives par mois | Pondération de la sensibilité communale ; aucune donnée par taille |
| Carte des loyers 2025 | 2025 | Commune | Loyer d'annonce au m² (T1-T2, T3+, maison) | Licence Ouverte | Écarts de niveau de prix entre communes (location nue) | Mesure du biais potentiel des communes périphériques (§7) |
| Ille & Vilaine Tourisme, Tourisme Bretagne | 2024 | EPCI / région | Annuel | Non précisée | Aucune ventilation par taille | Aucun apport supplémentaire |

**Conclusion** : **aucune source gratuite et légalement réutilisable ne publie la répartition par taille, le prix ou l'occupation par typologie des meublés de tourisme à Rennes ou Saint-Malo.** Le recensement Insee est la seule donnée locale qui éclaire, indirectement, le mélange de tailles.

### Le recensement confirme-t-il les analogies ?

| Ville | 1-2 pièces | 3 p. | 4 p. | 5+ p. | Maisons | Résidences secondaires |
|---|---|---|---|---|---|---|
| Rennes | 37 % | 26 % | 19 % | 18 % | 13 % | 4,8 % |
| Lyon (réf. urbaine) | 40 % | 28 % | 19 % | 13 % | 3 % | 6,0 % |
| Bordeaux (réf.) | 42 % | 26 % | 17 % | 16 % | 21 % | 6,9 % |
| Saint-Malo | 22 % | 24 % | 20 % | 34 % | 43 % | 27,1 % |
| Biarritz / Anglet / Saint-Jean-de-Luz (réf. littorale) | 24–28 % | 26–31 % | 22–23 % | 22–23 % | 25–34 % | 15–42 % |

- **Rennes** est très proche de Lyon et de Bordeaux, avec un peu plus de grands logements que Lyon. Le mélange « Lyon » retenu est donc **plausible, mais plutôt la borne favorable aux petits logements**.
- **Saint-Malo** a un parc **plus grand** que les villes du Pays basque. Le mélange littoral retenu n'est donc pas exagéré ; un mélange « urbain » serait incohérent avec le parc local.

**Mélange « proxy local »** (T8) : part du parc Insee de la commune × rapport (part des meublés / part du parc) observé dans les villes de référence. Correspondance : 1 pièce = studio, 2 pièces = 1 chambre, etc. Cette construction utilise des données locales officielles, mais le rapport meublés / parc reste emprunté aux villes de référence.

## 2. Résultats chiffrés

#### T1 — Sensibilité à la courbe des chambres (prix / occupation / CA nuits ; variation vs courbe actuelle)

| Logement | B — prudente | A — actuelle | C — haute | Amplitude B↔C |
|---|---|---|---|---|
| Rennes studio 22 m² | 61 € / 53,1 % / 9 814 € (+9,3 %) | 56 € / 53,1 % / 8 981 € | 54 € / 53,1 % / 8 771 € (-2,3 %) | 11,6 % |
| Rennes T2 40 m² | 72 € / 50,1 % / 10 992 € (+5,4 %) | 68 € / 50,1 % / 10 427 € | 67 € / 50,1 % / 10 183 € (-2,3 %) | 7,8 % |
| Rennes T3 60 m² | 94 € / 48,1 % / 13 718 € (-5,5 %) | 99 € / 48,1 % / 14 516 € | 100 € / 48,1 % / 14 665 € (+1,0 %) | 6,5 % |
| Rennes 3 ch. 80 m² | 116 € / 42,1 % / 14 776 € (-8,8 %) | 127 € / 42,1 % / 16 208 € | 134 € / 42,1 % / 17 112 € (+5,6 %) | 14,4 % |
| Saint-Malo studio 22 m² | 82 € / 50,9 % / 12 648 € (+13,9 %) | 72 € / 50,9 % / 11 103 € | 69 € / 50,9 % / 10 648 € (-4,1 %) | 18,0 % |
| Saint-Malo T2 40 m² | 97 € / 47,9 % / 14 130 € (+9,9 %) | 88 € / 47,9 % / 12 857 € | 85 € / 47,9 % / 12 331 € (-4,1 %) | 14,0 % |
| Saint-Malo 2 ch. 60 m² | 126 € / 45,9 % / 17 601 € (-1,5 %) | 128 € / 45,9 % / 17 864 € | 127 € / 45,9 % / 17 724 € (-0,8 %) | 0,7 % |
| Vitré T2 40 m² | 73 € / 49,1 % / 10 947 € (+5,4 %) | 70 € / 49,1 % / 10 385 € | 68 € / 49,1 % / 10 142 € (-2,3 %) | 7,8 % |
| Betton T2 40 m² | 72 € / 50,1 % / 10 992 € (+5,4 %) | 68 € / 50,1 % / 10 427 € | 67 € / 50,1 % / 10 183 € (-2,3 %) | 7,8 % |

Diviseurs de recalage : B urbain 1.108 / littoral 1.227 ; A 1.168 / 1.348 ; C 1.196 / 1.405.

#### T2 — Mélange de tailles : Rennes (profil urbain)

| Mélange | Prix de référence 1 ch. | T2 : prix / occ. / CA | T3 (2 ch.) : prix / occ. / CA |
|---|---|---|---|
| A — petits logements dominants | 71 € | 71 € / 49,7 % / 10 731 € (+2,9 %) | 103 € / 47,7 % / 14 934 € (+2,9 %) |
| Lyon (urbain actuel) | 68 € | 68 € / 50,1 % / 10 427 € (+0,0 %) | 99 € / 48,1 % / 14 516 € (+0,0 %) |
| Proxy local Rennes (parc Insee × ratios Lyon/Bordeaux) | 64 € | 64 € / 51,0 % / 9 873 € (-5,3 %) | 92 € / 49,0 % / 13 755 € (-5,2 %) |
| B — intermédiaire (moyenne Lyon / Pays basque) | 64 € | 64 € / 51,0 % / 9 854 € (-5,5 %) | 92 € / 49,0 % / 13 728 € (-5,4 %) |
| Bordeaux | 63 € | 63 € / 51,3 % / 9 808 € (-5,9 %) | 91 € / 49,3 % / 13 667 € (-5,8 %) |
| C — davantage de grands logements | 57 € | 57 € / 52,2 % / 9 047 € (-13,2 %) | 83 € / 50,2 % / 12 615 € (-13,1 %) |

Amplitude totale : T2 16,2 %, T3 16,0 % (par rapport au mélange actuel).

#### T3 — Mélange de tailles : Saint-Malo (profil littoral)

| Mélange | Prix de référence 1 ch. | T2 : prix / occ. / CA | T3 (2 ch.) : prix / occ. / CA |
|---|---|---|---|
| Lyon (urbain actuel) | 102 € | 102 € / 46,1 % / 14 271 € (+11,0 %) | 148 € / 44,1 % / 19 795 € (+10,8 %) |
| B — intermédiaire (moyenne Lyon / Pays basque) | 95 € | 95 € / 47,0 % / 13 508 € (+5,1 %) | 137 € / 45,0 % / 18 752 € (+5,0 %) |
| Pays basque (littoral actuel) | 88 € | 88 € / 47,9 % / 12 857 € (+0,0 %) | 128 € / 45,9 % / 17 864 € (+0,0 %) |
| Proxy local Saint-Malo (parc Insee × ratios Pays basque) | 84 € | 84 € / 48,4 % / 12 391 € (-3,6 %) | 122 € / 46,4 % / 17 225 € (-3,6 %) |
| C — davantage de grands logements | 85 € | 85 € / 48,2 % / 12 425 € (-3,4 %) | 123 € / 46,2 % / 17 269 € (-3,3 %) |

Amplitude totale : T2 14,6 %, T3 14,4 % (par rapport au mélange actuel).

#### T4 — Avec / sans calibration Inside Airbnb (CA nuits, scénario réaliste)

| Logement | A. Avec (courbe A + recalage) | B. Sans (courbe V2 initiale, pas de recalage) | Écart B / A | B'. Sans Inside Airbnb, recalage par le parc Insee brut | Écart B' / A |
|---|---|---|---|---|---|
| Rennes studio 22 m² | 8 981 € (56 €, 53,1 %) | 9 839 € (63 €, 51,0 %) | +9,5 % | 7 721 € (48 €) | -14,0 % |
| Rennes T2 40 m² | 10 427 € (68 €, 50,1 %) | 11 566 € (78 €, 49,0 %) | +10,9 % | 9 091 € (59 €) | -12,8 % |
| Rennes T3 60 m² | 14 516 € (99 €, 48,1 %) | 14 422 € (101 €, 47,0 %) | -0,6 % | 11 355 € (76 €) | -21,8 % |
| Rennes 3 ch. 80 m² | 16 208 € (127 €, 42,1 %) | 17 520 € (128 €, 45,0 %) | +8,1 % | 13 820 € (97 €) | -14,7 % |
| Saint-Malo studio 22 m² | 11 103 € (72 €, 50,9 %) | 13 487 € (94 €, 47,0 %) | +21,5 % | 9 679 € (63 €) | -12,8 % |
| Saint-Malo T2 40 m² | 12 857 € (88 €, 47,9 %) | 15 799 € (115 €, 45,0 %) | +22,9 % | 11 371 € (77 €) | -11,6 % |
| Saint-Malo 2 ch. 60 m² | 17 864 € (128 €, 45,9 %) | 19 626 € (150 €, 43,0 %) | +9,9 % | 14 169 € (101 €) | -20,7 % |
| Saint-Malo 3 ch. 80 m² | 19 812 € (163 €, 39,9 %) | 23 744 € (190 €, 41,0 %) | +19,9 % | 17 201 € (128 €) | -13,2 % |
| Vitré T2 40 m² | 10 385 € (70 €, 49,1 %) | 11 514 € (79 €, 48,0 %) | +10,9 % | 9 057 € (59 €) | -12,8 % |
| Bruz T2 40 m² | 10 427 € (68 €, 50,1 %) | 11 566 € (78 €, 49,0 %) | +10,9 % | 9 091 € (59 €) | -12,8 % |
| Cesson-Sévigné T2 40 m² | 10 427 € (68 €, 50,1 %) | 11 566 € (78 €, 49,0 %) | +10,9 % | 9 091 € (59 €) | -12,8 % |
| Pacé T2 40 m² | 10 427 € (68 €, 50,1 %) | 11 566 € (78 €, 49,0 %) | +10,9 % | 9 091 € (59 €) | -12,8 % |
| Betton T2 40 m² | 10 427 € (68 €, 50,1 %) | 11 566 € (78 €, 49,0 %) | +10,9 % | 9 091 € (59 €) | -12,8 % |
| Liffré T2 40 m² | 10 542 € (75 €, 46,1 %) | 11 670 € (85 €, 45,0 %) | +10,7 % | 9 206 € (64 €) | -12,7 % |
| Saint-Aubin-du-Cormier T2 40 m² | 10 542 € (75 €, 46,1 %) | 11 670 € (85 €, 45,0 %) | +10,7 % | 9 206 € (64 €) | -12,7 % |
| Val-d'Izé T2 40 m² | 10 385 € (70 €, 49,1 %) | 11 514 € (79 €, 48,0 %) | +10,9 % | 9 057 € (59 €) | -12,8 % |
| Rennes Métropole (Chantepie) maison 3 ch. 95 m² | 17 615 € (138 €, 42,1 %) | 19 041 € (139 €, 45,0 %) | +8,1 % | 15 020 € (105 €) | -14,7 % |

#### T5 — Scénario « Performant » : écart d'occupation testé (CA nuits ; prix +3 % de gestion dans tous les cas)

| Logement | Réaliste | +3 pts | +5 pts | +7 pts | +10 pts (stress test) |
|---|---|---|---|---|---|
| Rennes T2 40 m² | 10 427 € | 11 384 € (+9,2 %) | 11 813 € (+13,3 %) | 12 242 € (+17,4 %) | 12 886 € (+23,6 %) |
| Rennes T3 60 m² | 14 516 € | 15 884 € (+9,4 %) | 16 507 € (+13,7 %) | 17 129 € (+18,0 %) | 18 062 € (+24,4 %) |
| Saint-Malo T2 40 m² | 12 857 € | 14 073 € (+9,5 %) | 14 626 € (+13,8 %) | 15 179 € (+18,1 %) | 15 956 € (+24,1 %) |
| Vitré T2 40 m² | 10 385 € | 11 351 € (+9,3 %) | 11 787 € (+13,5 %) | 12 223 € (+17,7 %) | 12 877 € (+24,0 %) |

#### T6 — Communes périphériques de Rennes Métropole : biais de prix potentiel (non appliqué)

Moyenne pondérée des loyers T1-T2 de l'EPCI (Rennes = 3/4 des annonces) : 16,66 €/m².

| Commune | Loyer T1-T2 €/m² | Rapport | Biais si élasticité 0,3 | 0,5 | 0,7 | Niveau (à 0,5) |
|---|---|---|---|---|---|---|
| Cesson-Sévigné | 15,55 | 0,933 | -2,1 % | -3,4 % | -4,7 % | modéré |
| Saint-Grégoire | 15,59 | 0,935 | -2,0 % | -3,3 % | -4,6 % | modéré |
| Chantepie | 15,52 | 0,932 | -2,1 % | -3,5 % | -4,8 % | modéré |
| Bruz | 14,75 | 0,885 | -3,6 % | -5,9 % | -8,2 % | modéré |
| Pacé | 14,78 | 0,887 | -3,5 % | -5,8 % | -8,0 % | modéré |
| Betton | 14,12 | 0,847 | -4,9 % | -8,0 % | -11,0 % | significatif |
| Saint-Jacques-de-la-Lande | 15,33 | 0,920 | -2,5 % | -4,1 % | -5,7 % | modéré |
| Vezin-le-Coquet | 15,48 | 0,929 | -2,2 % | -3,6 % | -5,0 % | modéré |
| Chartres-de-Bretagne | 14,73 | 0,884 | -3,6 % | -6,0 % | -8,3 % | modéré |

#### T7 — Robustesse globale (CA nuits annuel, 10 mois, scénario réaliste sauf mention)

| Logement | Ancien outil | V2 initiale | V2 calibrée | Courbe B | Courbe A | Courbe C | Incertitude structurelle (courbes × mélanges plausibles) | Prudent – Performant (calibrée) | Intervalle raisonnable à afficher |
|---|---|---|---|---|---|---|---|---|---|
| Rennes studio 22 m² | 12 556 € | 9 839 € | **8 981 €** | 9 814 € | 8 981 € | 8 771 € | 8 138 € – 9 814 € (±9,3 %) | 8 135 € – 10 123 € | **8 135 € – 10 123 €** |
| Rennes T2 40 m² | 15 488 € | 11 566 € | **10 427 €** | 10 992 € | 10 427 € | 10 183 € | 9 461 € – 10 992 € (±7,3 %) | 9 386 € – 11 813 € | **9 386 € – 11 813 €** |
| Rennes T3 60 m² | 20 508 € | 14 422 € | **14 516 €** | 13 718 € | 14 516 € | 14 665 € | 13 259 € – 14 665 € (±4,8 %) | 13 005 € – 16 507 € | **13 005 € – 16 507 €** |
| Rennes 3 ch. 80 m² | 26 231 € | 17 520 € | **16 208 €** | 14 776 € | 16 208 € | 17 112 € | 14 334 € – 17 112 € (±8,6 %) | 14 281 € – 18 679 € | **14 281 € – 18 679 €** |
| Saint-Malo studio 22 m² | 20 242 € | 13 487 € | **11 103 €** | 12 648 € | 11 103 € | 10 648 € | 10 183 € – 13 047 € (±12,9 %) | 10 448 € – 12 110 € | **10 183 € – 13 047 €** |
| Saint-Malo T2 40 m² | 24 911 € | 15 799 € | **12 857 €** | 14 130 € | 12 857 € | 12 331 € | 11 800 € – 14 559 € (±10,7 %) | 12 052 € – 14 073 € | **11 800 € – 14 559 €** |
| Saint-Malo 2 ch. 60 m² | 33 545 € | 19 626 € | **17 864 €** | 17 601 € | 17 864 € | 17 724 € | 16 969 € – 18 760 € (±5,0 %) | 16 696 € – 19 603 € | **16 696 € – 19 603 €** |
| Saint-Malo 3 ch. 80 m² | 42 632 € | 23 744 € | **19 812 €** | 18 830 € | 19 812 € | 20 542 € | 18 479 € – 21 676 € (±8,1 %) | 18 321 € – 21 941 € | **18 321 € – 21 941 €** |
| Vitré T2 40 m² | 12 635 € | 11 514 € | **10 385 €** | 10 947 € | 10 385 € | 10 142 € | 9 428 € – 10 947 € (±7,3 %) | 8 903 € – 12 223 € | **8 903 € – 12 223 €** |
| Bruz T2 40 m² | 15 172 € | 11 566 € | **10 427 €** | 10 992 € | 10 427 € | 10 183 € | 9 461 € – 10 992 € (±7,3 %) | 9 386 € – 11 813 € | **9 386 € – 11 813 €** |
| Cesson-Sévigné T2 40 m² | 14 466 € | 11 566 € | **10 427 €** | 10 992 € | 10 427 € | 10 183 € | 9 461 € – 10 992 € (±7,3 %) | 9 386 € – 11 813 € | **9 386 € – 11 813 €** |
| Pacé T2 40 m² | 18 104 € | 11 566 € | **10 427 €** | 10 992 € | 10 427 € | 10 183 € | 9 461 € – 10 992 € (±7,3 %) | 9 386 € – 11 813 € | **9 386 € – 11 813 €** |
| Betton T2 40 m² | 17 946 € | 11 566 € | **10 427 €** | 10 992 € | 10 427 € | 10 183 € | 9 461 € – 10 992 € (±7,3 %) | 9 386 € – 11 813 € | **9 386 € – 11 813 €** |
| Liffré T2 40 m² | 19 582 € | 11 670 € | **10 542 €** | 11 112 € | 10 542 € | 10 295 € | 9 585 € – 11 112 € (±7,2 %) | 9 855 € – 11 565 € | **9 585 € – 11 565 €** |
| Saint-Aubin-du-Cormier T2 40 m² | 16 650 € | 11 670 € | **10 542 €** | 11 112 € | 10 542 € | 10 295 € | 9 585 € – 11 112 € (±7,2 %) | 9 855 € – 11 565 € | **9 585 € – 11 565 €** |
| Val-d'Izé T2 40 m² | 19 467 € | 11 514 € | **10 385 €** | 10 947 € | 10 385 € | 10 142 € | 9 428 € – 10 947 € (±7,3 %) | 8 903 € – 12 223 € | **8 903 € – 12 223 €** |
| Rennes Métropole (Chantepie) maison 3 ch. 95 m² | 22 302 € | 19 993 € | **17 615 €** | 16 058 € | 17 615 € | 18 597 € | 15 578 € – 18 597 € (±8,6 %) | 15 222 € – 20 300 € | **15 222 € – 20 300 €** |

#### T8 — Mélanges « proxy local » calculés (Insee × ratios des villes de référence)

| Mélange | Part des nuits studio / 1 / 2 / 3 / 4+ ch. | Part des annonces |
|---|---|---|
| Rennes | 0,106 / 0,505 / 0,230 / 0,102 / 0,057 | 0,087 / 0,458 / 0,233 / 0,137 / 0,086 |
| Saint-Malo | 0,042 / 0,433 / 0,272 / 0,126 / 0,128 | 0,031 / 0,346 / 0,250 / 0,162 / 0,211 |

## 3. Interprétation

### 3.1 Courbe des chambres (T1)

- Le recalage **amortit** la sensibilité des petits logements : une courbe plus prudente relève à la fois le prix du 1 chambre (diviseur plus faible) et baisse celui des grands.
- **Rennes T2** : amplitude B ↔ C = 7,8 % du CA (B +5,4 %, C −2,3 %). Même ordre de grandeur pour Vitré, Betton et les autres T2 urbains.
- **Studio** : 11,6 % ; **T3 (2 ch.)** : 6,5 % ; **3 chambres** : 14,4 % (B −8,8 %, C +5,6 %).
- **Saint-Malo** : plus sensible, car le mélange littoral contient plus de grandes tailles (diviseur 1,23 à 1,41). Studio 18 %, T2 14 %, 2 chambres seulement 0,7 %.

**Conclusion** : la courbe est **robuste pour les T2/T3 urbains (±4 %)**, **moyennement robuste pour les studios, les 3 chambres et plus, et pour Saint-Malo (±6 à ±9 %)**. Aucune courbe plausible ne renverse l'ordre des logements, et aucune ne sort des garde-fous.

### 3.2 Mélange de tailles — Rennes (T2)

- **Mélanges plausibles** (cohérents avec le recensement) : Lyon (actuel), proxy local, Bordeaux.
  - Prix de référence 1 chambre : 68 €, 64 €, 63 €.
  - T2 : 10 427 €, 9 873 €, 9 808 €, soit une amplitude d'environ **6 %**.
- Les extrêmes (petits logements dominants +2,9 %, grands logements −13,2 %) sont incompatibles avec le parc rennais.
- **Rennes est stable.** Le mélange actuel (Lyon) est la borne haute des mélanges plausibles : le proxy local suggère une estimation **≈ 5 % plus basse**.

### 3.3 Mélange de tailles — Saint-Malo (T2)

- **Mélanges plausibles** : intermédiaire, Pays basque (actuel), proxy local.
  - Prix de référence : 95 €, 88 €, 84 €.
  - T2 : 13 508 €, 12 857 €, 12 391 €, soit une amplitude d'environ **9 %** (+5 % / −3,6 % autour de l'actuel).
- Le mélange « urbain » (+11 %) est contredit par le recensement : Saint-Malo compte 43 % de maisons et 34 % de logements de 5 pièces et plus.
- **Saint-Malo n'est pas instable**, mais la confiance est **moyenne** : ±5 % autour de l'actuel dû au seul mélange, à combiner avec la courbe.

### 3.4 Inside Airbnb (T4)

- **Retirer complètement Inside Airbnb** (variante B : courbe initiale, pas de recalage) relève :
  - les T2 urbains de **+11 %** ;
  - les studios de +9,5 % et les 3 chambres de +8 % ;
  - Saint-Malo de **+20 à +23 %** (studio, T2, 3 ch.).
  - Les T3 urbains bougent à peine (−0,6 %).
- **Ce n'est pas une preuve de fragilité de la courbe** : l'écart vient presque entièrement du **recalage**, c'est-à-dire du fait de traiter la moyenne de marché comme le prix d'un 1 chambre. Ce biais est démontré par construction, indépendamment d'Inside Airbnb.
- Sans aucune donnée Inside Airbnb, le seul mélange disponible est le parc Insee brut (variante B'). Il donne −12 à −22 % : c'est une **borne basse**, car le parc de logements contient bien plus de grands logements que le parc de meublés.
- **La calibration actuelle se situe entre la borne haute (pas de recalage, biaisée) et la borne basse (parc brut, biaisée).** Inside Airbnb sert à placer le curseur entre les deux ; il ne crée pas l'effet.
- **Sorties sensibles à Inside Airbnb** : petits logements (studio, T2) et toute la zone littorale. **Sorties peu sensibles** : T3 urbains.

### 3.5 Logements performants (T5)

| Écart d'occupation | Effet sur le CA |
|---|---|
| +3 pts | +9 % |
| +5 pts | +13 à +14 % |
| +7 pts | +17 à +18 % |
| +10 pts | +24 % |

- La règle actuelle (Δ = variation annuelle observée, bornée 3–8 pts : Rennes 5, Saint-Malo 3, Vitré 7) produit donc un scénario performant **+9 à +18 %** au-dessus du réaliste.
- Sans données Émeraude, une amplitude de **+3 à +7 pts** (règle actuelle) est défendable : elle repose sur une variation réellement observée du marché.
- +10 pts (+24 %) reste un test de résistance : il correspondrait à un logement nettement au-dessus du marché, ce que nous ne savons pas encore démontrer localement.

### 3.6 Communes périphériques (T6)

- La base intercommunale est dominée par Rennes (3/4 des annonces). Si le prix de la location courte durée suivait les écarts de loyers avec une élasticité de 0,3 à 0,7, l'estimation des communes périphériques serait **trop haute** de :
  - **biais probablement faible à modéré (−2 à −5 %)** : Cesson-Sévigné, Saint-Grégoire, Chantepie, Vezin-le-Coquet, Saint-Jacques-de-la-Lande ;
  - **biais modéré (−4 à −8 %)** : Bruz, Pacé, Chartres-de-Bretagne ;
  - **biais potentiellement significatif (−5 à −11 %)** : Betton.
- Ce biais **n'est pas corrigé** : l'élasticité loyer / location courte durée n'est pas mesurée.
- **Méthode future** (dès les données Émeraude) :
  - calculer pour chaque logement géré le résidu « réel ÷ modèle » ;
  - estimer un effet commune avec réduction vers l'intercommunalité : poids = n / (n + 10), comme la calibration Émeraude ;
  - tester si cet effet est corrélé à l'indice de loyer. Si c'est le cas, l'élasticité ainsi mesurée permettra d'étendre la correction aux communes sans logement géré.

### 3.7 Robustesse globale (T7)

- L'**incertitude structurelle** (3 courbes × mélanges plausibles du profil) vaut :
  - **±7 %** pour les T2 urbains ;
  - ±5 % pour les T3 ;
  - ±9 % pour les studios, les 3 chambres et les maisons ;
  - **±11 à ±13 %** pour les petits logements de Saint-Malo.
- Pour la plupart des logements, la fourchette **prudent – performant** couvre déjà cette incertitude (Rennes T2 : 9 386 € – 11 813 € autour de 10 427 €).
- **Seuls les studios et T2 de Saint-Malo, et la borne basse de Liffré-Cormier**, nécessitent d'élargir la fourchette au-delà des scénarios.

## 4. Présenter l'incertitude au propriétaire

**Principe** : un chiffre central, une fourchette justifiée et un niveau de confiance motivé. Jamais de chiffre présenté comme garanti.

1. **Estimation centrale** (scénario réaliste), **arrondie à la centaine d'euros** pour éviter la fausse précision (10 427 € s'affiche « environ 10 400 € »). Prix par nuit arrondi à l'euro, occupation au point près.
2. **Fourchette** :
   - bas = min(prudent, borne basse structurelle) ;
   - haut = max(performant, borne haute structurelle).
   - Concrètement : les scénarios actuels, élargis pour Saint-Malo (±12 %) et pour les logements atypiques (±10 %).
3. **Niveau de confiance** (Élevée / Moyenne / Faible) accompagné de **ses deux ou trois raisons principales**, en clair. Par exemple : « Données de marché de 2024 », « Mélange de tailles estimé pour le littoral », « Logement de grande taille, moins de références ».
4. **Variables qui expliquent l'écart entre bas et haut**, affichées dans la méthodologie : écart annuel du marché (±Δ pts d'occupation), atouts du logement, hypothèses de taille (courbe et mélange).

**Déclencheurs proposés d'une confiance plus faible** (règles déterministes, à implémenter avant migration) :

| Situation | Effet proposé |
|---|---|
| Données de marché de plus de 15 mois (déjà en place) | Confiance plafonnée à « Moyenne » |
| Plus de 27 mois, données de secours, ou niveau départemental (déjà en place) | « Faible » |
| Intercommunalité à moins de 50 000 nuits réservées (déjà en place : Vitré, Liffré-Cormier) | « Moyenne » |
| **Profil littoral** (mélange de tailles incertain) | « Moyenne » au plus, fourchette élargie à ±12 % minimum |
| **Logement atypique** : 3 chambres et plus, capacité > typique + 2, ou surface hors [0,6 ; 1,6] × surface typique | Un niveau de moins, fourchette ±10 % minimum |
| **Commune périphérique** dont le loyer est < 0,90 × la moyenne de l'intercommunalité (Bruz, Pacé, Chartres, Betton) | Mention « estimation possiblement haute de 5 à 8 % » ; un niveau de moins tant qu'aucune donnée Émeraude n'existe |
| Saisonnalité de repli (profil uniforme) | Un niveau de moins |
| Avertissement de cohérence (type ≠ chambres, capacité anormale) | Un niveau de moins |
| Calibration Émeraude « calibration » ou « solide » sur le segment | Peut lever d'un niveau (plafonné par la fraîcheur des données) |

## 5. Décisions

| # | Question | Décision proposée | Justification |
|---|---|---|---|
| **D10** | Inside Airbnb | **Conserver uniquement comme calibration interne** (ratios figés dans la configuration, mention CC BY dans la méthodologie, aucune dépendance au moment de l'exécution) | Sans lui, le recalage ne peut être quantifié qu'entre deux bornes biaisées (+11 % / −13 % sur un T2). Il sert à placer le curseur, pas à fournir des données locales |
| **D11** | Mélange de tailles Saint-Malo | **Moyenne confiance** | ±5 % dû au mélange (intermédiaire / Pays basque / proxy local) ; la variante urbaine est contredite par le recensement. Saint-Malo n'est pas instable |
| **D12** | Correction communale par les loyers | **Attendre davantage de données** (ne pas appliquer) | Biais potentiel mesuré (−2 à −11 %), mais l'élasticité n'est pas mesurée. Méthode de correction prête pour les données Émeraude |
| **D13** | Bonus des logements performants | **Ne rien changer** (écart = variation annuelle observée, 3–8 pts) | +3 à +7 pts = +9 à +18 % de CA, défendable ; +10 pts n'est pas démontrable localement |
| **D14** | Courbe des chambres | **Conserver avec intervalle d'incertitude** | ±4 % (T2/T3 urbains) à ±9 % (studios, 3 ch. et plus, Saint-Malo) ; aucun renversement d'ordre |
| **D15** | Calibration Rennes / Saint-Malo | **Rennes et intercommunalités urbaines : suffisamment robuste pour la production, avec fourchette et niveau de confiance. Saint-Malo : utilisable, mais encore incertaine** (confiance « Moyenne », fourchette élargie) | Incertitude structurelle ±5–9 % (Rennes) contre ±11–13 % (petits logements de Saint-Malo) |
| D16 (nouvelle, facultative) | Remplacer le mélange « Lyon » / « Pays basque » par le **proxy local Insee** | **Recommandé au prochain cycle, sur votre accord** | Fondé sur le parc local officiel ; corrige une surestimation probable d'environ 5 % (Rennes) et 3,6 % (Saint-Malo). Non appliqué dans cette phase (analyse uniquement) |

## 6. Le modèle est-il prêt pour la migration Framer ?

**Oui, sous trois conditions, à remplir avant la phase Framer :**

1. **Implémenter l'affichage honnête de l'incertitude** (§4) : arrondis, fourchette élargie selon les règles, déclencheurs de confiance et raisons affichées. C'est une petite modification du moteur et de l'interface, avec tests. Elle n'a pas été faite dans cette phase, qui était limitée à l'analyse.
2. **Valider les décisions D10 à D16.**
3. **Migrer d'abord sur une page de test cachée** (`/estimateur-v2`, non indexée), comme prévu dans le plan de migration.

**Sur le fond** : le modèle est **robuste** au sens où aucune hypothèse plausible ne renverse les conclusions (ordre des logements, ordre de grandeur, absence d'aberration), et où l'incertitude est **mesurée et bornée** (±4 à ±13 % selon les cas). **Il n'est pas « précis » au sens d'un outil alimenté par des données locales par typologie** : cette précision viendra des données Émeraude.

## 7. Tableau final

| Hypothèse | Donnée utilisée | Confiance | Impact (sur le CA) | Décision | Action future |
|---|---|---|---|---|---|
| Base de marché par intercommunalité | Ille & Vilaine Tourisme / Lighthouse 2024 | Moyenne (données de 2024) | Niveau général | Conserver | Intégrer la publication 2025 dès sa sortie |
| Recalage moyenne → 1 chambre | Identité de cohérence + mélange de tailles | Élevée (principe), moyenne (ampleur) | −11 % sur les T2 urbains, −20 % à Saint-Malo vs sans recalage | Conserver | Remplacer le mélange par le proxy local (D16), puis par les données Émeraude |
| Mélange de tailles Rennes (Lyon) | Inside Airbnb Lyon ; contrôlé par le recensement | Moyenne-élevée | ±3 % (plausibles) | Conserver (borne haute) | D16 : proxy local (−5 %) |
| Mélange de tailles Saint-Malo (Pays basque) | Inside Airbnb Pays basque ; contrôlé par le recensement | Moyenne | ±5 % | Conserver, confiance « Moyenne » | D16 ; données Émeraude littorales |
| Courbe des chambres | Inside Airbnb (3 villes, régression) | Moyenne | ±4 % (T2/T3) à ±9 % (studio, 3 ch. et plus) | Conserver avec intervalle | Recalibrer avec ≥ 5 logements Émeraude par taille |
| Occupation par taille | Inside Airbnb (occupation estimée) | Moyenne-faible | −8 pts pour les 3 ch. et plus : ±10 % sur les grands logements | Conserver | Données Émeraude |
| Capacité typique / +6 % par voyageur | Inside Airbnb (médianes, régression) | Moyenne | ±3 % | Conserver | — |
| Salles de bain au-delà du typique, maison 0, canapé 0 | Suppression de doubles comptages (tests) | Élevée | ≤ ±5 % | Conserver | — |
| Surface ±0,3 %/m² | Hypothèse ; surfaces typiques cohérentes avec la Carte des loyers | Moyenne | ±6 % au plus | Conserver | Données Émeraude |
| Emplacement | Hypothèse ; bornes ≤ dispersion à taille égale | Faible-moyenne | jusqu'à +10 % / −6 % | Conserver | Données Émeraude par quartier |
| Équipements | Hypothèse plafonnée | Faible-moyenne | ≤ +10 % | Conserver | — |
| Saisonnalité urbaine (hôtels Insee) | Insee 2025 + Lighthouse 2024 | Moyenne | ±6 % selon les mois retirés | Conserver | Données Émeraude mensuelles |
| Saisonnalité littorale | Lighthouse 2024 (départemental) | Moyenne-élevée | −15 % si juillet et août sont retirés | Conserver | — |
| Scénarios (Δ observé 3–8 pts) | Variation annuelle Lighthouse | Moyenne | ±9 à ±18 % | Ne rien changer (D13) | Quartile supérieur mesuré sur les logements Émeraude |
| Communes périphériques | Carte des loyers (biais potentiel) | — | −2 à −11 % (non appliqué) | Attendre (D12) | Effet commune estimé sur les résidus Émeraude |
| Frais de ménage | Séparés ; prix de marché non corrigé | Élevée (règle) | Invariance testée | Conserver | Définition Lighthouse à documenter si elle est publiée |
| Frais Airbnb 15,5 % HT, TVA en option | Règle Airbnb au 13/10/2026 | Élevée | — | Conserver | Surveiller l'effet sur les prix de marché 2026 |
| Commission (D2) | Règle métier | Élevée | — | Conserver | — |

## 8. Fichiers produits

- `scripts/audit/sensitivity.mjs` : toutes les analyses de cette phase (variantes de configuration, déterministes).
- `scripts/audit/insee-rooms.mjs`, `reports/audit-insee-pieces.json` : structure du parc (recensement).
- `scripts/audit/datatourisme-mix.mjs`, `reports/audit-datatourisme-mix.json` : essai DATAtourisme (non concluant).
- `reports/validation-hypotheses-data.json`, `reports/validation-hypotheses-tableaux.md` : résultats.
- `tests/sensitivity.test.mjs` : 10 tests (reproductibilité, schéma des variantes, cohérence des mélanges, ordre des scénarios, intervalles).


## 9. Implémentation de l'incertitude et du niveau de confiance (moteur 1.2.0)

Décisions appliquées : D10 à D16 validées le 4 octobre 2026.
- **Inchangés** : courbe des chambres (0,82 / 1 / 1,45 / 1,85 / 2,50), mélanges de tailles (Lyon / Pays basque), aucune correction par les loyers, bonus « performant » inchangé.
- **Ajouté** : l'incertitude et la confiance. Le calcul de l'estimation elle-même n'a pas changé (les 65 tests antérieurs passent à l'identique).

Code : `engine/uncertainty.js`. Paramètres : `config/config.json` → `uncertainty`. Tests : `tests/uncertainty.test.mjs` (18) et `tests/v2-build.test.mjs` (5).

### 9.1 Facteurs détectés (déterministes)

| Facteur | Groupe | Condition | Poids (confiance) | Composante (incertitude) | Règle impérative |
|---|---|---|---|---|---|
| Données anciennes | marché | fraîcheur « orange » (15 à 27 mois après la fin de la période) | 1 | 2 % | — |
| Données trop anciennes | marché | fraîcheur « rouge » (> 27 mois) | 3 | 6 % | LOW |
| Petit marché | marché | < 50 000 nuits réservées dans l'intercommunalité | 1 | 4 % | — |
| Marché voisin | marché | intercommunalité de repli | 1 | 5 % | — |
| Données départementales | marché | repli départemental | 2 | 8 % | LOW |
| Données de secours | marché | données intégrées (hors ligne) | 1 | 2 % | LOW |
| Marché côtier | profil | profil « littoral » (D11 : mélange de tailles moins certain) | 1 | (dans la base 12 %) | — |
| Grand logement | logement | 3 chambres et plus | 1 | 5 % | plancher 10 % |
| Studio | logement | 0 chambre | 0 | 5 % | — |
| Capacité un peu atypique | logement | > capacité typique + 2 | 1 | 4 % | plancher 10 % |
| Capacité très atypique | logement | > 2 × chambres + 2, ou ≥ capacité typique + 4 | 2 | 8 % | plancher 10 % |
| Surface atypique | logement | hors [0,6 ; 1,6] × surface typique | 1 | 3 % | plancher 10 % |
| Surface très atypique | logement | hors [0,4 ; 2,2] × surface typique | 2 | 6 % | plancher 10 % |
| Saisonnalité de repli | saisonnalité | profil mensuel indisponible | 1 | 5 % | — |
| Commune signalée | commune | Bruz, Pacé, Chartres-de-Bretagne, Betton (loyers < 0,90 × moyenne pondérée, phase 5 ; D12 : signalé, non corrigé) | 1 | 4 % | — |

### 9.2 Niveau de confiance

- Score = somme, sur chaque groupe, du score du groupe.
- **Groupe logement** : *maximum* des poids. Une même atypie (grand logement, capacité, surface) n'est comptée qu'une fois.
- **Autres groupes** : somme plafonnée (marché ≤ 2, profil ≤ 1, saisonnalité ≤ 1, commune ≤ 1 ; logement ≤ 2).
- **HIGH** si score = 0 ; **MEDIUM** si 1 ou 2 ; **LOW** si ≥ 3, ou si une règle impérative s'applique (données trop anciennes, départementales ou de secours).

**Justification des seuils** :
- un seul facteur suffit à quitter HIGH (exigence : données fraîches, zone bien couverte, typologie standard) ;
- LOW suppose au moins trois sources d'incertitude indépendantes, ou une donnée de marché inadaptée ;
- les plafonds de groupe évitent qu'une seule cause (par exemple un petit marché ancien) fasse tomber en LOW.

Les raisons retournées (`summary.confidenceReasons`) sont les libellés des facteurs actifs. En HIGH, elles sont positives : « Marché urbain bien documenté », « Typologie cohérente avec les données de calibration », « Saisonnalité mensuelle disponible ».

### 9.3 Incertitude

```
incertitude = clamp( max( √(base² + Σ composante²), plancher ), base, plafond )
```

- **Base** : 7 % (urbain) ou 12 % (côtier). Ce sont les incertitudes structurelles mesurées en phase 5 : T2 urbain ±7,3 % ; petits logements côtiers ±11 à ±13 %.
- **Composantes** : combinées en **somme quadratique**. Elles sont traitées comme indépendantes : deux facteurs de 5 % donnent 7,1 %, pas 10 %. C'est ce qui évite l'addition mécanique.
- **Plancher** : 10 % pour tout logement atypique (grand, capacité ou surface atypique).
- **Plafond** : 25 %.
- L'incertitude affichée est arrondie à l'unité, et la fourchette est calculée avec ce pourcentage arrondi :
  - bas = central × (1 − u) ; haut = central × (1 + u) ;
  - les trois montants sont arrondis à la centaine d'euros (`roundingStep` = 100) ;
  - les calculs internes restent exacts (`summary.model.exact`).

### 9.4 Résultat retourné par le moteur

```json
"summary": {
  "basis": "CA des nuits, scénario réaliste",
  "central": 10400, "low": 9700, "high": 11200, "uncertaintyPct": 7,
  "confidence": "MEDIUM",
  "confidenceReasons": ["Données de marché datant de 21 mois (dernière publication disponible)"],
  "uncertaintyReasons": ["…"],
  "owner": { "central": 7000, "low": 6500, "high": 7500 },
  "adr": 68, "occupancyPct": 50,
  "scenarios": { "prudent": 9400, "realiste": 10400, "performant": 11800 },
  "notes": {
    "range": "Cette fourchette reflète l'incertitude de l'estimation et non une garantie de revenus.",
    "scenarios": "Les scénarios prudent, réaliste et performant décrivent des niveaux de performance du logement ; ils sont distincts de la fourchette d'incertitude de l'estimation."
  },
  "model": { "…": "base, composantes, plancher, score par groupe, profil du logement, valeurs exactes" }
}
```

(Valeurs d'exemple calculées pour un T2 à Rennes, pas codées en dur.)

`data.confidence` (élevée / moyenne / faible) reste fourni pour compatibilité ; il est désormais dérivé du même calcul.

**Scénarios et fourchette sont distincts** :
- les **scénarios** décrivent la performance du logement (atteinte ou non de ses atouts, variation annuelle du marché) ;
- la **fourchette** décrit l'incertitude de l'estimation du scénario réaliste.

L'interface V2 affiche les deux séparément, avec la mention « non une garantie de revenus ».

### 9.5 Exemples (données réelles au 04/10/2026 ; dernière colonne : même logement avec des données de moins de 15 mois)

| Logement | Estimation centrale (CA des nuits) | Fourchette d'incertitude | Incertitude | Confiance (données réelles) | Raisons | Confiance si données récentes |
|---|---|---|---|---|---|---|
| Rennes · T2 40 m², 2 voy. | 10 400 € | 9 700 € – 11 200 € | ±7 % | **MEDIUM** | Données de marché datant de 21 mois (dernière publication disponible) | HIGH (±7 %) |
| Rennes · T3 60 m², 4 voy. | 14 500 € | 13 500 € – 15 500 € | ±7 % | **MEDIUM** | Données de marché datant de 21 mois (dernière publication disponible) | HIGH (±7 %) |
| Rennes · 3 ch. 80 m², 6 voy. | 16 200 € | 14 600 € – 17 800 € | ±10 % | **MEDIUM** | Données de marché datant de 21 mois (dernière publication disponible) ; Logement de 3 chambres : moins de références comparables | MEDIUM (±10 %) |
| Rennes · T2 hypercentre rénové | 13 400 € | 12 500 € – 14 400 € | ±7 % | **MEDIUM** | Données de marché datant de 21 mois (dernière publication disponible) | HIGH (±7 %) |
| Saint-Malo · T2 40 m², 2 voy. | 12 900 € | 11 300 € – 14 400 € | ±12 % | **MEDIUM** | Données de marché datant de 21 mois (dernière publication disponible) ; Marché côtier : mélange de tailles des logements moins certain | MEDIUM (±12 %) |
| Saint-Malo · 3 ch. 80 m², 6 voy. | 19 800 € | 17 200 € – 22 400 € | ±13 % | **LOW** | Données de marché datant de 21 mois (dernière publication disponible) ; Marché côtier : mélange de tailles des logements moins certain ; Logement de 3 chambres : moins de références comparables | MEDIUM (±13 %) |
| Liffré · T2 40 m² (petit marché) | 10 500 € | 9 700 € – 11 400 € | ±8 % | **MEDIUM** | Données de marché datant de 21 mois (dernière publication disponible) ; Marché de petite taille (9 482 nuits réservées sur la période) | MEDIUM (±8 %) |
| Betton · T2 40 m² (commune signalée) | 10 400 € | 9 600 € – 11 300 € | ±8 % | **MEDIUM** | Données de marché datant de 21 mois (dernière publication disponible) ; Commune aux loyers nettement inférieurs à la moyenne de Rennes Métropole : l'estimation, fondée sur la moyenne intercommunale, peut être un peu haute (non corrigé). | MEDIUM (±8 %) |
| Rennes · T2 40 m² pour 6 voy. (capacité atypique) | 11 700 € | 10 400 € – 13 000 € | ±11 % | **LOW** | Données de marché datant de 21 mois (dernière publication disponible) ; Capacité très inhabituelle pour 1 chambre(s) (6 voyageurs) | MEDIUM (±11 %) |
| Vitré · maison 4 ch. 160 m², 10 voy. | 25 800 € | 23 200 € – 28 400 € | ±10 % | **LOW** | Données de marché datant de 21 mois (dernière publication disponible) ; Marché de petite taille (34 359 nuits réservées sur la période) ; Logement de 4 chambres : moins de références comparables | MEDIUM (±10 %) |

**Point important** : avec les données disponibles aujourd'hui (année 2024, 21 mois), **aucun logement n'est en HIGH**, car l'ancienneté des données suffit à abaisser la confiance. Un T2 ou T3 standard à Rennes passera en **HIGH dès l'intégration de la publication 2025** d'Ille & Vilaine Tourisme. C'est le comportement voulu (« données de marché fraîches » est une condition de HIGH), pas une anomalie.

### 9.6 Limites

1. **Bases et composantes** : elles viennent de l'analyse de sensibilité (phase 5), qui reposait elle-même sur des hypothèses (courbes et mélanges plausibles). Ce sont des ordres de grandeur, pas des intervalles de confiance statistiques au sens strict.
2. **Indépendance des composantes** : la somme quadratique suppose des facteurs indépendants. Ce n'est qu'approximatif (un grand logement côtier cumule deux incertitudes de structure liées). Le plafond de 25 % borne le cas extrême.
3. **Logements très performants** : la fourchette ne couvre pas une sous-estimation possible de ces logements (D13). C'est le scénario « Performant » qui décrit ce cas, pas l'incertitude.
4. **Communes signalées** : le biais potentiel est asymétrique (estimation possiblement **haute**), mais la fourchette reste symétrique. La raison affichée le précise.
5. **Mode hors ligne** : quand la page ne peut pas lire les données en ligne (fichier ouvert localement, GitHub indisponible), les données de secours imposent LOW. Le fonctionnement reste correct, avec le message adapté.

### 9.7 Préparation de /estimateur-v2 (non exécutée)

- `deploy/estimateur-v2/estimateur-v2-validation.html` : version de validation (badge, noindex ajouté par script en complément du réglage de page Framer).
- `embed/estimateur-v2.html` : future version définitive (sans badge, sans noindex).
- `deploy/estimateur-v2/CHECKLIST.md` : étapes Framer prévues (nouvelle page non indexée, hors sitemap, sans lien, hauteur automatique), vérifications et retour arrière.
- Aucune modification de Framer, de l'Embed de production ni de `/estimateur` ; aucune publication.
