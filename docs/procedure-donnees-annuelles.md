# Procédure — publications annuelles (saisie manuelle contrôlée)

Les publications annuelles (Ille & Vilaine Tourisme, AUDIAR) sont des PDF. **Pas de scraping automatique de PDF** : la mise en page change chaque année et une erreur silencieuse fausserait les estimations. Le processus est donc manuel, guidé et contrôlé par le pipeline.

## Calendrier observé

| Publication | Contenu utile | Parution habituelle | Granularité |
|---|---|---|---|
| Ille & Vilaine Tourisme — *Fréquentation des hébergements locatifs en AAAA* | prix (TJM), occupation, nuits, durée de séjour **par EPCI** + mensuel départemental | avril de A+1 (2024 : avril 2025) | EPCI, mois |
| Ille & Vilaine Tourisme — *Chiffres clés AAAA* | indicateurs locatifs **départementaux** | mai-juin de A+1 (2025 : mai 2026) | département |
| AUDIAR — *Observatoire du tourisme de Rennes Métropole* | annonces actives, nuitées plateformes, taxe de séjour (pas de prix ni d'occupation) | juillet de A+1 | Rennes Métropole |

Au 2026-10-04, le bilan « hébergements locatifs 2025 » par EPCI **n'est pas publié** (vérifié le 2026-10-04 : la page « études de fréquentation / hébergements locatifs » ne liste que les bilans 2021 à 2024, et les adresses probables d'un fichier 2025 (dépôts de mars à octobre 2026) répondent « 410 »). Il faut le surveiller : c'est la seule source qui ferait passer la base de marché à 2025.

## Étapes

1. **Détecter** : `npm run freshness` signale chaque mois une base de marché orange ou rouge. Vérifier les pages :
   - https://www.ille-et-vilaine-tourisme.bzh/acteurs/chiffres-et-donnees/etudes-de-frequentation/hebergements-locatifs/
   - https://www.ille-et-vilaine-tourisme.bzh/acteurs/chiffres-et-donnees/
   - https://www.audiar.org/ (rubrique Observatoires → Tourisme)
2. **Télécharger** le PDF dans un dossier de travail (hors dépôt) et calculer son empreinte SHA-256.
3. **Extraire** le texte avec pdf.js (`pdfjs-dist`, dossier de travail, pas de dépendance du dépôt) pour relire les valeurs ; **saisir à la main** chaque valeur avec sa page. Ne jamais déduire une valeur absente du document.
4. **Valider** :
   - même fournisseur et même définition que la base en place (sources.json → `definitions`) ;
   - comparer les valeurs de l'année précédente **republiées** dans le nouveau document avec la base : un écart > 5 % sur le prix signale une révision de série (cas du TJM 2024 : 104 € dans le bilan 2024, ≈ 140,6 € dans les Chiffres clés 2025) ;
   - `npm run build` refuse les valeurs hors bornes et conserve la valeur précédente si la variation dépasse les seuils (`config.validation.maxYoyChange`).
5. **Classer** chaque variable : A (remplacer), B (plus récente mais méthode différente : stocker les deux, ne pas remplacer), C (pas de nouvelle donnée : conserver), D (plus récente mais moins fiable : conserver, signaler).
6. **Intégrer** (après validation humaine uniquement) :
   - base par EPCI (catégorie A) : nouveau fichier `data/raw/adt35/epci_AAAA.csv` (jamais modifier l'ancien) + entrée dans `data/raw/manifest.json` (URL, date de publication, date réelle de récupération, sha256, pages, méthode) ;
   - indicateurs (catégorie B) : `data/raw/<source>/indicateurs_<territoire>_AAAA.csv` + manifeste ;
   - `npm run data:integrate -- --dry-run` puis `npm run data:integrate` : reconstruction en zone de préparation, comparaison avec la version active (seuils de `config/automation.json`), tests, puis activation (ou blocage). La version précédente est archivée dans `data/history/market-versions/` ; `data/market/AAAA/` est historisé ;
   - si l'activation est bloquée (REJECT) alors que l'écart est compris et justifié (ex. série révisée assumée) : `node scripts/refresh.mjs --no-fetch --force-accept` (décision humaine, jamais utilisée par le workflow) ;
   - ajouter l'adresse du PDF à `config/automation.json → publications.known` et passer son statut à « INTÉGRÉE » ou « CONTRÔLE » dans `data/inbox/publications.json` (l'alerte s'arrête).
7. **Comparer** : `npm run reference` (8 logements de référence) avant et après ; documenter les écarts dans un rapport `reports/data-refresh-AAAA-MM.md`.

## Ordre de repli (déjà assuré par le moteur et le pipeline)

| Rang | Niveau | Où | Effet sur la confiance |
|---|---|---|---|
| 1 | Données Émeraude validées | `data/emeraude/aggregates.json` (≥ 3 logements, ≥ 6 mois) — calibration plafonnée, jamais seule | aucun agrégat aujourd'hui |
| 2 | Donnée publique locale récente (commune) | `markets["commune:…"]` | aucune source communale gratuite à ce jour |
| 3 | Intercommunalité récente | `markets["epci:…"]` | référence |
| 4 | Département / marché voisin | `communes.json` → `fallback` | voisin : MOYENNE ; département : FAIBLE (règle impérative) |
| 5 | Dernière version validée | valeur précédente conservée (`kept_previous`), fichier brut précédent conservé en cas d'échec réseau, cache local du navigateur | l'âge augmente → fraîcheur orange puis rouge |
| 6 | Données intégrées à l'outil | instantané embarqué dans la page | FAIBLE + message « Données de secours » |

Chaque repli est affiché à l'utilisateur (bandeau « Données de repli utilisées » et raisons de confiance).

## Sources automatiques (mensuelles)

| Source | Point d'accès | Paramètres | Fréquence | Transformation | Sortie |
|---|---|---|---|---|---|
| Eurostat — Rennes | `…/statistics/1.0/data/tour_ce_oarc` | `cities=FR016C`, `c_resid=TOTAL`, JSON-stat | annuelle (mise à jour trimestrielle) | séjours, nuits louées → durée de séjour, tendance | `controls.eurostatRennes` |
| Eurostat — Bretagne | `…/data/tour_ce_omn12` | `geo=FRH0`, `indic_to=NGT_SP`, `c_resid=TOTAL` | mensuelle (≈ 6 mois de délai) | nuitées mensuelles → mois de pointe | `controls.checks` |
| Insee Melodi | `https://api.insee.fr/melodi/data/DS_TOUR_FREQ` | `GEO=<millésime>-DEP-35`, `FREQ=M`, `ACTIVITY=I551`, `TOUR_MEASURE=PLACE_OCCUPANCY_RATE` | mensuelle (≈ 2 mois de délai) | taux d'occupation hôtelier → profil saisonnier urbain (dernière année complète) | `seasonality.urbain` |

Aucune clé, aucun compte. `scripts/fetch-public.mjs` : 3 essais, refus de toute réponse dont la dernière période recule, archivage de la version précédente dans `data/raw/<source>/archive/` à chaque nouvelle période, conservation de la dernière version valide en cas d'échec.
