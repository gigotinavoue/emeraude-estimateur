# Actualisation des données de marché — octobre 2026

*Réalisée le 4 octobre 2026. Moteur 1.2.0 **non modifié** (empreintes vérifiées par le test DR14). Framer non touché. Rien n'a été publié (l'émulateur en ligne n'a pas été republié).*

## Synthèse

- **Aucune donnée 2025 comparable par intercommunalité** (prix ou occupation) n'est publiée au 04/10/2026. La base de marché reste donc le **millésime 2024**. L'âge est de 21 mois, la fraîcheur MEDIUM (orange) et la confiance MOYENNE.
- **Chiffres clés 2025 d'Ille & Vilaine Tourisme** (mai 2026) : lus page par page, 17 indicateurs départementaux enregistrés avec leur page.
  - Occupation 42 % (identique à 2024) et durée de séjour 3,2 nuits (contre 3,3) : ils confirment la base.
  - **Le TJM (137 €) n'est pas comparable** : la même publication recalcule 2024 à environ 140,6 €, contre 104 € dans le bilan 2024. La série a été révisée. Classement B : stocké, non utilisé.
- **Rennes 2025** : la demande sur les plateformes baisse (Eurostat −6,3 % de nuits louées ; AUDIAR −8 % de nuitées sur 10 mois) et l'offre est stable. Le scénario prudent (−5 pts) couvre ce signal ; aucune correction n'est appliquée.
- **Système de données** :
  - métadonnées de fraîcheur sur chaque donnée ;
  - historique par millésime (`data/market/2024`, `data/market/2025`) sans écrasement silencieux ;
  - fraîcheur par famille dans `dist/data-status.json` ;
  - `npm run data:update`, qui enchaîne récupération, construction, historique, fraîcheur, émulateur et tests ;
  - procédure annuelle documentée.
- **Les 8 logements de référence sont strictement identiques avant et après** (test DR9).
- **Tests : 109 / 109 réussis** (94 existants et 15 nouveaux).

## 1. Sources disponibles (audit au 04/10/2026)

