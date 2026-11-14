---
status: done
---

# Instruction: Livrer le calendrier borné dans les lectures existantes

Livraison locale terminée ; preuves et exclusions consignées dans [reference-validation.md](reference-validation.md). Les instructions suivantes restent la trace du périmètre préparé. Aucune activation distante.

## Architecture projection

```txt
.
├── scripts/
│   └── generate-market-calendar.py ✅
├── src/
│   ├── application/
│   │   └── quotations.ts ✏️
│   ├── adapters/
│   │   └── calendar/
│   │       ├── profiles.json ✅
│   │       ├── sessions.generated.json ✅
│   │       └── market-calendar.ts ✅
│   └── entrypoints/
│       └── access-read.ts ✏️
├── tests/
│   ├── market-calendar.test.ts ✅
│   ├── quotations.domain.test.ts ✏️
│   ├── access-read.worker.test.ts ✏️
│   └── valuation.contract.test.ts ✏️
├── collector/
│   └── tests/
│       └── test_market_calendar_generation.py ✅
└── aidd_docs/
    └── tasks/
        └── 2026_11/
            └── 2026_11_14_market-calendar/
                └── reference-validation.md ✅
```

Aucune suppression. Ne modifier ni moteur de fraîcheur, ni ports/repositories D1, ni contrats REST/MCP, ni workflows/cadence/monitoring. Les fichiers nouveaux sont une projection, pas du code déjà créé.

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Fixtures synthétiques, horloge injectée, référentiel local ; D1 local uniquement dans la suite existante | Aucun identifiant financier réel ni accès fournisseur/calendrier distant | system |
| Happy path | Lire une cotation et une valorisation sur un profil établi, via REST puis MCP au même instant | Contexte cohérent, montants inchangés, DTO V1 valides | api |
| Edge case | Générer pour Y puis Y+1, avec séances antérieures vérifiées | Années Y/Y+1 puis Y+1/Y+2 ; contenu reproductible, limites explicites | cli |
| Edge case | Week-end, fermeture, demi-séance et changements d'heure | Phase et séance attendue correctes sur les zones établies ; enchères/fixings non couverts inconnus | system |
| Edge case | MIC nul/inconnu, profil absent, association incohérente, référentiel invalide/hors période ou trou de couverture | unknown ; aucune panne générale du lecteur ou dérivation vers une autre place | api |
| Edge case | Configuration calendaire optionnelle valide, absente puis invalide ; clé étrangère ou configuration d'authentification invalide | Les cas calendaires n'interrompent pas V1 ; une clé étrangère ou erreur d'authentification conserve le refus strict existant | api |
| Edge case | Séance antérieure impossible à établir, notamment après une journée ambiguë | unknown ; ne pas sauter l'ambiguïté pour inventer une dernière séance | system |
| Edge case | Prix inchangé, collecte récente d'une transaction ancienne, absence de cotation et horloge incohérente | Seuils et priorités V1 inchangés ; aucun diagnostic automatique de panne du collecteur | system |
| Teardown | Fermer les fixtures D1/HTTP de la suite existante | Aucun processus de test restant, aucune donnée distante modifiée | system |

## Tasks to do

### `1)` Générer et contrôler le référentiel

1. Définir les profils admis et leurs périodes/phases établies dans profiles.json ; documenter références datées, règles/exception contrôlées, exclusions, licence et historique antérieur. Aucun fichier officiel ni donnée privée recopié ; aucune admission d'horaire non vérifié.
2. Générer avec datetime/zoneinfo/json de la bibliothèque standard : année courante du fuseau du profil et année suivante, plus dernière séance antérieure vérifiée. Chaque date ou intervalle est explicitement établi ouvert, fermé ou inconnu ; une absence de ligne ne vaut jamais fermeture. Échouer à publier un profil sans preuve suffisante et le laisser inconnu côté lecteur.
3. Produire sessions.generated.json avec bornes UTC, date de séance locale, version du générateur, couverture et provenance ; garder un contenu déterministe à entrées identiques. Le renouvellement annuel est une opération locale revue, sans nouveau schedule ni écriture cloud. Les périodes nécessaires non renouvelées restent inconnues.
4. Intégrer les contrôles de génération dans test_market_calendar_generation.py, sans installation ni paquet supplémentaire, et écrire reference-validation.md avec les contrôles officiels et écarts/exclusions réellement observés. Aucune assertion globale de couverture sans preuve.

### `2)` Raccorder le contexte au lecteur

1. Ajouter le résolveur local market-calendar.ts : profil explicitement attribué, bornes établies, gestion de la séance précédente et propagation des ambiguïtés. Fournir uniquement le MarketContext V1 existant ; ne jamais inventer un fixing ou une tolérance.
2. Conserver l'instrument déjà obtenu dans QuotationService.statusAt et transmettre ses métadonnées à un callback interne optionnel compatible avec les injections existantes. Aucun nouvel accès D1 ni modification du port ; l'absence d'injection conserve le comportement actuel.
3. Composer le résolveur dans access-read.ts avec une association serveur optionnelle et privée instrument/profil, vérifiée contre le MIC enregistré. Toute association absente/invalide implique unknown ; aucune liste privée en source, test ou documentation. Isoler uniquement les entrées calendaires explicitement nommées avant le parseur strict de configuration existant et les valider séparément sans exception globale : une erreur calendaire ne doit pas transformer les lectures V1 en HTTP 503. Toute autre clé et les entrées d'authentification restent soumises aux refus stricts existants.

### `3)` Vérifier la livraison et consigner les limites

1. Étendre les suites listées : nouvelles fixtures de résolution, assertions de seuils/priorités existantes, lectures REST/MCP à horloge identique et montants de valorisation avant/après. Garder les cas inconnus et refus d'autorisation existants.
2. Lors du développement autorisé seulement : exécuter les seuls tests Python de génération et les suites TypeScript concernées, puis le typecheck existant. Vérifier OpenAPI via les assertions existantes sans modifier son document. Un contrôle Worker local ciblé peut compléter ces suites si le raccordement le nécessite ; aucun déploiement ni PoC distinct.
3. Consigner résultats et limites dans reference-validation.md ; vérifier qu'aucun contrat historique, migration, workflow ou calcul financier n'a changé. Présenter la couverture réellement établie et les profils restant inconnus avant toute demande d'activation distante.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Deux années générées et historique antérieur utilisable pour au moins un profil réellement établi, contenu reproductible, provenance/licences tracées ; aucun fichier officiel redistribué et aucune date/phase incertaine annoncée couverte. Si aucun profil n'est admissible, signaler la livraison incomplète sans lancer de nouvelle étude générale |
| 2 | Réemploi du même instrument déjà lu et de MarketContext ; callback existant compatible ; absence de configuration, profil ou preuve donne unknown sans interrompre le lecteur ; aucune modification d'authentification ou d'écriture |
| 3 | Résultats REST/MCP cohérents, montants inchangés, seuils/priorités V1 conservés ; vérifications ciblées intégrées au développement et périmètre applicatif futur limité à cette livraison |
