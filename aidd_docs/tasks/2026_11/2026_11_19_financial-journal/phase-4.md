---
status: done
---

# Phase 4 — Frais explicites d'achat et de vente

Source : [convention financière](fees.md) explicitement validée par l'utilisateur le 20 novembre. Implémentation locale seulement, sans commit, push, migration distante, modification du PEA réel ni déploiement.

- [x] Frais EUR explicites non négatifs sur achats/ventes uniquement ; montant brut, débit/coût d'achat brut + frais ; produit net de vente brut − frais, positif ou nul.
- [x] PRU restant inchangé à la vente ; coût soldé à zéro en clôture complète. Précision/arrondi existants conservés.
- [x] Contrepassations sur les effets originaux incluant les frais ; historique immuable, solvabilité et coût incompatible conservés.
- [x] Opérations anciennes sans frais inchangées, sans insertion d'un défaut ; replay d'un reçu canonique préextension testé. Clés et frais explicites isolés par portefeuille réel/fictif.
- [x] Politique/provenance des lectures V1.1 et OpenAPI local enrichis ; frais historiques initiaux inconnus, aucun PRU global hors frais/frais inclus annoncé. Dividendes encore exclus.
- [x] Adaptateurs et schéma D1 réutilisés sans migration supplémentaire ; réponses historiques V1 préservées.

## Preuves locales

- `tests/transactions.fees.test.ts` : **16 tests**, mêmes cas Memory et D1 natif local : frais absents/nuls, reçus historiques, achats, ventes partielles/totales, précision, net nul, refus des frais invalides/net négatif/achat non finançable, contrepassations, idempotence, séparation réel/fictif et REST administratif.
- `tests/transactions.test.ts` : **31 tests** ; l'ancien cas interdisant tous frais est remplacé par le refus d'un `fee_rate` automatique non pris en charge.
- `tests/transactions.d1.test.ts` : **4 tests** de persistance/replay/concurrence/rollback/réouverture existants, justifiés par l'extension du format d'entrée décodé.
- `tests/cost-basis.test.ts` : **11 tests** exacts/arrondis/contrepassations existants, politique actualisée.
- `tests/portfolio-journal-read.test.ts` : **14 tests**, dont deux nouveaux cas frais dans les deux lectures sur Memory/D1, plus REST/MCP officiel avec opération à frais ; contrats et valorisation historiques V1 conservés.
- Total distinct : **76 tests ciblés réussis**. Après adaptation du cas ancien interdisant les frais et ajout de la preuve de reçu canonique historique, seules les deux suites concernées ont été relancées : 47/47. Typecheck réussi.
- Commandes : `node node_modules/vitest/vitest.mjs run <cinq fichiers ci-dessus> --exclude '**/.wrangler/**'` et `node node_modules/typescript/bin/tsc --noEmit`. Aucun test complet, audit général, appel fournisseur ou opération distante.

Limites historiques/financières : [fees.md](fees.md). Prochain incrément : dividendes explicites, crédit de trésorerie, date/provenance, isolation et corrections idempotentes ; pas de performance inventée depuis le seul PRU.
