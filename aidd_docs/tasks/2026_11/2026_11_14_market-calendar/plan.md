---
objective: "Qualifier les séances établies XPAR/ALXP avec un référentiel local généré sur deux années, sans changer les contrats ou la politique V1."
status: implemented
---

# Plan: Calendrier minimal XPAR / ALXP

Source: [spec.md](spec.md), arbitrages utilisateur du 14 novembre 2026 et spike en conversation. Plan documentaire à valider ; aucune implémentation, installation, opération distante ou publication autorisée ici.

Livraison locale autorisée ensuite par l'utilisateur et réalisée le 14 novembre 2026. Les mentions de validation préalable ci-dessous décrivent l'état de préparation historique. Résultats et limites : [reference-validation.md](reference-validation.md). Aucun commit ni déploiement ; revue utilisateur attendue.

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | Référentiel, résolution serveur et vérifications intégrées | [phase-1.md](phase-1.md) | none |

## External sources

| URL | What it settled |
| --- | --- |
| https://www.euronext.com/en/trading/trading-hours-holidays | Source de contrôle identifiée par le spike ; aucune copie de fichier ni vérification nouvelle des éditions dans ce plan |
| https://www.euronext.com/en/media/1927 | Horaires à contrôler par profil ; les phases non établies restent inconnues |
| https://www.euronext.com/en/terms-use | L'accès public ne constitue pas une autorisation de redistribution |
| https://www.iso20022.org/market-identifier-codes | ALXP est un MIC de segment rattaché à XPAR ; ne pas remplacer le MIC stocké |

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| runtime | Compatible par inspection : callback calendaire injecté dans QuotationService. Aujourd'hui il reçoit le sélecteur, pas le MIC ; adapter ce raccordement interne avec l'instrument déjà lu. Aucun accès calendaire réseau ni nouveau service. Exécution non vérifiée à ce stade. | phase 1 |
| regression | Risque moyen : la fraîcheur devient connue pour les seuls profils admis. Le moteur, les DTO, les montants, l'authentification et les écritures restent inchangés. Les suites quotations.domain, access-read.worker et valuation.contract fournissent le filet existant ; compléter dans la même livraison, sans phase de PoC. | phase 1 |
| architecture | Conserver le domaine de fraîcheur et les ports D1. Ajouter un résolveur calendaire local et transmettre les métadonnées déjà disponibles ; aucun appel MCP vers REST, aucune migration. Le catalogue n'indique pas le mode continu/fixing : rattachement serveur explicite, sinon unknown. | phase 1 |
| documentation | Ce plan et sa phase portent la compatibilité et les preuves attendues ; consigner le manifeste du référentiel et ses exclusions dans le dossier de la fonctionnalité pendant la livraison. Mémoires générales à synchroniser seulement au jalon autorisé. | phase 1 |

## Rules

| Rule | Why it applies |
| --- | --- |
| [AGENTS.md](../../../../AGENTS.md) et [architecture](../../../INSTALL.md) | PEA réel prioritaire, hexagone/API-first, données synthétiques dans les tests, autorisations bornées |
| [Coding assertions](../../../memory/coding-assertions.md) et [testing](../../../memory/testing.md) | Contrôles proportionnés, réutilisation des suites existantes ; aucun test applicatif pendant cette planification |
| [VCS](../../../memory/vcs.md) | Aucun commit/push, migration ou déploiement sans autorisation distincte |
| [Contrat de fraîcheur](../2026_11_11_quotations/contract.md) | Seuils, statuts, priorités et policy_version inchangés ; unknown pour toute ambiguïté |

## Decisions

| Decision | Why |
| --- | --- |
| Une livraison verticale ; génération Python bornée avec la bibliothèque standard, données locales lues par le Worker | Deux MIC et profils limités : aucune bibliothèque de calendriers ni dépendance supplémentaire nécessaire au plan. Aucune tentative de calendrier universel |
| Référentiel et métadonnées de contrôle non financiers ; association instrument/profil privée et explicite, sans défaut par MIC | Le code ne stocke pas le groupe de négociation. Ne pas inventer un mode continu à partir d'un MIC, d'un type d'instrument ou d'un symbole Yahoo |
| Admission partielle, jamais de dates ou phases présumées fiables | L'absence de preuve exclut le jour/profil et produit unknown ; la livraison ne promet pas la qualification de toutes les cotations, notamment ALXP |
