---
status: pending
---

# Instruction: C — contexte non fiable et contrats

## Architecture projection

```txt
✅ tests/mcp-context-contracts.test.ts (nouveau)
✅ aidd_docs/tasks/2026_11/2026_11_27_v2_1a-mcp-security/C/field-purpose.md
✏️ src/adapters/mcp/financial-tools.ts (descriptions conditionnelles)
✏️ src/adapters/mcp/portfolio-reads.ts (descriptions conditionnelles)
✏️ src/adapters/mcp/portfolio-financial.ts (descriptions conditionnelles)
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Lire le cadrage committé et vérifier branche/worktree autorisés | Base commune validée, aucune dépendance installée implicitement | session Codex supervisée |
| Happy path | Qualifier F3/F4 après D ; préserver valeurs, schémas V1.1 et digest, sans filtre lexical ni couche IA. | Preuves ciblées et livrables acceptables | API/CLI synthétique ou lecture documentaire |
| Edge case | Nom/provenance synthétiques hostiles, faux approved, identité étrangère, changement de nom d'outil | Donnée jamais interprétée comme autorisation, propriétaire/circuit exacts, catalogue explicite ; aucune suppression de champ financière | API/CLI synthétique |
| Teardown | Fermer transports et runtimes éventuels ; supprimer uniquement les captures synthétiques possédées | Aucune donnée réelle, processus ou état partagé résiduel | session Codex supervisée |

## Tasks to do

### 1) Délimiter et réaliser le lot après autorisation

> Qualifier F3/F4 après D ; préserver valeurs, schémas V1.1 et digest, sans filtre lexical ni couche IA.

1. Lire [la mission et ses limites](missions.md) ; nommer les critères déjà acquis et ne pas les rejouer.
2. Distinguer tests déterministes du serveur et évaluations comportementales LLM ; un corpus de texte hostile n'atteste pas l'immunité d'un modèle. Réutiliser la qualification coûts/quota/rétention des logs et options natives GitHub de D, sans nouvel outil ni vérification distante dupliquée. Inventaire local ≠ déploiements exposés ; laisser les limites externes non vérifiées, sans forcer 10/10 OWASP.
3. Vérifier les fichiers avant modification, les API et les conflits ; refuser les extensions de périmètre.
4. Réaliser uniquement les nouveaux contrôles nécessaires ; consigner méthode, résultat et limites dans le sous-dossier du lot.
5. Fournir un diff et une proposition de commit ; aucun commit/push/merge sans autorisation. Si aucun code n'est justifié, livrer une conclusion documentaire.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Donnée jamais interprétée comme autorisation, propriétaire/circuit exacts, catalogue explicite ; aucune suppression de champ financière |
| 1 | Aucun accès production, fournisseur financier, transaction réelle, installation implicite ou sous-agent |
| 1 | Aucun secret ni donnée privée dans les fichiers, logs et livrables ; preuves antérieures préservées |
