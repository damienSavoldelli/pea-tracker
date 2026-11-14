# PEA Tracker — Calendrier minimal XPAR / ALXP

## Target

Qualifier la fraîcheur des cotations pour les séances XPAR/ALXP effectivement couvertes par un référentiel local borné, en conservant les résultats V1 et un contexte `unknown` ailleurs.

## Hard constraints

- Première livraison limitée à XPAR et ALXP. Conserver le MIC enregistré : ALXP est un segment rattaché à XPAR, pas un synonyme à substituer dans le catalogue. L'appartenance au même opérateur ne suffit pas à établir des horaires identiques.
- Le référentiel est généré localement, versionné et borné. Chaque génération couvre l'année courante et l'année suivante, avec l'historique vérifié nécessaire pour retrouver la dernière séance antérieure au début de période. En 2026, la cible est 2026–2027 ; le renouvellement annuel ne doit pas être confondu avec une régénération pendant les lectures. Aucune prolongation automatique au-delà de la couverture.
- Conserver la version/provenance du générateur, la période couverte, les profils admis et les références datées utilisées pour contrôle officiel. Les fichiers officiels ne sont ni recopiés ni redistribués sans droits établis ; la génération ne dispense pas de vérifier les licences et notices applicables. Une séance ou un profil non établi est exclu de la couverture, sans bloquer les profils établis.
- Les fuseaux IANA et changements d'heure sont pris en compte ; les instants d'évaluation et les bornes de séance sont comparables en UTC. Un jour férié civil ne remplace pas un calendrier de marché.
- Réutiliser `MarketContext` et la politique de fraîcheur V1 : aucune modification des contrats REST/MCP, des champs/énumérations publics, des seuils 45/60 minutes, de `policy_version` ou des calculs de valorisation. La seule évolution attendue est un contexte calendaire fiable là où il est établi.
- Pour un profil couvert et un instant non ambigu, le contexte indique la phase ouverte/fermée et la date de séance attendue : séance en cours pendant sa couverture, dernière séance achevée avant ouverture ou après fermeture. Si cette dernière séance ne peut pas être établie, ne pas en inventer une.
- Référentiel absent, invalide, hors période, MIC/profil non couvert ou phase ambiguë : `phase: unknown`, `expected_session_date: null`. Pour une cotation utilisable, le moteur conserve alors `market_calendar_unknown` ; ses priorités V1 pour absence de cotation et incohérence d'horloge restent inchangées.
- Un MIC seul ne prouve pas un profil continu ou fixing. Le rattachement à un profil doit être établi côté serveur sans altérer les métadonnées stockées ni publier d'identifiants privés. Si ce rattachement manque, le résultat reste `unknown`, y compris pour ALXP ; la livraison n'annonce pas une couverture complète des deux MIC.
- Aucun horaire de fixing, délai de grâce à l'ouverture, tolérance après clôture ou traitement d'enchères n'est ajouté. Une période ou un profil dont la correspondance avec `MarketContext` n'est pas validée reste `unknown` ; ne pas le déclarer fermé par commodité.
- Garder distincts `last_successful_fetch_at`, `market_timestamp`, dernier échec et délai fournisseur. Un prix inchangé ne constitue pas un échec. Une ancienne séance reste traitée selon V1, même après collecte réussie ; `stale` ne signifie pas nécessairement panne du collecteur.
- `last_completed_session` conserve le type de prix fourni : ce statut ne transforme jamais `last_trade` en cours officiel de clôture. Aucun statut ne garantit du temps réel ni l'absence de suspension exceptionnelle.
- Aucun accès fournisseur ou service calendaire distant pendant une lecture REST/MCP. Préserver les autorisations, l'idempotence, les données et les contrats historiques V1.

## Non-goals

- Calendrier universel, autres places, sessions étendues, état temps réel des suspensions ou nouvelle politique de fraîcheur.
- Modification des schedules, de la cadence, des règles de saut de collecte ou du monitoring GitHub Actions ; aucun nouveau canal d'alerte.
- Migration D1, changement de métadonnées des instruments, nouveau contrat public ou dépendance sélectionnée par cette spécification.
- PoC indépendant, batterie globale de tests, implémentation ou déploiement avant validation.

## Done-when

1. La génération produit l'année courante et l'année suivante, avec une dernière séance antérieure vérifiée pour chaque profil admis ; une génération reproduite à entrées identiques donne le même contenu. Au moins un profil possède une couverture réelle établie ; un référentiel entièrement inconnu n'est pas une livraison fonctionnelle. Chaque profil annoncé comme couvert est contrôlé contre les références officielles, sans copie non autorisée de leurs fichiers. Aucune équivalence ALXP/XPAR n'est implicite.
2. Les vérifications ciblées de développement couvrent jour ordinaire, week-end, fermeture officielle, demi-séance, changement d'heure, frontières exactes de séance et renouvellement annuel. Hors couverture, profil non établi, séance antérieure inconnue et ambiguïtés produisent le repli explicite, sans appel distant pendant la lecture.
3. Les cas synthétiques couvrent prix inchangé, transaction ancienne avec collecte récente, séance attendue manquante, absence de cotation et horloge incohérente. Les seuils et priorités V1 restent identiques ; aucune tolérance supplémentaire n'est introduite.
4. REST et MCP donnent des résultats cohérents à données/horloge identiques ; une valorisation conserve montants, couverture et provenance, avec les seuls changements de contexte/avertissements justifiés par le calendrier. Les profils non couverts restent inconnus.
5. Les contrats V1, le schéma D1 et les workflows sont inchangés. Les preuves ciblées sont intégrées aux tests de développement existants, sans PoC séparé ; tout changement de dépendance est justifié et autorisé séparément.

## Open Questions

None. Les arbitrages de périmètre sont fixés. Les éditions de contrôle, licences et profils effectivement établis sont des preuves à produire pendant le développement avant leur admission dans le référentiel ; leur absence impose le repli défini ci-dessus et interdit d'annoncer leur couverture.

## Context

Principe accepté par l'utilisateur ; arbitrages de finalisation intégrés le 14 novembre 2026. La révision finale et le [plan en une livraison](plan.md) restent à valider avant implémentation. Aucun nouveau spike ni PoC indépendant n'est requis ; les vérifications font partie des tests ciblés de développement. Cette mise à jour n'autorise aucun changement applicatif.

- Sources de cadrage : spike en conversation, sans artefact persisté ni PoC exécuté ; inspection locale agrégée des MIC, sans reproduction des instruments ou positions. La couverture distante n'a pas été relue.
- [Roadmap et arbitrages V1.1](../../../roadmap.md), [architecture et frontières](../../../INSTALL.md), [complément du PRD](../2026_11_08-financial-backend-prd.md).
- Contrats préservés : [cotations / fraîcheur V1](../2026_11_11_quotations/contract.md), [valorisation V1](../2026_11_11_valuation/contract.md).
- Références publiques identifiées par le spike : [calendrier officiel Euronext](https://www.euronext.com/en/trading/trading-hours-holidays), [annexe des horaires](https://www.euronext.com/en/media/1927), [registre ISO des MIC](https://www.iso20022.org/market-identifier-codes), [conditions d'utilisation Euronext](https://www.euronext.com/en/terms-use). Ces liens ne valent ni validation d'une édition du référentiel ni autorisation de redistribution.
