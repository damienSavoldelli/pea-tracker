# Gain économique monétaire et flux externes — incrément local

Source : mission utilisateur « Performances et flux externes ». Développement local uniquement ; aucun commit, déploiement, chargement financier réel ou D1 distant.

## Référence réellement disponible et prérequis restant

Le modèle existant conserve une ouverture datée avec quantités, PRU déclarés, liquidités et provenance (`src/domain/portfolio.ts`, migration 0003). Le journal conserve les mouvements effectifs depuis cette ouverture. Les observations de marché sont séparées (migration 0004) : prix, horodatages de marché/collecte, provenance et sélection explicite.

Avant cet incrément, aucun modèle, table ou paramètre ne sélectionnait une valorisation initiale de marché figée, liée à l'ouverture et à une version du journal. Des consultations historiques de valorisation ne constituent pas automatiquement cette référence. Aucune vérification distante des données de production n'a été effectuée ici ; aucun montant réel n'est transcrit dans ces documents.

Les lectures V1.1 exposent maintenant aussi les liquidités déclarées de l'ouverture dans `opening_state.cash`. Celles-ci ne remplacent pas la valorisation initiale des titres. **Quantité × PRU n'est jamais utilisé comme valeur de marché initiale.**

Solution minimale proposée : choisir un premier instantané complet du lecteur V1.1 comme départ explicite, conserver sa date, portefeuille/nature, ouverture, version du journal, liquidités et observations sources immuablement, puis le sélectionner dans une composition autorisée. Pas de reconstruction rétroactive. Aucune référence réelle n'a été choisie, persistée ou activée par cette livraison.

## Indicateurs et conventions

- `cash_flows` : versements et retraits effectifs, nets au sens de leur effet comptable, avec dates, séquences, références d'événements et provenance. Achats/ventes, frais et dividendes sont des mouvements internes, exclus des flux externes.
- Les contrepassations de flux suivent leur date/séquence effective. Un débit externe est compté dans `withdrawals`, un crédit dans `deposits`, y compris corrections. `net_contributions=deposits-withdrawals`. Les écritures d'origine et de correction restent visibles ; aucune période passée n'est réécrite.
- Le lecteur portefeuille expose les flux depuis l'ouverture (`after_sequence=0`). Le rapport monétaire utilise les seuls flux postérieurs à la version de sa référence sélectionnée. Une correction d'un flux antérieur à la référence compte donc selon son effet après référence, sans double comptage.
- Gain économique en EUR = valeur actuelle − valeur initiale de marché − versements + retraits. Les deux valeurs incluent leurs liquidités. Les dividendes et frais sont déjà intégrés au cash et aux opérations : aucun ajout/soustraction supplémentaire.
- Le gain est calculé en fractions exactes ; représentation à 18 décimales demi-pair uniquement à l'affichage. La valeur initiale est réutilisée via sa fraction exacte, jamais son rendu arrondi.
- Un gain économique monétaire n'est pas un rendement en pourcentage. `return_percentage` reste indisponible (`return_method_not_defined`) dans tous les cas de cet incrément ; pas de TWR/XIRR ou ratio arbitraire.

## Contrôle de référence et qualité des cours

`marketReference` recalcule le total à partir du cash et des quantités × prix observés, avec les unités de prix existantes. Le total doit correspondre à l'instantané complet. Instruments uniques, EUR, observation réussie, sélection fournisseur/type/ajustement identique, horodatages compatibles et provenance conservée. Ce contrôle ne certifie pas à lui seul l'exactitude historique du portefeuille : la composition doit sélectionner un véritable instantané du service, pas une déclaration client.

Une cotation initiale explicitement `stale` est refusée. `within_target` et `last_completed_session` sont admis : une dernière séance normale en marché fermé n'est pas assimilée à un retard. Une fraîcheur `unknown` reste indicative, avec ses réserves/provenance à examiner lors de la sélection ; elle ne devient jamais une garantie de fraîcheur. Les états d'avertissement/d'indisponibilité non admissibles refusent la référence.

Les cours actuels restent ceux du moteur de valorisation existant : des cotations anciennes/inconnues peuvent alimenter une estimation, avec leurs avertissements, jamais une garantie temps réel. Si une position actuelle n'est pas valorisable, le gain économique est indisponible. Les avertissements initiaux et courants sont conservés ensemble.

Identité du portefeuille/nature réel-fictif, ancre d'ouverture, sélection de cours, date et version sont contrôlées entre référence et lecture. Une opération enregistrée après l'instantané mais antidatée avant sa date l'invalide explicitement : pas de calcul silencieux sur une référence devenue incohérente.

## Implémentation locale

- `src/domain/performance.ts` : synthèse des flux, contrôle/recalcul de référence et gain économique conditionnel.
- `PortfolioService.currentSnapshot` : état et événements capturés ensemble pour les calculs internes ; les événements bruts ne sont pas ajoutés au DTO public. `current` conserve ses lectures et ajoute cash initial/flux.
- `ValuationService.current` : `performance` et `cash_flows`. Référence facultative fournie exclusivement par composition de confiance, clonée à la construction ; aucun setter ou paramètre REST/MCP ne permet au client de la remplacer.
- Sans référence choisie : `economic_gain.status=unavailable`, motif `initial_market_reference_missing`. Les flux, valeurs actuelles disponibles et autres indicateurs restent consultables. Aucun remplacement par zéro, PRU ou cours courant supposé initial.
- Contrat V1.1 et descriptions MCP enrichis. Le schéma des avertissements courants reprend tout le vocabulaire de fraîcheur existant, sans modifier les règles du domaine. Contrats historiques V1, montants de valorisation et schéma/adaptateurs D1 inchangés.

## État de livraison et suite

Calculables localement : flux datés, montants versés/retirés et contribution nette ; gain économique estimatif avec une référence explicitement sélectionnée et cohérente. Pour le PEA réel, ce dernier reste indisponible tant que la référence réelle n'est pas choisie et conservée. Les performances historiques antérieures à cette référence restent inconnues.

Les tests ne prouvent ni la conservation durable d'une référence réelle ni son activation en production. La sélection/persistance de cette référence reste une étape distincte à autoriser ; aucune nouvelle infrastructure ou migration n'est ajoutée ici. Le budget CPU/volume hébergé reste non certifié.

Preuves : [phase 7](phase-7.md). Prochaine mission demandée : diagnostic ciblé OAuth/MCP pour les tâches ChatGPT, avant toute étude des écritures MCP sécurisées. La présente livraison n'autorise aucun changement OAuth, outil MCP en écriture ou déploiement.
