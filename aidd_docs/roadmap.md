# PEA Tracker — Roadmap & vision

Référence de périmètre V1.1–V2.3, issue de `02_ROADMAP_VISION_MAJ.md` et intégrant
les arbitrages utilisateur du lot documentaire 1, le 14 novembre 2026.
Cette roadmap ne vaut ni spécification financière ni autorisation de développement.

## Statuts et preuves

- **24 November 2026, corrective-branch production acceptance:** the owner reported
  the first successful real nominal MCP preparation, independent browser approval,
  explicit confirmation and portfolio/journal reread after the authentication and
  native-form fixes. This closes the nominal first-write gate at owner-reported
  evidence level; production replay and negative/failure scenarios remain separate.
  No real financial values or identifiers are published. The fixes are deployed
  from `fix/v1.1-mcp-approval`; [v1.1.4](releases/v1.1.4.md) consolidates the
  corrective delivery and its limits. See the
  [dated acceptance update](releases/v1.1.0-validation.md#production-acceptance-update--24-november-2026).
  Earlier release-time pending statements below remain historical.

- **V1.1.3 patch, 23 November 2026:** explicit Access reconnection button deployed, with a cross-application logout warning. Recovery aid only; the underlying `invalid_token` cause and real approved-write acceptance remain unverified. See [release](releases/v1.1.3.md).

- **V1.1.2 patch, 23 November 2026:** unified confirmation/status presentation and absolute expiry countdown deployed; server financial controls unchanged. See [release and limits](releases/v1.1.2.md). The hosted authentication issue and real write acceptance are separate from this presentation delivery.

- **V1.1.1 patch, 23 November 2026:** confirmation GET accepts known UTM tracking parameters; responsive form deployed with unchanged financial authorization. Local evidence and minimal production availability checks are recorded in the [release](releases/v1.1.1.md). The owner's real approved MCP write/receipt/replay acceptance remains pending; no V2 development is included.

- **Développé** : capacité présente dans le code ; cela ne prouve pas son exploitation.
- **Testé localement** : preuves antérieures sur fixtures synthétiques, consignées dans les contrats/plans V1 ; aucun test relancé pour ce lot documentaire.
- **Validé en exploitation** : observations antérieures rapportées dans la reprise utilisateur ; aucune vérification distante effectuée pour ce lot.
- **Prévu** : intention de périmètre, sans engagement de livraison ni faisabilité acquise.
- **À étudier** : règles, données, intégration ou coût encore à établir avant une décision.

Les contrats V1 historiques restent inchangés. Voir l'[architecture et ses limites](INSTALL.md)
et l'[état opérationnel V1](tasks/2026_11/2026_11_14_live-quotations-read/runbook.md).

## Vision et décisions validées

**PEA Tracker reste avant tout le système de gestion et d’analyse du PEA réel.** Trading Lab est un usage complémentaire, distinct et cloisonné. Le projet est aussi un terrain d’apprentissage en architecture logicielle et solutions IA.

Stratégie validée : **option A — développement progressif**, avec **organisation 2 — V1.1 puis V2.0 à V2.3**. Livrer rapidement des capacités utiles à Trading Lab sans retarder indéfiniment les fonctions essentielles du PEA réel. Garder l’architecture hexagonale existante, éviter l’usine à gaz.

**Les fonctionnalités futures sont des intentions à confirmer, pas des capacités déjà testées.** Avant planification engageante : vérifier APIs, quotas, coût, licences, compatibilité, sécurité et stockage ; réaliser un PoC ciblé en cas d’incertitude ; décider go / conditionnel / report / abandon. Respecter les [instructions du projet](../AGENTS.md), les [conventions AIDD](GUIDELINES.md) et les frontières de sécurité d'[INSTALL.md](INSTALL.md).

## V1 — Consultation et valorisation

Objectif : consulter le PEA réel depuis ChatGPT : positions, liquidités, dernières cotations, valorisation et avertissements de fraîcheur.

État : **développé et testé localement** ; **validé en exploitation** pour les lectures réelles rapportées dans ChatGPT : catalogue, positions, PRU déclarés, liquidités, cotations horodatées et valorisation exacte, avec couverture et avertissements. Les services REST/MCP sont partagés ; chaque route REST ne dispose pas pour autant d'une preuve d'exploitation individuelle.

La V1.0.0 est publiée sur le commit `1f6ba490550e0355be65d8667e3e80b5ca98ddef`, tag annoté `v1.0.0`. L'automatisation Cloudflare → GitHub Actions a été validée avec réserves mineures le 19 novembre : 21 collectes consécutives, 20 instruments ingérés par cycle, 13 monitorings exécutés. Les incidents du matin et les limites de preuve sont conservés dans le [bilan V1 et RETEX](releases/v1.0.0-validation.md). Les anciens schedules GitHub et le workflow de diagnostic ont été supprimés ; `workflow_dispatch` et les protections sont conservés. Ne pas compromettre cette V1.

La V1.1 publiée ajoute un calendrier de place partiel : 19 affectations XPAR pour les journées entièrement fermées, sans qualification des modes continu/fixing ni des phases intraday ; ALXP reste `unknown`. Le monitoring dépend encore de GitHub et le heartbeat externe n'est pas configuré. Le contrôle de clôture à 20 h 09 Paris a été observé réussi le 20 novembre ; cette preuve ultérieure ne modifie pas le bilan historique du 19. Une limite d'appels de consultation n'établit pas un échec de collecte.

## V1.1 — Gestion quotidienne du PEA réel

**V1.1.0 publiée le 21 novembre 2026, tag `v1.1.0`, commit `c6e7dee` ; état revu le 22 novembre.** Journal EUR, achats/ventes, versements/retraits, contrepassations, frais, dividendes, coût/PRU pondéré, gains et rendement estimatif Modified Dietz sont livrés ; contrats V1 préservés. Les 18 outils MCP comprennent 11 lectures/diagnostics, six préparations et une confirmation ; l'approbation indépendante par navigateur conserve sa permission propre. Aucune transaction réelle n'a encore validé tout le parcours en production. L'état opérationnel Bourse Direct à la clôture du 20 novembre est distinct de l'ouverture historique du 13 ; les opérations intermédiaires ne sont pas reconstituées. La référence initiale de marché, séparée du PRU, conserve sa provenance courtier. Voir la [release](releases/v1.1.0.md) et les [preuves consolidées](releases/v1.1.0-validation.md).

| Bloc | Développé / testé localement | Déploiement / limite restante |
| --- | --- | --- |
| Journal, liquidités, frais, dividendes, PRU et gains | Oui, services métier exacts et isolation explicite | Déployés ; aucune nouvelle transaction de production ni historique artificiel |
| MCP financier et approbation navigateur | Oui, refus, expiration, empreinte, consommation unique et rejeu couverts | Drapeau actif, identité/audiences séparées et accès anonymes refusés ; parcours réel complet encore non validé |
| Reprise opérationnelle, migration 0007 | Oui, référence immuable et garde journal vide | Déployée, données privées comparées exactement et V1 préservée |
| Calendrier / fraîcheur | Calendrier de place distinct des profils individuels, borné 2026–2027 | 19 XPAR activés pour les fermetures connues ; modes continu/fixing non qualifiés, intraday et ALXP à `unknown` ; aucune promesse de temps réel |
| Monitoring | Cycles manquants, échecs partiels et contrôle des derniers créneaux | Clôture du 20 novembre à 20 h 09 Paris observée réussie ; heartbeat externe et alertes indépendantes/par instrument non livrés |
| Performance globale | Référence de marché Bourse Direct au 20 novembre, flux externes datés, gain EUR et Modified Dietz | Lecture confirmée par le propriétaire dans ChatGPT ; rendement de période estimatif, non annualisé, réserves de source/fraîcheur et indisponibilités explicites ; aucune histoire antérieure reconstruite |

**Livraison `v1.1.0` publiée :** le propriétaire a validé le périmètre financier, le rendement estimatif et le calendrier partiel avec les limites explicites de la [release officielle](https://github.com/damienSavoldelli/pea-tracker/releases/tag/v1.1.0). Le parcours réel d'écriture, les profils intraday/ALXP et le monitoring indépendant restent ouverts. Publication et lecture opérationnelle ne constituent pas une validation de ces éléments. Cette synchronisation documentaire n'autorise aucune nouvelle opération distante.

**Priorité métier :** disposer de calculs financiers fiables et traçables, sans sacrifier l’existant.

### Calendrier de marché et fraîcheur

- jours ouvrés, jours fériés, heures de marché ;
- distinguer fermeture normale et donnée réellement périmée ;
- règles de fraîcheur explicites.

### Transactions et liquidités

- achats, ventes, dividendes, frais ;
- versements, retraits et mouvements de liquidités ;
- historique des transactions, journal des mouvements, audit, snapshots/événements si utiles ;
- traçabilité, idempotence, règles de correction explicites.

### Capital investi, PRU et gains

- recalcul automatique du PRU, cohérence achats/ventes ;
- capital investi, plus-values latentes et réalisées, liquidités et valorisation ;
- **rendement de période Modified Dietz livré** depuis la référence du 20 novembre : gain économique rapporté au capital pondéré par le temps UTC écoulé des flux externes ; estimation non annualisée, sans double comptage des frais/dividendes, avec réserves et statuts indisponibles explicites ;
- règles métier explicites et tests de cas limites ;
- tous les calculs financiers de référence appartiennent au domaine métier PEA Tracker ; ChatGPT interprète les résultats et peut effectuer des simulations distinctes, explicitement indicatives, sans les substituer aux résultats du moteur ;
- performances périodiques, TWR/XIRR et analyses avancées réservés à V2.3.

**Conventions déjà retenues** : EUR uniquement ; montant brut explicite ; frais d'achat capitalisés, frais de vente déduits du produit ; dividendes au montant réellement encaissé ; chronologie stricte, contrepassations traçables, aucun solde négatif ni vente excédentaire ; fractions exactes et représentation à 18 décimales avec arrondi demi-pair. Le traitement historique des frais dans le PRU déclaré reste inconnu. Aucune performance ou transaction antérieure n'est reconstruite. Restent à étudier : règlement/livraison au-delà de la date d'opération actuelle, nouvelles devises/opérations, autres phases/calendriers et rendement global. Les [contrats financiers](tasks/2026_11/2026_11_19_financial-journal/contract.md) portent les règles détaillées.

### Monitoring

- cycles manquants, instruments non actualisés, erreurs fournisseur/ingestion ;
- alertes de fonctionnement réellement utiles, sans bruit.

### Préparation des versions suivantes

- rattachement UUID/propriétaire et nature réel/fictif déjà explicites dans le journal ; cela ne livre pas le multi-portefeuille V2 ;
- conserver l'isolation et les cotations mutualisées, sans inventer de registre multi-portefeuille en V1.1 ;
- si faisable et sans perturber la priorité PEA, livrer un **petit outil Trading Lab transversal** (ex. lecture historique limitée via API/MCP) ; il s’agit d’une possibilité conditionnelle, non d’un engagement.

## V2.0 — Fondations multi-portefeuille et multi-provider

**21 November 2026 — local V2.0-B delivered:** owner-scoped server resolution,
read-only active/archived portfolio consultation through separate REST v2 routes
and four new MCP reads. Existing V1/V1.1 routes and financial approval/write chain
preserved. Not deployed; C writes/approvals and D provider work remain unimplemented.
[Scope and local evidence](tasks/2026_11/2026_11_21_portfolio-reads/plan.md).

**21 November 2026 — local V2.0-A delivered:** owner-scoped registry and independent
immutable openings, additive migration and synthetic populated-journal preservation
checks. Not deployed; no multi-portfolio REST/MCP resolution or financial activation.
See [decisions and local evidence](tasks/2026_11/2026_11_21_portfolio-registry/plan.md).
Approved next slices: V2.0-B server resolution/authorization/reads; V2.0-C financial
writes/approvals; V2.0-D hybrid A+B providers, adaptive collection and controlled
fallback after a separate feasibility study. Those slices are not implemented here.

### Multi-portefeuille

- PEA réel, Trading Lab fictif et futurs portefeuilles possibles ;
- séparation stricte positions, liquidités, transactions, historiques et performances ;
- identification explicite réel/fictif ; contrôles d’accès côté API et MCP ;
- migration de données, compatibilité et tests de non-régression du PEA réel ;
- **mutualiser les données de marché** entre portefeuilles ; ne pas dupliquer inutilement les cours ;
- distinguer support de plusieurs portefeuilles et mise en œuvre d’un moteur de simulation fictive (prévue seulement si utile en V2.2).

### Multi-provider

- conserver yfinance comme source actuelle tant qu’aucun remplacement n’est validé ;
- étudier routeur de fournisseurs, principal par instrument/marché, fallback contrôlé ;
- couverture par instrument, quotas, coûts, licences, provenance, horodatages, fraîcheur, cohérence ;
- ne pas remplacer une donnée récente par une plus ancienne ;
- candidats **à tester, non choisis** : EODHD, Marketstack, Alpha Vantage, Twelve Data ;
- ne pas confondre faisabilité d’intégration et droit d’utiliser/redistribuer les données.

**Go/no-go** : audit ciblé du schéma actuel et de l’isolation ; test réel d’un échantillon d’actions/ETF Euronext ; quotas, conditions contractuelles et coût acceptables.

## V2.1 — Données de marché avancées (livraisons intermédiaires)

### V2.1a — Historique OHLCV

- Open / High / Low / Close / Volume ; granularité et profondeur historiques à déterminer ;
- API REST et outils MCP de consultation ;
- provenance, ajustements, fraîcheur, calendrier, cache et stratégie de rétention ;
- évaluer stockage D1, volumes, limites Workers, collecteur Python, GitHub Actions et fournisseurs ;
- collecte limitée aux instruments utiles et appels regroupés si approprié.

### V2.1b — Watchlists et indicateurs

- watchlists de valeurs non détenues, séparables par usage/portefeuille ; suivi avant achat ; comparaison avec les positions ;
- moyennes mobiles MM20/MM50/MM200, RSI, MACD, ATR, volatilité ;
- si données suffisantes : volumes, force relative, supports/résistances, cassures ;
- calculs déterministes dans PEA Tracker, interprétation dans ChatGPT ;
- endpoints REST/MCP, tests de cohérence et gestion des historiques incomplets.

**Go/no-go** : historique réellement disponible, droits d’usage, coût de collecte/stockage, précision des indicateurs et délais de réponse acceptables.

## V2.2 — Trading Lab et suivi des décisions

- journal de trading : hypothèse, date, entrée prévue, exécution, quantité, frais, stop, objectifs, modifications, sortie, résultat, enseignements ;
- préserver la décision initiale et l’historique des modifications (traçabilité, pas de réécriture rétrospective) ;
- **évaluer d’abord TradingView Paper Trading** comme registre officiel des transactions fictives ; ne pas dupliquer ce qui fonctionne déjà ;
- portefeuille fictif interne **optionnel**, si le besoin est démontré : capital de départ paramétrable (exemple synthétique : 1 000 €), liquidités, positions, ordres simulés, P&L réalisé/latent, exposition et drawdown ;
- séparation complète entre simulation et PEA réel ; aucune opération fictive ne doit affecter le portefeuille réel ;
- alertes conditionnelles : seuils, cassures, proximité d’un stop, invalidation de scénario, anomalie de données ; déduplication et notifications ciblées.

**Go/no-go** : vérifier les capacités et limites de TradingView, l’accès éventuel aux données, la nécessité d’une simulation interne et la faisabilité du canal d’alerte.

## V2.3 — Analyses avancées et interface

**Statut : prévu, faisabilité à étudier.** L'allocation du portefeuille appartient à cette version. Les notions de capital investi et de gains V1.1 ne constituent pas à elles seules une performance historique.

### Performance historique

- valeur du portefeuille dans le temps : quotidien, mensuel, annuel ;
- performances périodiques, performance brute/nette, frais cumulés ;
- TWR, XIRR si pertinent, avec règles de calcul et flux de trésorerie fiables ;
- benchmarks : CAC 40 dividendes réinvestis, MSCI World et éventuellement Nasdaq-100, en vérifiant sources, conventions et comparabilité.

### Risque et allocation

- drawdown maximal, volatilité, concentration, corrélations ;
- allocation actions/ETF, secteurs, pays, zones, thèmes ;
- pour Trading Lab : taux de réussite, gain/perte moyens, profit factor, espérance de gain, exposition moyenne ;
- comparaison entre portefeuilles sans mélanger données réelles et fictives.

### Explication intelligente

Questions cibles :

- Pourquoi mon PEA baisse aujourd’hui ?
- Quelles positions expliquent la variation ?
- Quelle ligne pèse le plus ? Où suis-je trop concentré ?
- Qu’est-ce qui a changé depuis la semaine dernière ?
- Mon scénario Trading Lab est-il toujours cohérent avec les données vérifiées ?

### Interface web/mobile

- dashboard, graphiques de cours/volumes/indicateurs, historique, allocation ;
- sélection explicite du portefeuille et visibilité réel/fictif ;
- interaction avec ChatGPT et outils MCP ;
- interface utile, sans la rendre obligatoire pour utiliser l’API.

### Approval notification and automatic ChatGPT continuation — V2.3 or V3

Owner decision, 24 November 2026: defer this improvement to V2.3, with V3 as a
possible fallback; it is outside V2.0. The current V1.1.4 manual return remains valid.
The desired journey is independent browser approval followed by notification to
ChatGPT, explicit MCP confirmation and result verification without a second manual
message. Notification must never replace server-side approval or authorize a write.

MCP Events is a feasibility candidate, not an implemented or qualified integration.
Before scheduling delivery, verify support in the owner's actual ChatGPT surface,
subscription/callback lifecycle, authorization, deduplication and compatibility with
the proposal's five-minute expiry. Late delivery must not extend approval or blindly
repeat a write. Keep a manual fallback and preserve the separate browser audience.
See [OpenAI MCP Events documentation](https://developers.openai.com/plugins/build/mcp-events).

## Axe transversal — Architecture logicielle et ingénierie IA

**À examiner à chaque jalon, sans constituer une liste obligatoire de développements.** Proposer proactivement des technologies et approches pertinentes, même non mentionnées par l’utilisateur.

- **MCP avancé** : outils plus riches, contrats, sorties structurées, permissions, orchestration et compatibilité des clients.
- **Workflows IA** : orchestration déterministe d’abord ; LangGraph/LangChain, agents ou workflows avec état seulement si leur intérêt est démontré.
- **RAG documentaire** : rapports d’entreprises, publications, notes et recherches ; étudier embeddings, recherche hybride, reranking, citations et fraîcheur **si un corpus utile existe**. Ne pas employer le RAG pour remplacer les API de cotations ou les calculs métier.
- **Fiabilité IA** : jeux d’évaluation (evals), vérification des sources, tests de tool calling, sorties structurées, garde-fous, validation humaine pour actions sensibles.
- **Observabilité** : étudier métriques et traces sur les chemins réels : ChatGPT → MCP → services métier → ports/repositories ; REST → mêmes services ; collecteur Python → fournisseur, puis livraison HTTPS à l'ingestion → services → repositories. Aucun appel HTTP interne MCP → REST, ni appel fournisseur déclenché par une lecture de valorisation. OpenTelemetry reste une piste conditionnelle.
- **Cloud et data engineering** : pipelines, cache, files d’attente/workflows si utiles, résilience, contrôle qualité des séries temporelles.
- **Sécurité et industrialisation** : OAuth/OIDC, isolation et droits minimaux, tests contractuels, CI/CD, Infrastructure as Code si justifiée.
- **Innovation ouverte** : considérer aussi d’autres technologies futures pertinentes ; comparer avec une solution simple avant toute adoption.

Pour chaque piste : **besoin → faisabilité → PoC ciblé si nécessaire → décision → implémentation éventuelle → RETEX**. Distinguer veille, expérimentation isolée et production. Ne pas ajouter DDD/CQRS/Event Sourcing, multi-agent ou framework uniquement pour valoriser le CV.

## Principes de livraison et arbitrage

1. **PEA réel prioritaire en permanence** : aucune régression acceptable sur les données ou la sécurité.
2. **Trading Lab utile sans attendre des années** : petits incréments transversaux lorsque faisables ; pas de dépendance artificielle à la livraison complète de V2.3.
3. **Faisabilité avant planification** : vérification concrète des outils, limites et coûts ; preuves et hypothèses séparées.
4. **Architecture hexagonale conservée** : extension par ports/adaptateurs, sans usine à gaz.
5. **API-first et MCP** : nouvelles capacités métier exposées proprement, sans confier au LLM des calculs financiers officiels non implémentés.
6. **Versionnement** : V2 désigne ici une évolution fonctionnelle majeure ; une rupture de compatibilité d’API doit être évaluée et annoncée séparément.
7. **Coûts et quotas maîtrisés** : dimensionner stockage, fréquence, fournisseurs et observabilité selon l’usage réel.
8. **Tests et traçabilité** : livrer par jalons validables, avec possibilité de retour arrière pour migrations risquées.

Les contrôles d'accès API/MCP futurs conservent le MCP strictement en lecture et l'administration distincte. Aucune simulation ne passe un ordre chez un courtier.

## Exigences conservées sans version artificielle

Exports, suppression, rétention, sauvegarde et restauration conservent les exigences du [PRD financier](tasks/2026_11/2026_11_08-financial-backend-prd.md) et d'[INSTALL.md](INSTALL.md). Leur état de preuve, les procédures, la destination indépendante, le coût et l'articulation suppression/restauration restent à documenter ou vérifier selon les éléments disponibles. Aucun achèvement n'est déduit de la V1 fonctionnelle ; aucune version de livraison n'est attribuée ici.

Les mémoires AIDD, le PRD et certains résumés historiques peuvent encore décrire un état local synthétique antérieur. Leur synchronisation relève d'un lot ultérieur ; cette roadmap ne clôt aucune règle comptable ni gate de sécurité par simple changement documentaire.

## Livrables professionnels et vision large

PEA Tracker sert de laboratoire concret pour API-first, MCP, OAuth, sécurité, cloud, automatisation, données, ingénierie IA et développement assisté par Codex.

Livrables prévus : RETEX technique complet, guide de bonnes pratiques API-first/MCP/IA, article technique public, publication LinkedIn. Montrer des décisions d’architecture justifiées et des résultats, sans se présenter prématurément comme expert. Capitaliser sur les enseignements pour de futurs projets, notamment Landing Factory.
