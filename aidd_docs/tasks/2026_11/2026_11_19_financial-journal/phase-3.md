---
status: done
---

# Phase 3 — Coût restant et PRU pondéré, localement

Preuves historiques avant la [phase 4](phase-4.md) : celle-ci ajoute les frais explicitement validés, sans modifier les réponses V1.

Mission utilisateur du 20 novembre : réutiliser journal et lectures V1.1, hors frais/dividendes, préserver les contrats historiques et les montants de valorisation.

- [x] Domaine de calcul exact : base déclarée/provenance, achats, ventes partielles/totales, contrepassations ultérieures et coût indisponible si insuffisant/incompatible.
- [x] Fractions BigInt réduites ; représentation décimale à 18 places/demi-pair, sans réinjection. [Règles et limites](cost-basis.md).
- [x] Deux lectures V1.1 et contrat OpenAPI raccordés ; aucune migration ni modification du stockage/replay du journal.
- [x] Tests ciblés, typecheck et mémoire actualisée ; aucun commit, hook, déploiement ou accès financier de production.

## Preuves locales

- `tests/cost-basis.test.ts` : 11 tests — achats à prix distincts, ventes partielles/totales, coût déclaré nul/inconnu, grande précision, fractions périodiques, arrondis demi-pair, contrepassations et incohérences d'identité/version.
- `tests/portfolio-journal-read.test.ts` : 12 tests — projection/coût/valorisation sur Memory et D1 natif local, séparation réel/fictif sur stockage partagé, accès, version capturée, ancre, couverture et contrats REST/MCP officiels.
- `tests/portfolio.contract.test.ts`, `tests/valuation.contract.test.ts`, `tests/valuation.http.test.ts` : 49 tests existants réussis ; réponses V1 et montants de valorisation préservés.
- Total distinct : **72 tests ciblés**, typecheck réussi. Les 152 tests de l'incrément initial n'ont pas été intégralement relancés.
- Commande Vitest : `node node_modules/vitest/vitest.mjs run <fichiers ci-dessus> --exclude '**/.wrangler/**'`. Après les derniers ajouts d'isolation/contrôle, les deux premières suites ont été relancées : 23/23 ; typecheck répété avec succès.

Développement local seulement. Pas de preuve de budget CPU hébergé ni d'activation de production. Prochain incrément : conventions et intégration des frais, puis dividendes et performances.
