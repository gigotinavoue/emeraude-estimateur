# Données Émeraude (logements gérés)

## Règle de confidentialité

- `private/` contient les données **brutes** par logement et par mois. Ce dossier est exclu de Git (`.gitignore`) : **il ne doit jamais être publié**.
- Seul `aggregates.json`, produit en local par `npm run emeraude:aggregate`, est publié. Il ne contient ni identifiant de logement, ni adresse, ni montant individuel, et uniquement des segments d'au moins **3 logements**.

## Format du fichier privé `private/listings_monthly.csv`

Une ligne par logement et par mois.

| Colonne | Contenu |
|---|---|
| `listing_ref` | Référence interne (ex. `EM-001`) — jamais publiée |
| `commune_insee` | Code INSEE de la commune (ex. `35238` pour Rennes) |
| `epci` | Facultatif (déduit de la commune) |
| `type` | `studio`, `t1`, `t2`, `t3`, `t4` ou `maison` |
| `bedrooms`, `bathrooms`, `guests`, `area_m2` | Caractéristiques du logement |
| `location_level` | `hypercentre`, `tres-central`, `central`, `quartier-recherche`, `standard`, `peripherie` |
| `amenities` | Identifiants séparés par `;` (voir `config/config.json` → `amenities.items[].id`) |
| `month` | `AAAA-MM` |
| `nights_available` | Nuits ouvertes à la réservation dans le mois |
| `nights_booked` | Nuits réservées |
| `revenue_nights_eur` | **CA des nuits uniquement, HORS frais de ménage** |
| `cleaning_collected_eur` | Frais de ménage collectés (séparés) |
| `stays` | Nombre de séjours |
| `airbnb_fees_eur` | Frais Airbnb |
| `source` | Origine (export Airbnb, logiciel de gestion…) |

### Colonnes facultatives (préparées le 2026-10-04, non utilisées par le calcul)

| Colonne | Contenu |
|---|---|
| `nights_blocked_owner` | Nuits bloquées par le propriétaire (périodes bloquées) — exclues de `nights_available` |
| `nights_blocked_other` | Autres nuits bloquées (travaux, maintenance) |
| `blocked_note` | Motif libre (jamais publié) |
| `platform` | `airbnb`, `booking`, `direct`, `mixte` |
| `commission_eur` | Commission Émeraude du mois |
| `cleaning_cost_eur` | Coût réel des ménages du mois |
| `owner_payout_eur` | Reversement propriétaire |
| `rating` | Note moyenne affichée (sur 5) à la fin du mois |
| `reviews_count` | Nombre cumulé d'avis |
| `managed_since` | Début de gestion par Émeraude (`AAAA-MM`) |

Les indicateurs de **performance** ne sont pas saisis : ils sont calculés (prix par nuit réel = `revenue_nights_eur / nights_booked`, occupation = `nights_booked / nights_available`, revenu par nuit disponible, saison = mois). Modèle d'en-têtes sans aucune donnée : `listings_monthly.TEMPLATE.csv`. Dictionnaire des colonnes : `schemas/emeraude-private.schema.json`.

## Statut au 2026-10-04 (actualisation des données)

- **Aucune donnée Émeraude n'est chargée**, aucun `aggregates.json` n'existe : le moteur n'applique aucune calibration Émeraude.
- Ces données ne servent **pas** à recalibrer le modèle tant que l'utilisateur ne l'a pas décidé explicitement.
- Elles sont, dans l'ordre de repli, le premier niveau (« données Émeraude validées ») : uniquement via des agrégats d'au moins 3 logements suivis au moins 6 mois.

Une ligne dont le prix par nuit dépasse 3 fois le prix du marché est rejetée : c'est le signe probable que le ménage a été inclus dans `revenue_nights_eur`.

## Niveaux de confiance (config.json → `emeraude.levels`)

| Logements dans le segment (≥ 6 mois chacun) | Niveau | Effet sur l'estimation |
|---|---|---|
| moins de 3 | Observation | Aucun (non publié) |
| 3 à 4 | Signal | Aucun |
| 5 à 9 | Calibration | Poids ≤ 33 %, effet plafonné à ±10 % |
| 10 et plus | Données internes solides | Poids ≤ 60 %, effet plafonné à ±20 % |

Les données publiques du marché gardent toujours au moins 40 % du poids.
