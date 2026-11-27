# Codebase Audit: V2.1A MCP security

Audit ciblé de V2.0.0 ; pas de vulnérabilité critique démontrée.

- **Date**: 2026-11-27
- **Scope**: composition financière, frontières REST/MCP, Access/relay, D1, ingestion, Python et workflows suivis
- **Health**: good au sens limité du modèle AIDD (aucun constat critique établi), pas une certification
- **Findings**: 0 critical, 2 major, 2 minor ; incertitudes séparées

## Findings

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| major / moyen | security | `src/adapters/mcp/handler.ts:72` | F1 : absence d'événements structurés par invocation MCP ; les journaux financiers et refus d'auth ne couvrent pas les lectures/échecs applicatifs | Petit événement technique allowlisté dans les callbacks, sans entrée/résultat ni identifiant financier | M |
| major / moyen | security | `.github/workflows/v2-integration-validation.yml:5` | F2 : workflow de validation uniquement sur l'ancienne intégration ; pas de gate V2.1 ou contrôle dépendances dédié dans les fichiers inspectés | Workflow synthétique à permissions minimales et procédure de revue de dépendances, sans campagne externe ni upgrade aveugle | M |
| minor / faible | security | `src/domain/portfolio.ts:6`, `src/adapters/mcp/handler.ts:76` | F3 : données textuelles libres bornées transmises au modèle sans frontière de confiance explicitée dans le contrat des sorties | Documenter les champs non fiables, tests de non-autorisation et de stabilité du catalogue ; pas de filtre destructif | S |
| minor / faible | security | `src/application/portfolio-reads.ts:34` | F4 : enveloppe du registre retournée intégralement à l'owner ; pas d'inventaire finalité/minimisation par champ | Inventaire et décision de compatibilité avant toute suppression ; pas de fuite entre propriétaires établie | S |

Gravité « moyen » = lacune de contrôle/détection démontrée, pas exploitation démontrée. Aucun détail d'exploitation sensible ni secret enregistré.

## Top actions

1. Valider le plan ; lancer B (qualification seulement) et D (F1/F2) au maximum en parallèle, manuellement.
2. C traite F3/F4 d'abord comme contrat et tests ; aucun changement d'enveloppe financière ou filtre lexical sans besoin démontré.
3. E intègre les écarts autorisés et relie les preuves à chaque risque. Révoquer un contrôle prévu s'il est déjà satisfait ; ne pas empiler les dispositifs.

## Coverage

- **Scanned**: security ; supply-chain limitée aux mécanismes suivis dans Git, sans audit général de CVE.
- **Skipped**: infrastructure distante, politiques/révocation réelle Access, historiques de secrets exhaustifs, tous les packages transitifs, mémoire client/serveurs MCP tiers, alertes GitHub distantes.
- Aucun test acquis relancé. Seul contrôle d'incertitude : dépassement déclaré et flux sans longueur >4 Mio, SDK installé 1.32.2, deux refus 413, aucun réseau. Première tentative de harnais a réutilisé un transport stateless et échoué ; corrigée en un transport par requête, comme le code applicatif, sans changement du produit.
- Pas de shell générique applicatif identifié. Secrets : recherche ciblée de motifs dans les sources/tests/workflows concernés sans résultat ; cela ne certifie ni historique Git ni coffre/rotation.
- SDK possède déjà une borne 4 Mio / batch 100 : **aucune correction « corps illimité » à développer**. Une borne métier plus petite serait une décision de coût/compatibilité, non une faille prouvée.
- [Matrice détaillée](owasp-matrix.md), [références](references.md), [frontières](trust-boundaries.md).
