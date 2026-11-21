# Journal financier local — contrat du premier incrément

Dernier incrément local : [flux externes et gain économique monétaire](performance.md). Aucune référence de marché réelle n'a été choisie/persistée ; son absence rend le gain indisponible. Aucun rendement en pourcentage, modification des contrats V1 ou opération de production.

Dernière extension locale : [gains réalisés et latents](gains.md), montants signés exacts et couverture explicite, sans rendement global inventé. Les exclusions de gains/performance des phases initiales ci-dessous sont historiques pour les gains ; la performance au sens rendement reste indisponible. Aucun changement des contrats V1 ou des sources de production.

Dernière extension locale : [dividendes reçus](dividends.md), crédit espèces sans effet sur titres/coût/PRU, attribution facultative et corrections traçables. Les exclusions de dividendes des phases initiales ci-dessous sont historiques ; contrats V1 et données initiales inchangés.

Extension frais du 20 novembre : [convention validée](fees.md), frais facultatifs des achats/ventes, cash net et coûts d'achat capitalisés. Les entrées/résultats historiques sans frais et les contrats V1 ne sont pas réécrits. Le traitement des frais du PRU initial reste inconnu ; les limites « hors frais » des premières phases ci-dessous sont historiques.

Extension autorisée le 20 novembre : [coût restant et PRU pondéré](cost-basis.md) calculés dans les seules lectures V1.1. Elle remplace leur statut PRU indisponible décrit historiquement ci-dessous ; stockage/résultats immuables du journal et contrats historiques V1 inchangés.

## Périmètre validé

Déclarations d'achats, ventes, versements et retraits EUR ; date effective fournie explicitement ; historique chronologique et contrepassations ultérieures traçables. Aucun ordre de bourse n'est exécuté. Frais, dividendes, PRU calculé et performances ne sont pas implémentés.

`amount` est le montant de trésorerie exécuté explicitement déclaré, à deux décimales maximum. Il n'est jamais inféré d'une cotation ou du PRU, ni arrondi silencieusement. Le journal n'en décompose pas les frais et ne prétend pas reconstruire un prix unitaire. Les quantités ont au plus douze décimales. Entrées/sorties et stockage utilisent des chaînes décimales, calculs internes BigInt exacts, jamais Number pour les montants.

## Identité, compatibilité et isolation

La composition de confiance fournit un UUID stable `portfolio_id`, une nature `real` ou `simulated`, un propriétaire interne et une paire `opening_id`/`opening_revision` explicite. Aucun portefeuille de production n'est créé ou rattaché par défaut. Pas d'API de création/listage multi-portefeuille, de nouveau scope OAuth ni de changement aux permissions V1.

Le repository d'état initial V1 expose des révisions globales : une révision n'est pas une identité de portefeuille. Le journal ajoute son propre rattachement sans modifier ces clés, les réponses REST/MCP, les curseurs ou les anciens résultats d'idempotence. Une correction V1 ultérieure ne déplace pas automatiquement l'ancre du journal ; une réconciliation contrôlée reste à concevoir avant tout changement de cette ancre. Incohérence d'identité ou de nature réel/fictif : refus.

Les opérations se font sur la projection séparée, jamais sur les lignes d'ouverture. Les lectures/valorisations V1 continuent de lire leur état initial. `cost_basis_status=not_computed` interdit de confondre les nouvelles quantités avec un PRU recalculé. Une trésorerie initiale inconnue n'est jamais considérée comme nulle : l'initialisation du journal est refusée. Les états initiaux contenant des devises autres que l'EUR sont hors incrément.

## Règles déterministes

- Mouvement strictement postérieur à la date de l'état initial et non futur ; aucune antidatation avant le dernier mouvement.
- À date/instant identique, ordre strict par séquence d'append, protégé par version attendue ; aucune heure d'exécution supposée.
- Achat : débit de `amount`, ajout de `quantity`. Vente : crédit de `amount`, retrait de `quantity`.
- Versement : crédit ; retrait : débit. Trésorerie finale et quantités ne peuvent pas devenir négatives ; les positions nulles sont omises.
- Contrepassation complète d'un mouvement existant du même portefeuille, raison obligatoire, deltas exactement opposés. Original conservé, double contrepassation et contrepassation d'une contrepassation refusées. Elle doit elle-même respecter les soldes disponibles ; pas de contournement par modification de l'historique.
- L'éventuel mouvement de remplacement est ensuite une nouvelle déclaration. Contrepassation et remplacement ne sont pas une opération composée atomique dans cet incrément.
- Uniquement des instruments existants cotés en EUR pour achats/ventes ; aucun appel fournisseur pendant ces opérations.
- Bornes initiales : 100 positions, 1 000 événements par journal, limites décimales V1 conservées. Dépassement : refus, jamais troncature silencieuse.

## Stockage et idempotence

Port `src/ports/transactions.ts`, adaptateurs Memory et D1. Migration `0005_transactions.sql` : `transaction_journals`, `transaction_events`, `transaction_outcomes`, avec ancre sur les révisions V1, événements immuables et références par portefeuille. Aucun ALTER, backfill ni UPDATE des tables V1. Cette migration n'a été appliquée que sur le D1 synthétique de test.

