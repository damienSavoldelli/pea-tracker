---
status: done
---

# Phase 2 — Lectures courantes projetées, localement

État historique de cette livraison : le coût/PRU est ajouté par la [phase 3](phase-3.md), autorisée le 20 novembre. Les preuves ci-dessous restent celles du raccordement initial.

Décision utilisateur : conserver intégralement les réponses REST/MCP V1 fondées sur l'ouverture et ajouter des lectures V1.1 distinctes, sans PRU inventé. Aucun raccordement de production autorisé.

## Livraison

- [x] `PortfolioService.current` utilise la projection de `TransactionService.get` : positions et liquidités capturées dans une seule version du journal.
- [x] Ancre initiale explicitement épinglée ; correction historique V1 ultérieure sans déplacement automatique du journal.
- [x] `ValuationService.current` réutilise les produits/sommes exacts et arrondis V1, ainsi que les cotations déjà stockées ; couverture partielle explicite.
- [x] REST optionnel : GET `/api/v1/portfolios/{portfolioId}/state` et `/valuation` ; MCP optionnel : `get_current_portfolio`, `get_current_portfolio_valuation`.
- [x] Lecture propriétaire/portefeuille exacte ; aucune écriture REST/MCP ni connexion ingestion ajoutée.
- [x] `view=current_projected`, ancre, version du journal, `pru.status=unavailable`, `cost_basis_status=not_computed` ; aucune plus-value ou performance inférée.
- [x] Contrat OpenAPI local étendu, historique V1 inchangé, mémoire synchronisée sans hook ni indexation Git.

## Preuves locales

- `tests/portfolio-journal-read.test.ts` : 10 tests, dont projection et valorisation sur Memory/D1 natif local, opérations/replay/contrepassation, ancre, capture concurrente, accès interdit, état futur, portefeuille vide, couverture partielle et REST/SDK MCP officiel.
- `tests/portfolio.contract.test.ts`, `tests/valuation.contract.test.ts`, `tests/valuation.http.test.ts` : 49 tests de compatibilité existants réussis après modification des services partagés.
- Typecheck réussi. Commandes : `node node_modules/vitest/vitest.mjs run <fichiers concernés> --exclude '**/.wrangler/**'` et `node node_modules/typescript/bin/tsc --noEmit`.
- Les 152 tests de l'incrément précédent n'ont pas été intégralement relancés. Aucun changement de schéma supplémentaire, migration de production, appel fournisseur, commit, push ou déploiement.

## Limites / prochaine étape

Les lectures V1 restent historiques ; les nouvelles lectures ne sont pas activées dans les entrypoints déployés. Les cotations sont lues individuellement : la cohérence porte sur la version positions/liquidités, pas sur un instantané atomique de tous les cours. Une réserve `quote_predates_portfolio_state` distingue un cours antérieur au dernier mouvement, sans bloquer l'estimation.

Prochain incrément financier : définir puis implémenter le coût restant/PRU à partir de l'ouverture déclarée et des opérations, avec conventions explicites de précision et d'arrondi. Frais, dividendes et performances ne sont pas déduits de cette livraison. Activation, ancre du PEA réel et migration restent soumises à autorisation distincte.
