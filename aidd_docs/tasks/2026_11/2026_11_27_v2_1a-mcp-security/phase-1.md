---
status: pending
---

# Instruction: B — frontières et preuves sans refonte

## Architecture projection

```txt
✅ tests/mcp-security-boundaries.test.ts (création conditionnelle)
✅ aidd_docs/tasks/2026_11/2026_11_27_v2_1a-mcp-security/B/evidence.md
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Lire le cadrage committé et vérifier branche/worktree autorisés | Base commune validée, aucune dépendance installée implicitement | session Codex supervisée |
| Happy path | Compléter seulement les preuves réellement manquantes pour MCP01/MCP02/MCP07 ; auth et comptes restent inchangés. | Preuves ciblées et livrables acceptables | API/CLI synthétique ou lecture documentaire |
| Edge case | Dépassement déclaré et flux sans longueur, faux privilège dans un champ client, faux secret dans une erreur | Refus borné, aucun droit supplémentaire ni divulgation ; sinon réutiliser la preuve existante sans la rejouer | API/CLI synthétique |
| Teardown | Fermer transports et runtimes éventuels ; supprimer uniquement les captures synthétiques possédées | Aucune donnée réelle, processus ou état partagé résiduel | session Codex supervisée |

## Tasks to do

### 1) Délimiter et réaliser le lot après autorisation

> Compléter seulement les preuves réellement manquantes pour MCP01/MCP02/MCP07 ; auth et comptes restent inchangés.

1. Lire [la mission et ses limites](missions.md) ; nommer les critères déjà acquis et ne pas les rejouer.
2. Séparer tests déterministes des protections serveur et évaluations comportementales LLM ; ne pas viser artificiellement 10/10. Réutiliser D pour les coûts/rétention logs et les options natives GitHub.
3. Vérifier les fichiers avant modification, les API et les conflits ; refuser les extensions de périmètre.
4. Réaliser uniquement les nouveaux contrôles nécessaires ; consigner méthode, résultat et limites dans le sous-dossier du lot.
5. Après critères satisfaits, vérifier la confidentialité et réaliser le commit local autorisé ; fournir son SHA. Aucun push/merge par la mission. Si aucun code n'est justifié, livrer une conclusion documentaire.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Refus borné, aucun droit supplémentaire ni divulgation ; sinon réutiliser la preuve existante sans la rejouer |
| 1 | Aucune écriture D1 même locale, aucun accès aux données de production, fournisseur financier, transaction réelle, installation implicite ou sous-agent ; D peut consulter uniquement les métadonnées opérationnelles en lecture seule |
| 1 | Aucun secret ni donnée privée dans les fichiers, logs et livrables ; preuves antérieures préservées |
