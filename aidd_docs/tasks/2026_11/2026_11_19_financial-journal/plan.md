---
objective: "Livrer localement un journal financier EUR isolé de la V1, rattaché explicitement à un portefeuille, avec persistance, contrepassations et idempotence."
status: implemented
---

# Plan: Premier journal financier V1.1

Source : mission utilisateur et décisions explicites de la session du 19 novembre 2026. Elles autorisent le développement et les vérifications locales, pas de commit, push, déploiement, modification OAuth ou migration de production.

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | Domaine, ports, adaptateurs et REST isolé ; vérifications ciblées | [phase-1.md](phase-1.md) | none |
| 2 | Lectures projetées additives REST/MCP, sans PRU inventé | [phase-2.md](phase-2.md) | 1 |
| 3 | Coût restant et PRU pondéré hors frais, autorisés le 20 novembre | [phase-3.md](phase-3.md) | 2 |
| 4 | Frais déclarés capitalisés à l'achat/déduits à la vente, convention validée le 20 novembre | [phase-4.md](phase-4.md) | 3 |
| 5 | Dividendes reçus EUR, corrections et lectures courantes | [phase-5.md](phase-5.md) | 4 |
| 6 | Gains réalisés/latents exacts et préparation des performances | [phase-6.md](phase-6.md) | 5 |
| 7 | Flux externes exacts et gain économique conditionné à une référence de marché | [phase-7.md](phase-7.md) | 6 |

## External sources

| URL | What it settled |
| --- | --- |
| none | Réutilisation du dépôt, du PRD et des décisions utilisateur ; aucune nouvelle recherche externe |

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| runtime | Composition locale optionnelle, aucun import par les Workers déployés ; calculs exacts BigInt internes | phase 1 |
| regression | Vérifier replay, concurrence, contraintes de solde, redémarrage D1 et absence de modification de l'état initial | phase 1 |
| architecture | Nouveau port de journal ; identité de portefeuille explicite et état initial épinglé sans modifier le repository V1 global | phase 1 |
| documentation | Contrat local OpenAPI séparé, règles validées et limites opérationnelles documentées | phase 1 |

## Rules

| Rule | Why it applies |
| --- | --- |
| AGENTS.md et mémoire architecture/VCS | PEA réel prioritaire, hexagone, aucune opération distante ni commit implicite |
| PRD financier et supplément | Ne pas inventer de coût historique, PRU, frais ou performance |
| Décisions utilisateur du présent incrément | EUR, date explicite, ordre chronologique, solvabilité, contrepassation |

## Decisions

| Decision | Why |
| --- | --- |
| Identité de portefeuille fournie par composition autorisée, propriétaire et nature réel/fictif explicites | Prépare la séparation future sans API de gestion multi-portefeuille ni sélection libre côté client |
| Ancre immuable opening_id/opening_revision ; aucune réécriture des états V1 | Les révisions V1 sont globales ; ne pas les réinterpréter comme des identifiants de portefeuille |
| Projection séparée, sans PRU calculé ni raccordement aux lectures V1 | Les règles de coût et la réconciliation d'une correction de l'état initial restent hors incrément |
| Lectures V1.1 courantes additives ; réponses V1 historiques inchangées | Décision utilisateur : ne jamais réutiliser un PRU déclaré comme PRU courant ; projection explicitement identifiée et journal épinglé |
| Montant EUR exécuté explicitement déclaré ; aucune déduction depuis quantité × cours | Évite toute approximation de prix, de frais ou d'arrondi financier implicite |
