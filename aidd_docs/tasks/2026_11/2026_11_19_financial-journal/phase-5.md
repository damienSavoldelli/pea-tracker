---
status: done
---

# Phase 5 — Dividendes reçus, localement

Mission utilisateur : prolonger le journal et les lectures existants, sans modifier les contrats historiques V1 ni la méthode du PRU. [Règles et portée](dividends.md).

- [x] Crédit du cash EUR reçu, instrument facultatif, date/provenance et référence externe via le champ existant.
- [x] Aucune modification des quantités, coût restant et PRU ; aucun titre créé pour une simple attribution de revenu.
- [x] Contrepassation traçable, contrôles de cash/version, replay et séparation réel/fictif existants réutilisés.
- [x] Journal et deux lectures courantes enrichis ; récapitulatif depuis l'ouverture explicitement distinct d'une performance. Aucun accès MCP en écriture.
- [x] OpenAPI V1.1 et mémoire mis à jour ; aucun commit, hook, push, déploiement ou modification D1 de production.

## Preuves locales

- `tests/transactions.dividends.test.ts` : **16 tests** (8 Memory, 8 D1 natif local). Crédit net reçu/provenance, coût/PRU inchangés, instrument/référence absents, titre non détenu, contrepassation/replay/solvabilité, concurrence, isolation, entrées invalides et grands agrégats exacts.
- `tests/portfolio-journal-read.test.ts` : **16 tests**, dont deux nouveaux scénarios dividende/contrepassation dans les deux lectures sur Memory/D1 ; REST/OpenAPI/MCP officiel avec dividende, tous les outils annoncés en lecture seule, valorisation/contrats historiques V1 préservés.
- `tests/transactions.test.ts` : **31 tests**. Le cas historique interdisant `dividend` devient le refus d'un type `interest` non pris en charge.
- `tests/transactions.fees.test.ts` : **2 cas ciblés** `capitalizes purchase fees` pour la politique descriptive version 3, 14 autres non relancés. Preuves de frais complètes précédentes conservées.
- Total distinct : **65 tests ciblés réussis**, typecheck réussi. Après ajout de l'assertion de lecture seule, le seul scénario SDK concerné a été répété avec succès.
- Commandes : `node node_modules/vitest/vitest.mjs run <trois premières suites> --exclude '**/.wrangler/**'`, filtre `-t 'capitalizes purchase fees'` sur la suite frais, filtre du scénario MCP, et `node node_modules/typescript/bin/tsc --noEmit`.

Pas de suite complète ni d'audit, pas de nouvelle preuve d'exploitation distante. Adaptateurs/migration inchangés. Prochain incrément : gains réalisés, gains latents puis performances, avec conventions et limites historiques explicites.
