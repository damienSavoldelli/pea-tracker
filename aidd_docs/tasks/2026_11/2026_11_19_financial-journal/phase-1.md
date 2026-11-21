---
status: done
---

# Phase 1 — Journal local exploitable

## Tasks

- [x] Modèle achats, ventes, versements, retraits et contrepassations avec date, provenance et portefeuille explicites.
- [x] Domaine exact et projection positions/liquidités ; refus des soldes négatifs, ventes excédentaires, dates futures ou antérieures à l'état initial.
- [x] Autorisation propriétaire/portefeuille, ancrage sur une révision initiale et API REST séparée, non montée dans les Workers/MCP existants.
- [x] Port de stockage, Memory et D1 local ; append et résultat d'idempotence atomiques, concurrence optimiste et historique immuable.
- [x] Migration additive 0005 sans modification ni remplissage des tables V1.
- [x] Vérifications finales ciblées, contrat REST et documentation des preuves.

## Résultats locaux — 19 novembre 2026

- `tests/transactions.test.ts` : 31 tests, domaine/service/Memory/REST et validation du contrat OpenAPI séparé.
- `tests/transactions.d1.test.ts` : 4 tests D1 natifs, persistance, CAS, rollback, immutabilité et réouverture avec replay original.
- `tests/d1-migrations.test.ts` : 5 tests, migration fraîche/répétée, upgrade d'état V1 existant et rollback d'une migration invalide.
- `tests/market-calendar.test.ts` + `tests/quotations.domain.test.ts` : 71 tests.
- Non-régression `tests/portfolio.contract.test.ts` + `tests/valuation.contract.test.ts` : 41 tests, Memory et D1 local.
- Total distinct : 152 tests TypeScript ciblés réussis ; typecheck réussi. Pas de suite globale, installation de dépendance, appel fournisseur ni opération distante.
- Vérifications Git : aucune modification des entrypoints déployés, des contrats REST/MCP V1, de l'état initial ou des services de cotation/valorisation V1 ; aucun fichier indexé ni commit créé pour cet incrément.

## Acceptance criteria

- Achats/ventes/versements/retraits modifient exclusivement la projection de leur portefeuille.
- Même clé et même commande rendent le résultat initial ; clé réutilisée avec commande différente : conflit. Les replays concurrents et la réouverture D1 ne doublent pas le mouvement.
- Une contrepassation annule les deltas du mouvement référencé, conserve l'original et reste soumise aux contraintes de solvabilité ; pas de double contrepassation.
- V1 initiale, PRU déclaré, cotations, contrats REST/MCP et Workers déployés restent inchangés.
- Aucun secret ni aucune donnée réelle dans les tests ou documents ; uniquement D1 local isolé pour la migration.

## Validation

- Vitest : `tests/transactions.test.ts`, `tests/transactions.d1.test.ts`, `tests/d1-migrations.test.ts` ; exclusion de l'ancienne copie `.wrangler`.
- Calendrier/fraîcheur : scénario ajouté à `tests/market-calendar.test.ts`, avec `tests/quotations.domain.test.ts` ; réutiliser les autres preuves inchangées.
- TypeScript : `tsc --noEmit` ; vérifier le diff et les frontières d'import, aucun build/déploiement distant.