| # | Source | Organisme | Publication | Période | Territoire | Variables | Granularité | Fréquence | Licence / réutilisation commerciale | Automatisable | Stabilité URL | Intérêt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [Bilan hébergements locatifs 2024](https://www.ille-et-vilaine-tourisme.bzh/app/uploads/bretagne-35/2025/04/2024_Bilan_frequentation_hebergements_locatifs.pdf) | Ille & Vilaine Tourisme (Lighthouse) | avril 2025 | 2024 | 18 EPCI + département | TJM, occupation, nuits, durée de séjour ; mensuel départemental | EPCI / mois (dép.) | annuelle | non précisée ; citation des agrégats avec source | non (PDF) | moyenne (chemin daté) | **Élevé : seule base par EPCI** |
| 2 | [Chiffres clés 2025](https://www.ille-et-vilaine-tourisme.bzh/app/uploads/bretagne-35/2026/06/2025_Chiffres-Cles.pdf) | Ille & Vilaine Tourisme | mai 2026 (déposé en juin) | 2025 | département (parts d'offre par EPCI) | nuits, occupation, TJM, revenu, annonces, séjour | département, année | annuelle | non précisée | non (PDF) | moyenne | Moyen : contrôle et tendance |
| 3 | [Observatoire du tourisme, bilan 2025](https://www.audiar.org/wp-content/uploads/2026/07/Doc_obs_Tourisme_2025_V2.pdf) | AUDIAR / Rennes Métropole | juillet 2026 | 2025 | Rennes Métropole | annonces actives (AirDNA), nuitées des plateformes, meublés déclarés, taxe de séjour | EPCI, année | annuelle | non précisée | non (PDF) | moyenne | Moyen : tendance offre et demande, sans prix ni occupation |
| 4 | Eurostat `tour_ce_oarc` | Eurostat | continue | → 2025 | Rennes (greater city) | séjours, nuits louées, nuitées | ville, année | trimestrielle | Décision 2011/833/UE, réutilisation commerciale autorisée | **oui** (API JSON-stat, sans clé) | élevée | Contrôle de la durée de séjour et de la tendance |
| 5 | Eurostat `tour_ce_omn12` | Eurostat | continue | → 2026-03 | Bretagne (NUTS 2) | nuitées des plateformes | région, mois | mensuelle (≈ 6 mois de délai) | idem | **oui** | élevée | Contrôle du mois de pointe |
| 6 | Insee Melodi `DS_TOUR_FREQ` | Insee | continue | → 2026-07 | Ille-et-Vilaine | taux d'occupation hôtelier | département, mois | mensuelle (≈ 2 mois) | Licence Ouverte Etalab 2.0, commerciale autorisée | **oui** (API sans clé) | élevée | Saisonnalité urbaine (proxy) |
| 7 | Tourisme Bretagne (CRT), bilans | CRT Bretagne | 2025 | 2024 seulement | Bretagne / destinations | locatif régional | région | annuelle | non précisée | non | moyenne | Rejetée : rien de plus récent que 2024 |
| 8 | data.gouv.fr (taxe de séjour, meublés : Saint-Malo, Vitré, Liffré-Cormier, Rennes Métropole) | — | — | — | — | — | — | — | — | — | — | Aucun jeu de données pertinent |
| 9 | data.rennesmetropole.fr | Rennes Métropole | — | — | — | — | — | — | — | — | — | Aucune donnée d'hébergement touristique |
| 10 | DATAtourisme | ADN Tourisme | continue | — | national | offre déclarée (pas de taille ni de performance) | établissement | quotidienne | Licence Ouverte | oui | élevée | Rejetée pour le calcul (D16 : piste pour le mélange de tailles) |
| 11 | Atout France | Atout France | — | — | — | hébergements collectifs / classement | — | — | — | — | — | Rejetée : pas de meublés en performance |
| 12 | Carte des loyers 2025 | ANIL / DHUP | 2025 | 2025 | commune | loyers d'annonce au m² | commune | annuelle | Etalab 2.0 | oui | élevée | Audit uniquement (D12 : pas de correction de loyer) |
| 13 | Inside Airbnb | Inside Airbnb | trimestrielle | — | Lyon, Bordeaux, Pays basque | ratios entre tailles | — | — | CC BY 4.0, ne pas republier | non (pas de nouvelle récupération, D10) | — | Calibration interne seulement |
| 14 | geo.api.gouv.fr | État | continue | — | communes / EPCI | référentiel | — | — | Licence Ouverte | oui | élevée | Référentiel (codes, rattachements) |
| 15 | AirROI, scraping Airbnb | — | — | — | — | — | — | — | — | — | — | **Exclus** (décision utilisateur, interdit) |

## 2. Sources retenues / rejetées

**Retenues :**
- n° 1 : base de calcul ;
- n° 2 et 3 : indicateurs de contrôle et de tendance, historisés ;
- n° 4 et 5 : contrôles automatiques ;
- n° 6 : saisonnalité urbaine (proxy) ;
- n° 14 : référentiel.

**Rejetées pour le calcul :**
- n° 7 : pas plus récente ;
- n° 8 et 9 : rien de publié ;
- n° 10 et 11 : pas de performance ;
- n° 12 : D12 ;
- n° 13 : calibration seulement, D10 ;
- n° 15 : interdit.

## 3. Nouvelles données 2025 (lecture intégrale, aucune valeur déduite)

**Chiffres clés 2025**, Ille & Vilaine Tourisme. Source citée : « Lighthouse – 2025 », logements entiers, Airbnb + VRBO + Booking. Valeurs départementales sauf indication contraire.

| Indicateur | Valeur | Unité | Période | Définition (source) | Page |
|---|---|---|---|---|---|
| Nuits réservées | 1,337 | millions | 2025 | logements entiers | 15 |
| Nuitées correspondantes | 4,278 | millions | 2025 | | 15 |
| Taux d'occupation | 42 | % | 2025 | | 15 |
| Évolution de l'occupation | −0,2 | point vs 2024 | 2025 | « s'explique par la hausse importante des annonces publiées » | 15 |
| Annonces publiées | 198 235 | annonces | 2025 | cumul non défini ; la page indique +6,5 % **et** +6,2 % | 15 |
| Tarif journalier moyen (TJM) | 137 | €/nuit | 2025 | | 15 |
| Évolution du TJM | −3,6 | € vs 2024 | 2025 | implique un TJM 2024 d'environ 140,6 € | 15 |
| Revenu annuel | 188,239 | M€ | 2025 | +2,0 % vs 2024 | 15 |
| Durée moyenne de séjour | 3,2 | jours | 2025 | | 15 |
| Évolution des nuits réservées | +5,1 | % vs 2024 | 2025 | | 15 |
| Meublés et gîtes | 4 378 (21 684 lits) | unités | 2025 | offre recensée | 14 |
| Part classée | 61,5 | % | 2025 | | 14 |
| Part de la capacité locative | Saint-Malo Agglomération 38,2 ; Côte d'Émeraude 12,6 ; Rennes Métropole 9,6 ; Pays de Dol 7,6 ; Couesnon 4,7 | % | 2025 | parts d'offre, pas de performance | 14 |
| Part des nuitées marchandes en locatif | 43,5 | % | 2025 | | 28 |

**AUDIAR, bilan 2025** (Rennes Métropole) :

| Indicateur | Valeur | Page |
|---|---|---|
| Annonces actives par mois (AirDNA) | 2 360 (2 400 en 2024) | 24 |
| dont logements entiers | 1 710 (environ −60) | 24 |
| Nuitées des plateformes, janvier à octobre | −8 % (juillet +4 %, août +5 %) | 10 |
| Nuitées marchandes, tous hébergements | −6 % | 4, 10 |
| Meublés déclarés (taxe de séjour) | 1 909 (+61 %, effet réglementaire) | 22 |
| Taxe de séjour des plateformes | 703 591 € (682 000 € en 2024) | 11 |

**Eurostat (automatique, récupéré le 2026-10-04T21:40Z)** :
- Rennes 2025 : 225 633 nuits louées (−6,3 %), 75 660 séjours, durée de séjour 2,98 ;
- Bretagne 2025 : 12,45 M de nuitées sur plateformes (+9,7 %), mensuel disponible jusqu'en mars 2026.

**Insee hôtels (automatique)** : mensuel jusqu'en juillet 2026 ; l'année complète 2025 est utilisée pour le profil urbain.

Fichiers :
- `data/raw/adt35/indicateurs_departement_2025.csv` ;
- `data/raw/audiar/indicateurs_rennes_metropole_2025.csv` ;
- `data/raw/manifest.json` (URL, date de publication, date réelle de téléchargement, SHA-256 du PDF, pages, méthode d'extraction).

## 4. Comparaison 2024 vs 2025 (département)

| Indicateur | Bilan 2024 (avril 2025) | Chiffres clés 2025 (mai 2026) | Comparable ? | Commentaire |
|---|---|---|---|---|
| Nuits réservées | 1 281 472 | 1,337 M | oui | +4,3 % calculé contre +5,1 % publié : 2024 a été révisé à la marge |
| Occupation | 42 % | 42 % | oui | stable |
| Durée de séjour | 3,3 | 3,2 | oui | −3 % |
| TJM | 104,3 € (« 104 € ») | 137 € (2024 republié à environ 140,6 €) | **non** | même fournisseur et même libellé, mais série révisée d'environ +35 % ; cause non documentée |
| Revenu | 1 660 € par mois et par logement | 188,2 M€ au total | non | indicateurs différents |

Le bilan 2024 (p. 5) signalait déjà un changement de fournisseur (AirDNA → Lighthouse) rendant les années antérieures non comparables. La révision du TJM dans les Chiffres clés 2025 n'est accompagnée d'aucune note méthodologique.

## 5. Décision par variable

| Variable | Ancienne donnée | Nouvelle donnée | Période | Source | Comparable ? | Décision |
|---|---|---|---|---|---|---|
| Prix moyen par EPCI (Rennes 80 €, Saint-Malo 119 €, Vitré 81,3 €…) | bilan 2024 | aucune | 2024 | Ille & Vilaine Tourisme | — | **C : conserver** |
| Occupation par EPCI | bilan 2024 | aucune | 2024 | idem | — | **C : conserver** |
| Durée de séjour par EPCI | bilan 2024 | aucune | 2024 | idem | — | **C : conserver** |
| TJM départemental | 104,3 € | 137 € | 2025 | Chiffres clés 2025 | non (série révisée) | **B : stocker les deux, ne pas remplacer** |
| Occupation départementale | 42 % | 42 % | 2025 | Chiffres clés 2025 | oui | **B : contrôle.** Remplacer seule l'occupation mélangerait deux millésimes dans une même entrée (prix 2024, occupation 2025). La valeur est identique, donc sans effet |
| Durée de séjour départementale | 3,3 | 3,2 | 2025 | Chiffres clés 2025 | oui | **B : contrôle** (même raison) |
| Nuits réservées départementales | 1 281 472 | 1,337 M | 2025 | Chiffres clés 2025 | oui | B : tendance (+4 à +5 %) |
| Demande à Rennes | — | −6,3 % (Eurostat), −8 % (AUDIAR, 10 mois) | 2025 | Eurostat, AUDIAR | définitions différentes | B : tendance ; couverte par le scénario prudent ; pas de correction |
| Offre à Rennes Métropole | — | 2 360 annonces par mois, stable | 2025 | AUDIAR (AirDNA) | fournisseur différent | **D : signal, non utilisé** |
| Saisonnalité urbaine (occupation) | Insee 2025 | Insee 2025, actualisée automatiquement | 2025 | Insee | oui | **A : automatique** (même année complète, inchangée) |
| Saisonnalité littorale (occupation) | mensuel départemental 2024 | aucune (pas de mensuel 2025 publié) | 2024 | Ille & Vilaine Tourisme | — | **C : conserver** |
| Saisonnalité des prix | mensuel départemental 2024 | aucune | 2024 | idem | — | **C : conserver** |
| Contrôles Eurostat | 2025 | 2025, récupéré à nouveau | 2025 | Eurostat | oui | A : automatique |
| Courbe des chambres, mélange de tailles | Inside Airbnb | — | — | — | — | inchangé (D10, D14) |

## 6. Variables remplacées, conservées, non disponibles

- **Remplacées** : aucune variable du calcul. Les séries Eurostat et Insee ont été récupérées à nouveau le 2026-10-04 à 21:40 UTC. Les dernières périodes sont identiques à celles du matin, donc aucun indice n'a changé.
- **Conservées** : prix, occupation et durée de séjour par EPCI 2024 ; profils mensuels départementaux 2024 ; toute la configuration du modèle.
- **Ajoutées (sans effet sur le calcul)** :
  - 17 indicateurs départementaux 2025 ;
  - 6 indicateurs AUDIAR 2025 ;
  - métadonnées de fraîcheur et de provenance ;
  - comparaison automatique 2024 / 2025 (`controls.indicatorComparisons`).
- **Non disponibles** : prix et occupation 2025 par EPCI ; mensuel 2025 ; données par taille de logement ; données communales. Le bilan 2025 par EPCI n'est pas en ligne : la page ne liste que 2021 à 2024, et les adresses probables de mars à octobre 2026 répondent « 410 ».

## 7. Sources automatisables et sources manuelles

| Automatique : `npm run data:update`, chaque mois | Manuel (procédure `docs/procedure-donnees-annuelles.md`) |
|---|---|
| Eurostat Rennes (annuel, mis à jour chaque trimestre) | Bilan hébergements locatifs par EPCI (annuel, vers avril) : **c'est la seule source qui fait évoluer la base** |
| Eurostat Bretagne (mensuel) | Chiffres clés départementaux (annuel, mai-juin) |
| Insee hôtels (mensuel) | AUDIAR Rennes Métropole (annuel, juillet) |

`data:update` enchaîne :
1. `fetch` : 3 essais ; refuse toute réponse dont la période recule ; archive la version précédente dans `data/raw/*/archive/` à chaque nouvelle période ; garde la dernière version valide en cas d'échec ;
2. `normalize` ;
3. `validate` : bornes, variations brutales → valeur précédente conservée ;
4. `build-market` : métadonnées, indicateurs, comparaisons ;
5. `history-market` : `data/market/<année>/`, archivage horodaté si un contenu change, journal `data/history/updates.jsonl` ;
6. `check-freshness` : `dist/freshness.json` et `dist/data-status.json` ;
7. `build-embed` : émulateur et Embed ;
8. `npm test`.

L'ancienne commande `update` appelle désormais `data:update` : il n'y a pas de doublon.

## 8. Architecture de repli

| Rang | Niveau | Mise en œuvre | Effet sur la confiance | État actuel |
|---|---|---|---|---|
| 1 | Données Émeraude validées | `aggregates.json` (≥ 3 logements, ≥ 6 mois), calibration plafonnée, au moins 40 % de poids au marché public | — | aucune donnée chargée |
| 2 | Donnée publique locale récente (commune) | `markets["commune:…"]` | — | aucune source gratuite |
| 3 | EPCI | `markets["epci:…"]` | référence | **utilisé (2024)** |
| 4 | Marché voisin, puis département | chaîne `communes.json` (Châteaubourg → Vitré → Rennes Métropole → département) | voisin : MOYENNE ; département : FAIBLE | disponible |
| 5 | Dernière version validée | `kept_previous`, fichier brut précédent, cache du navigateur | la fraîcheur se dégrade | disponible |
| 6 | Données intégrées | instantané dans la page | FAIBLE + bandeau | disponible |

Chaque repli est affiché (bandeau « Données de repli utilisées », raisons de confiance). Tout cela existait déjà dans le moteur 1.2.0 ; aucune modification n'a été nécessaire.

## 9. Fraîcheur

Seuils : HIGH ≤ 15 mois, MEDIUM ≤ 27 mois, LOW au-delà, comptés depuis la fin de la période.

| Famille | Rôle | Données | Fin de période | Âge | Statut | Classe |
|---|---|---|---|---|---|---|
| Marché (prix, occupation, séjour) | calcul | EPCI 2024 | 2024-12-31 | 21 mois | **MEDIUM** | OBSERVÉE |
| Saisonnalité, occupation urbaine | calcul | Insee hôtels | 2025-12-31 | 9 mois | HIGH | PROXY |
| Saisonnalité, occupation littorale | calcul | meublés du département | 2024-12-31 | 21 mois | MEDIUM | PROXY |
| Saisonnalité, prix | calcul | meublés du département | 2024-12-31 | 21 mois | MEDIUM | PROXY |
| → Famille saisonnalité | | | | | **MEDIUM** | |
| Indicateurs annuels | contrôle | Chiffres clés et AUDIAR 2025 | 2025-12-31 | 9 mois | HIGH | OBSERVÉE |
| Contrôles Eurostat | contrôle | Rennes 2025 | 2025-12-31 | 9 mois | HIGH | OBSERVÉE |
| **Confiance « données » globale** | | minimum des familles de calcul | | | **MEDIUM** | |

Chaque entrée de `dist/market.json` porte désormais :
- `meta` = {source, sourceUrl, publicationDate, periodStart, periodEnd, retrievedAt, territory, methodology, license, dataClass, freshnessDays, freshnessMonths, status} ;
- `retrievedAt` = date réelle : téléchargement du PDF (registre) ou appel d'API.

**Classification.** Le détail est dans `CLASSIFICATION`, publié dans `dist/data-status.json`. Aucun proxy n'est présenté comme une observation locale.

| Classe | Éléments |
|---|---|
| OBSERVÉE | marché par EPCI, indicateurs, Eurostat |
| PROXY | tous les profils saisonniers : séries départementales ou hôtelières appliquées aux communes |
| CALIBRATION | courbe des chambres et mélange de tailles (Inside Airbnb) ; données Émeraude |
| HYPOTHÈSE | logement de référence, emplacement, équipements, scénarios, frais |
| FALLBACK | repli département ou voisin ; données intégrées |

**Affichage dans l'émulateur** (modèle de page uniquement, moteur inchangé) :
- « Données de marché : 2024 » ;
- « Âge : 21 mois · Confiance : MOYENNE » ;
- « Saisonnalité : occupation 2025 · prix 2024 (séries départementales utilisées comme profil, non locales) » ;
- « Dernière actualisation : 4 octobre 2026 » ;
- bandeau « ⚠️ Les données de marché disponibles sont anciennes (année 2024, 21 mois). »

L'âge et la date d'actualisation figurent aussi dans la présentation imprimable et dans l'e-mail.

## 10. Impact sur les estimations

Simulation au 04/10/2026, avec : 10 mois disponibles, commission 20 %, ménage 40 €, durée de séjour du marché.

| Logement | Prix par nuit avant → après | Occupation avant → après | CA avant → après | Fourchette | Confiance |
|---|---|---|---|---|---|
| Rennes T2 40 m² standard | 68,49 € → 68,49 € | 50,1 % → 50,1 % | 10 400 € → 10 400 € | 9 700 – 11 200 € (±7 %) | MOYENNE → MOYENNE |
| Rennes T2 40 m² hypercentre rénové | 78,35 € → 78,35 € | 54,1 % → 54,1 % | 12 900 € → 12 900 € | 12 000 – 13 800 € (±7 %) | MOYENNE → MOYENNE |
| Rennes T3 | 99,31 € → 99,31 € | 48,1 % → 48,1 % | 14 500 € → 14 500 € | 13 500 – 15 500 € (±7 %) | MOYENNE → MOYENNE |
| Saint-Malo T2 | 88,28 € → 88,28 € | 47,9 % → 47,9 % | 12 900 € → 12 900 € | 11 300 – 14 400 € (±12 %) | MOYENNE → MOYENNE |
| Saint-Malo T3 | 128,01 € → 128,01 € | 45,9 % → 45,9 % | 17 900 € → 17 900 € | 15 700 – 20 000 € (±12 %) | MOYENNE → MOYENNE |
| Vitré T2 | 69,60 € → 69,60 € | 49,1 % → 49,1 % | 10 400 € → 10 400 € | 9 600 – 11 200 € (±8 %) | MOYENNE → MOYENNE |
| Bruz T2 | 68,49 € → 68,49 € | 50,1 % → 50,1 % | 10 400 € → 10 400 € | 9 600 – 11 300 € (±8 %) | MOYENNE → MOYENNE |
| Betton T2 | 68,49 € → 68,49 € | 50,1 % → 50,1 % | 10 400 € → 10 400 € | 9 600 – 11 300 € (±8 %) | MOYENNE → MOYENNE |

Aucune estimation ne change. C'est voulu : aucune donnée 2025 n'est à la fois plus récente **et** comparable au niveau EPCI. Remplacer une source seulement parce qu'elle est plus récente aurait violé la règle FIABILITÉ > RÉCENCE.

**Point d'attention majeur (non corrigé)**, la révision du TJM. Si la nouvelle série Lighthouse (environ 140 € pour le département en 2024) correspond à une autre définition (ménage inclus ? autre panel ?), alors :
- les écarts entre EPCI restent valables ;
- mais le niveau absolu de la base pourrait différer de ce qu'utiliserait Ille & Vilaine Tourisme aujourd'hui.

Ce point n'est pas tranchable avec les documents publics. Action proposée, **à faire par vous** (je n'ai contacté personne) : écrire à l'Observatoire d'Ille & Vilaine Tourisme (contact indiqué p. 5 du bilan 2024) pour demander :
1. la raison de la révision du TJM 2024 ;
2. si le TJM inclut les frais de ménage ;
3. la date de parution du bilan 2025 par EPCI.

## 11. Modification du moteur : proposition NON appliquée

Aucune modification du moteur n'a été nécessaire : les nouvelles données sont gérées par le pipeline et l'affichage.

Une seule évolution est envisageable, je la soumets à votre décision.

- **E1. Fraîcheur de la saisonnalité dans la confiance.** Aujourd'hui, la confiance du moteur ne regarde que la fraîcheur de la base de marché.
  - Si un bilan 2025 par EPCI arrivait sans série mensuelle 2025, le moteur afficherait HIGH alors que `data-status` dirait MEDIUM.
  - La modification serait d'ajouter un facteur « saisonnalité ancienne » dans le groupe « données » de `engine/uncertainty.js`. La lecture se ferait dans `seasonality[...].meta`, avec un repli sans effet si `meta` est absent.
  - **Impact aujourd'hui : nul** (marché et saisonnalité sont tous deux MEDIUM).
  - Recommandation : **ne pas le faire maintenant**. Le bilan annuel publie habituellement le mensuel en même temps que les EPCI. À réexaminer à la parution du bilan 2025.

## 12. Fréquence réaliste et recommandation

- **Fréquence** :
  - `npm run data:update` **une fois par mois** (Insee et Eurostat ; à défaut de GitHub, en local) ;
  - **une intégration manuelle par an** au printemps (bilan EPCI), plus deux contrôles (Chiffres clés en juin, AUDIAR en juillet).
- **Base de marché** : elle ne peut pas être plus fraîche que la publication annuelle par EPCI. Une donnée de l'année A arrive en avril de A+1, puis vieillit au fil de l'année : 4 mois à la parution, 15 mois en mars de A+2.
  - Avec un bilan 2025 publié et intégré, la confiance redeviendrait **HIGH** pour Rennes T2 standard jusqu'au 31/03/2027 (15 mois après fin 2025).
  - Elle resterait MOYENNE pour Saint-Malo et les communes périphériques (D11, D15).
- **Recommandation** :
  1. garder la base 2024 ;
  2. utiliser l'émulateur tel quel (confiance MOYENNE affichée honnêtement, avec avertissement) ;
  3. surveiller la parution du bilan 2025 par EPCI ;
  4. clarifier la révision du TJM auprès de l'Observatoire avant toute intégration d'une série 2025.

L'émulateur en ligne n'a **pas** été republié ; la version locale à jour est `reports/preview-artifact.html`. Le republier (avec `market.json` et `config.json` comme fichiers associés, pour qu'il lise les données en ligne et non l'instantané) se fera sur votre accord.

## Fichiers créés ou modifiés

- **Nouveaux** :
  - `data/raw/manifest.json`
  - `data/raw/adt35/indicateurs_departement_2025.csv`
  - `data/raw/audiar/indicateurs_rennes_metropole_2025.csv`
  - `data/raw/*/archive/`
  - `data/market/{index.json,2024/,2025/}`
  - `scripts/adapters/indicators.mjs`
  - `scripts/lib/freshness.mjs`
  - `scripts/history-market.mjs`
  - `scripts/audit/reference-properties.mjs`
  - `schemas/emeraude-private.schema.json`
  - `data/emeraude/listings_monthly.TEMPLATE.csv`
  - `docs/procedure-donnees-annuelles.md`
  - `tests/data-refresh.test.mjs`
  - `tests/fixtures/{reference-before-refresh,engine-hashes}.json`
  - `dist/data-status.json`
- **Modifiés** :
  - `scripts/{fetch-public,build-market,check-freshness}.mjs`
  - `scripts/adapters/adt35.mjs` : date de récupération réelle lue dans le registre
  - `config/sources.json` : 2 sources « indicator »
  - `schemas/{market,sources}.schema.json`
  - `embed/template.html` : affichage uniquement
  - `data/emeraude/README.md`
  - `package.json`
- **Inchangés** :
  - `engine/*` (vérifié par empreintes) ;
  - `config/config.json` (coefficients, courbe des chambres, scénarios) ;
  - `legacy/` ;
  - Framer.
