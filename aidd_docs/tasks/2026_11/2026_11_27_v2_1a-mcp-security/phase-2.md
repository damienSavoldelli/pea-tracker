---
status: pending
---

# Instruction: D — télémétrie et CI minimales

## Architecture projection

```txt
✏️ src/adapters/mcp/handler.ts
✏️ src/adapters/mcp/financial-tools.ts
✏️ src/adapters/mcp/portfolio-reads.ts
✏️ src/adapters/mcp/portfolio-financial.ts
✅ src/adapters/mcp/security-events.ts (nouveau)
✅ tests/mcp-security-events.test.ts (nouveau)
✅ tests/mcp-security-ci.test.ts (nouveau)
✅ tests/helpers/mcp-security-events.ts (nouveau)
✅ .github/workflows/mcp-security-validation.yml (nouveau)
✅ aidd_docs/tasks/2026_11/2026_11_27_v2_1a-mcp-security/D/evidence.md
✅ aidd_docs/tasks/2026_11/2026_11_27_v2_1a-mcp-security/D/logging-budget.md
✅ aidd_docs/tasks/2026_11/2026_11_27_v2_1a-mcp-security/D/native-security-options.md
✅ aidd_docs/tasks/2026_11/2026_11_27_v2_1a-mcp-security/D/inventory.md
✅ aidd_docs/tasks/2026_11/2026_11_27_v2_1a-mcp-security/D/report.md
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Lire le cadrage committé et vérifier branche/worktree autorisés | Base commune validée, aucune dépendance installée implicitement | session Codex supervisée |
| Happy path | Corriger F1/F2 par instrumentation des callbacks et validation synthétique CI ; aucune collecte ni modification de calcul. | Preuves ciblées et livrables acceptables | API/CLI synthétique ou lecture documentaire |
| Edge case | Succès, refus, exception contenant faux token, logger qui échoue, champ inconnu et outil inconnu | Événements allowlistés sans secrets/données ; résultat et autorisation identiques si logger échoue ; workflow sans secrets de production | API/CLI synthétique |
| Teardown | Fermer transports et runtimes éventuels ; supprimer uniquement les captures synthétiques possédées | Aucune donnée réelle, processus ou état partagé résiduel | session Codex supervisée |

## Tasks to do

### 1) Délimiter et réaliser le lot après autorisation

> Corriger F1/F2 par instrumentation des callbacks et validation synthétique CI ; aucune collecte ni modification de calcul.

1. Lire [la mission et ses limites](missions.md) ; nommer les critères déjà acquis et ne pas les rejouer.
2. AVANT télémétrie, qualifier capacités/quota/coût/rétention applicables ; offre documentée, forfait/configuration et mesures distingués. Documenter dans D/logging-budget.md ; inconnue bloquante = télémétrie non implémentée, travail CI/inventaire poursuivi.
3. Examiner GitHub natif et audits des gestionnaires disponibles avant outil DevSecOps ; ne rien activer/installer ni payer. Documenter D/native-security-options.md. Distinguer inventaires local/distant et tests serveur/LLM.
4. Vérifier les fichiers avant modification, les API et les conflits ; refuser les extensions de périmètre.
5. Réaliser uniquement les nouveaux contrôles nécessaires ; consigner méthode, résultat et limites dans le sous-dossier du lot.
6. Après critères satisfaits, vérifier la confidentialité et réaliser le commit local autorisé ; fournir son SHA. Aucun push/merge par la mission. Si aucun code n'est justifié, livrer une conclusion documentaire.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Capacités/quota/coût/rétention des logs qualifiés avant code ; inconnues explicites et aucun changement distant |
| 1 | Solutions natives GitHub et outils disponibles examinés avant nouvelle proposition DevSecOps |
| 1 | Événements allowlistés sans secrets/données ; résultat et autorisation identiques si logger échoue ; workflow sans secrets de production |
| 1 | Aucune écriture D1 même locale, aucun accès aux données de production, fournisseur financier, transaction réelle, installation implicite ou sous-agent ; D peut consulter uniquement les métadonnées opérationnelles en lecture seule |
| 1 | Aucun secret ni donnée privée dans les fichiers, logs et livrables ; preuves antérieures préservées |
