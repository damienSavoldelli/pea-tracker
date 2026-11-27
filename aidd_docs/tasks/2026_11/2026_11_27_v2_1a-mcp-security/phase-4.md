---
status: pending
---

# Instruction: E — intégration et décision de livraison

## Architecture projection

```txt
✏️ README.md
✏️ aidd_docs/roadmap.md
✏️ aidd_docs/memory/architecture.md
✏️ aidd_docs/memory/testing.md
✏️ aidd_docs/tasks/2026_11/2026_11_27_v2_1a-mcp-security/evidence.md
✅ aidd_docs/releases/v2.1.0.md (à préparer seulement)
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Lire le cadrage committé et vérifier branche/worktree autorisés | Base commune validée, aucune dépendance installée implicitement | session Codex supervisée |
| Happy path | Intégrer uniquement les lots autorisés, mettre à jour la matrice et préparer le GO sans livrer automatiquement. | Preuves ciblées et livrables acceptables | API/CLI synthétique ou lecture documentaire |
| Edge case | Fusion des wrappers C/D après autorisation ; erreur de contrôle, manque de preuve hébergée | Arrêt au contrôle critique et limites explicites ; pas de tag/release/déploiement sans autorisation séparée | API/CLI synthétique |
| Teardown | Fermer transports et runtimes éventuels ; supprimer uniquement les captures synthétiques possédées | Aucune donnée réelle, processus ou état partagé résiduel | session Codex supervisée |

## Tasks to do

### 1) Délimiter et réaliser le lot après autorisation

> Intégrer uniquement les lots autorisés, mettre à jour la matrice et préparer le GO sans livrer automatiquement.

1. Lire [la mission et ses limites](missions.md) ; nommer les critères déjà acquis et ne pas les rejouer.
2. Vérifier les fichiers avant modification, les API et les conflits ; refuser les extensions de périmètre.
3. Réaliser uniquement les nouveaux contrôles nécessaires ; consigner méthode, résultat et limites dans le sous-dossier du lot.
4. Fournir un diff et une proposition de commit ; aucun commit/push/merge sans autorisation. Si aucun code n'est justifié, livrer une conclusion documentaire.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Arrêt au contrôle critique et limites explicites ; pas de tag/release/déploiement sans autorisation séparée |
| 1 | Aucun accès production, fournisseur financier, transaction réelle, installation implicite ou sous-agent |
| 1 | Aucun secret ni donnée privée dans les fichiers, logs et livrables ; preuves antérieures préservées |
