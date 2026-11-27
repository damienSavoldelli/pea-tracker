---
objective: "Préparer les corrections MCP V2.1 justifiées par les preuves sans modifier le produit pendant V2.1A."
status: pending
---

# Plan: V2.1 MCP Security & Hardening

Source: cadrage et découpage validés par le propriétaire le 27 novembre 2026 ; [audit](security.md), [matrice](owasp-matrix.md), [références figées](references.md).

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | B — qualification des frontières et secrets ; pas de réécriture auth | [phase-1.md](./phase-1.md) | none |
| 2 | D — télémétrie minimale, CI et inventaire | [phase-2.md](./phase-2.md) | none |
| 3 | C — contrats, contexte non fiable et intention | [phase-3.md](./phase-3.md) | 1, 2 |
| 4 | E — intégration et préparation de livraison | [phase-4.md](./phase-4.md) | 1, 2, 3 |

## External sources

| URL | What it settled |
| --- | --- |
| https://github.com/OWASP/www-project-mcp-top-10/tree/165fe0f78ef104459237b4a8e0f6e78db9b02391 | Taxonomie figée et divergence MCP06 |
| https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization | Rôles, validation de destinataire et séparation de l'autorité |
| https://modelcontextprotocol.io/specification/2025-11-25/basic/transports | Origin, transport stateless et HTTP |
| https://modelcontextprotocol.io/specification/2025-11-25/server/tools | Contrat et annotations non constitutives de permission |

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| runtime | Aucun changement en A ; ajout possible de télémétrie allowlistée seulement dans D | phase 2 |
| regression | Préserver droits, AUD, approbation indépendante et contrats financiers ; preuves acquises réutilisées | phases 1, 3, 4 |
| architecture | Architecture hexagonale/API-first conservée ; pas de PDP/guardrail LLM, serveur ou coffre supplémentaire | phases 1–4 |
| documentation | README/roadmap actualisés ; historique conservé ; matrice et missions manuelles | phases 1–4 |
| operations | Pas de production ni fournisseurs ; D1 local uniquement synthétique si nécessaire et autorisé | phase 4 |

## Rules

| Rule | Why it applies |
| --- | --- |
| AGENTS.md et politique VCS | A : commit/push autorisés ; B/D : commit local autorisé après critères, push/merge réservés au pilote ; installations séparément autorisées |
| Coût et capacités avant télémétrie ; options natives avant outil | D qualifie puis code seulement si justifié ; aucune activation distante/payante |
| Tests serveur, comportement LLM et inventaires distingués | Ne pas forcer une couverture des limites externes |
| Deux sessions maximum, lancées par le propriétaire | B et D indépendants ; C ensuite ; aucune délégation automatique |
| Pas d'édition financière de test sur le réel | Jeux synthétiques uniquement ; aucune écriture distante |
| Cadrage committé avant les branches de travail | Tous les agents utilisent la même preuve et la même référence validée |

## Decisions

| Decision | Why |
| --- | --- |
| B réduit à qualification, C tests/contrats d'abord, D seul lot de code nécessaire dès l'audit | Pas de contournement auth démontré ; F1/F2 sont les changements concrets |
| B et D parallèles, C puis E séquentiels | Tests B séparés ; D possède les wrappers MCP ; C attend leur contrat stabilisé |
| Publication et déploiement V2.1 soumis à un GO distinct | L'autorisation V2.0 ne couvre pas cette version |
