---
status: done
---

# Phase 6 — Gains réalisés et latents

Mission utilisateur : calculs déterministes exacts, contrepassations, couverture/provenance, lectures V1.1 et préparation des performances sans rendement indéfini. [Conventions et limites](gains.md).

- [x] Réalisés par vente, instrument et portefeuille, y compris lignes soldées ; produit net, coût cédé exact, gains/pertes signés et provenance initiale.
- [x] Ventes contrepassées exclues une fois ; coût insuffisant et corrections d'achat ambiguës explicitement indisponibles. Pas de réécriture du journal.
- [x] Latents par position et portefeuille, pourcentages sur coût restant strictement positif ; agrégats incomplets jamais annoncés complets.
- [x] Arithmétique exacte partagée, représentation demi-pair signée, sans double comptage des frais/dividendes ; avertissements de cotation conservés.
- [x] Contrats V1 inchangés ; lecture seule et isolation réel/fictif préservées ; domaine et OpenAPI local enrichis, aucune migration ou opération distante.
- [x] Sources des flux et limites de l'état initial identifiées pour le prochain incrément de performance.

## Preuves locales

- `tests/gains.test.ts` : **13 tests**, ventes avec gains/pertes et frais, coût pondéré/vente partielle/totale, contrepassation, coût inconnu/couverture mixte, réconciliation, dividendes hors gains de cession, quotients exacts, prix/coût absents, coûts nuls, pourcentages et arrondis négatifs.
- `tests/cost-basis.test.ts` : **11 tests** existants relancés car helper exact/replay partagés ; quantités, coûts et PRU inchangés.
- `tests/portfolio-journal-read.test.ts` : **18 tests**, deux nouveaux scénarios gains sur Memory/D1, isolation des gains réel/fictif sur stockage partagé, dividendes non comptés deux fois, couverture et contrats REST/MCP officiels ; réponses/valorisation V1 inchangées.
- Total distinct : **42 tests ciblés réussis**, typecheck réussi. Après le cas de couverture réalisée mixte et l'assertion d'arrondi négatif, seuls ces deux cas et le scénario MCP concerné ont été répétés : 3/3.
- Commandes : `node node_modules/vitest/vitest.mjs run tests/gains.test.ts tests/cost-basis.test.ts tests/portfolio-journal-read.test.ts --exclude '**/.wrangler/**'` ; filtres ciblés ensuite ; `node node_modules/typescript/bin/tsc --noEmit`.
- Pas de suite complète, audit général, sous-agent, commit, push, déploiement ni données D1 de production. Les autres preuves antérieures sont réutilisées, pas réexécutées.
