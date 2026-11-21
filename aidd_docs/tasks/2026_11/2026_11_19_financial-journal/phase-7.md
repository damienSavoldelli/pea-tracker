---
status: done
---

# Phase 7 — Flux externes et gain économique conditionnel

Mission utilisateur : vérifier les prérequis, livrer uniquement les indicateurs justifiables et distinguer gain monétaire/rendement. [Constats, conventions et limites](performance.md).

- [x] Référence existante vérifiée dans le modèle : ouverture/cash déclarés et observations de marché séparées, pas de valorisation initiale de marché explicitement sélectionnée.
- [x] Flux datés exacts, contrepassations et frontière de période par version, hors mouvements internes.
- [x] Contrôle d'un instantané de marché fourni par composition de confiance et gain économique EUR conditionnel ; pas de substitut PRU ni de pourcentage inventé.
- [x] Référence absente/incomplète/incohérente ou invalidée par antidatation : statut explicite d'indisponibilité. Avertissements conservés ; valorisation actuelle incomplète refusée pour le gain.
- [x] Lectures V1.1 enrichies, capture unique état/événements, contrats historiques V1 et lecture seule MCP préservés.
- [x] Documentation/mémoire actualisées sans hook ni indexation Git. Aucun instantané réel choisi/persisté, commit, push, déploiement ou D1 de production.

## Preuves locales

- `tests/performance.test.ts` : **14 tests**, marché initial distinct du PRU, absence de flux, versement/retrait, combinaison des flux, dividendes/frais comptés une seule fois, corrections avant/après référence, référence manquante, prix absent/périmé, fermeture normale, avertissements, antidatation, identité/nature et sélection isolées, valeurs de marché très petites exactes.
- `tests/portfolio-journal-read.test.ts` : **20 tests**, dont deux nouveaux scénarios de référence sélectionnée sur Memory/D1, copie de l'instantané, flux/dividendes/frais, réserves de fraîcheur, ouverture/cash et contrats REST/MCP officiels. Le client ne peut injecter une valeur initiale par un argument MCP.
- Total distinct : **34 tests ciblés réussis**, typecheck réussi. Les premiers scénarios ont révélé un vocabulaire d'avertissements incomplet dans le seul OpenAPI V1.1 ; alignement sur les avertissements existants et correction de l'assertion temporelle (>60 minutes), puis seules les scénarios concernés et MCP répétés avec succès. Aucun changement du domaine calendrier/fraîcheur.
- Après le cas supplémentaire « dernière séance marché fermé », seul ce nouveau test a été exécuté ; après mise à jour des descriptions MCP, seul son scénario SDK a été répété.
- Commandes : `node node_modules/vitest/vitest.mjs run tests/performance.test.ts tests/portfolio-journal-read.test.ts --exclude '**/.wrangler/**'`, filtres ciblés ensuite, `node node_modules/typescript/bin/tsc --noEmit` ; `git diff --check`.

Pause explicite utilisateur respectée ; reprise limitée au résultat du dernier test et à la clôture documentaire, sans audit ni opération distante. Les preuves antérieures des gains, frais, dividendes et du journal restent réutilisées.