Clé d'idempotence bornée et rattachée au portefeuille, au sujet et à l'opération. La forme canonique inclut la configuration d'ancrage, la version attendue et l'entrée normalisée. Replay identique : résultat historique exact même après des événements ultérieurs ; contenu différent : 409. L'append atomique persiste événement, nouvelle projection et résultat de replay ensemble. Version concurrente périmée : 412, sans écriture partielle.

## Interface locale API-first

Composition explicite `createTransactionApp(service, authenticate)` ; contrat [OpenAPI local](../../../api/transactions.openapi.json). Aucun Worker déployé ni adaptateur MCP n'importe cette composition. L'authentification de confiance doit être fournie ; aucune validation fictive de JWT en production n'est ajoutée.

| Opération | Route | Conditions |
| --- | --- | --- |
| GET | `/api/v1/portfolios/{portfolioId}/transactions` | `portfolio:read` et propriétaire/portefeuille exacts ; journal et projection, ETag de version |
| POST | même route | `portfolio:admin`, propriétaire/portefeuille exacts, `If-Match: "N"`, `Idempotency-Key`, JSON strict |

POST : 201 et résultat immuable, y compris replay. Entrée invalide : 400/422 ; non authentifié : 401 ; accès interdit : 403 ; conflit métier/idempotence : 409 ; version périmée : 412 ; version absente : 428. Erreurs génériques sans jeton ni détail interne. Aucun champ client ne peut changer le propriétaire ou le portefeuille d'ancrage. Les contrats MCP V1 restent inchangés ; MCP reste en lecture seule.

## Lectures courantes V1.1 — décision et livraison locale complémentaires

L'utilisateur valide des lectures projetées séparées, sans changement des réponses REST/MCP V1. `PortfolioService.current` lit une projection du journal existant, puis les métadonnées de sa révision d'ouverture immuable ; positions et liquidités proviennent de la même version. Les événements et l'état initial ne sont pas modifiés par ces lectures. Une correction historique ultérieure ne réancre pas le journal.

| Lecture optionnelle | REST GET | MCP en lecture seule |
| --- | --- | --- |
| Positions et liquidités courantes | `/api/v1/portfolios/{portfolioId}/state` | `get_current_portfolio` |
| Valorisation courante | `/api/v1/portfolios/{portfolioId}/valuation` | `get_current_portfolio_valuation` |

Composition via `createApp.currentPortfolio` et dépendances MCP `currentPortfolio`/`currentValuation`, uniquement par injection explicite. Aucun entrypoint déployé ne les active. L'API administrative reste dans `createTransactionApp`, distincte de la lecture et de l'ingestion des cotations.

Chaque réponse courante indique `view=current_projected`, `portfolio_id`, `kind`, l'ancre `opening_state` et `journal.version`/`last_effective_at`. Chaque position indique `pru={status:unavailable,reason:not_computed}` et omet `declared_pru`, y compris les positions initiales. `holdings_basis=opening_state_and_transactions`, `cost_basis_status=not_computed` et l'indisponibilité de performance interdisent toute assimilation au PRU historique.

La valorisation exige une sélection explicite provider/price_kind/adjustment et refuse `revision`. Elle réutilise la même arithmétique V1 exacte et les cotations stockées, sans appel fournisseur. Les agrégats incomplets restent nuls ; le sous-total connu demeure disponible. L'état doit précéder l'évaluation ; cotation antérieure au dernier mouvement : avertissement `quote_predates_portfolio_state`. La version du journal est cohérente, sans garantie d'instantané atomique inter-cotations. Aucun ETag fort n'est ajouté aux réponses évaluées dynamiquement.

Autorisations inchangées : `portfolio:read`, propriétaire et portefeuille exacts ; valorisation exige aussi `quotes:read` ; MCP exige `instruments:read`. Aucune nouvelle permission OAuth. Réponses no-store/nosniff, refus des mutations, origines externes et paramètres inattendus. Les noms, schémas, curseurs et résultats V1 restent inchangés et explicitement fondés sur l'ouverture.

Preuves du raccordement : [phase 2](phase-2.md). Les preuves précédentes ci-dessous restent celles du premier incrément.

## Prochaine étape bornée

Preuves locales : 31 tests du journal et de l'API, 4 tests D1 natifs, 5 tests de migration, 71 tests calendrier/fraîcheur et 41 tests de non-régression des positions/valorisations ; typecheck réussi. Le redémarrage testé est la fermeture puis réouverture du D1 local natif, pas une certification de reprise après sinistre ou de coupure de production.

Lectures projetées raccordées localement. Préparer le coût restant/PRU avec conventions explicites ; activation administrative et réconciliation de l'ancre restent nécessaires avant tout raccordement au PEA réel. Ne pas appliquer la migration en production sans autorisation. Frais/dividendes et règles de performance suivent séparément ; aucune formule n'est induite de cet incrément.
