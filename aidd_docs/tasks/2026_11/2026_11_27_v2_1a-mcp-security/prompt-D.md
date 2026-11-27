# Mission V2.1D — télémétrie, CI et inventaire

- Worktree exact : /Users/damiensavodelli/Documents/www-dev/pea-tracker-v2.1d
- Branche : feat/v2.1d-mcp-observability
- Lire phase-2.md et le contrat minimal D de missions.md.

Le cadrage A et les orientations sont approuvés par le propriétaire le 27 novembre 2026. Le SHA initial commun est inscrit dans l'enveloppe définitive de lancement du pilote ; vérifier HEAD contre ce SHA avant toute modification. Les prompts de lancement sont générés après le commit A pour éviter une autoréférence de SHA dans son propre contenu.

Lire AGENTS.md, la politique VCS, le skill git-commit et les documents references.md, security.md, owasp-matrix.md, missions.md, ownership.json et report-template.md de ce dossier. Ne pas relancer l'audit A ni les validations acquises.

Autorisation de mission : réaliser le périmètre décrit, les nouveaux tests ciblés nécessaires, la documentation du lot, puis un commit local Conventional Commits après contrôle de confidentialité et satisfaction des critères. Aucune validation intermédiaire requise dans ce cadre. Pas d'amend, push, merge, rebase, tag ou release : le pilote reprend ensuite les SHA.

Interdits : autres worktrees/branches, main, changement de production ou de paramètres distants, Access/OAuth, toute écriture D1, même locale (employer des données synthétiques en mémoire), transaction financière de test sur le réel, fournisseur financier, nouvelle infrastructure/souscription, Orchestrator et sous-agent. L'installation de dépendances reste soumise à une autorisation explicite ; utiliser les outils déjà disponibles sans modifier une installation partagée. Un manque d'outillage, un risque critique ou une sortie de périmètre justifie seul un arrêt ciblé.

Les tests déterministes vérifient des protections serveur ; ils ne prouvent pas le comportement d'un LLM. Un test/evaluation LLM réel nécessiterait un protocole et une autorisation distincts. Ne pas chercher dix risques sur dix couverts ; garder non vérifiés les contrôles dépendant de services externes. Inventaire local des compositions et inventaire des déploiements distants sont deux preuves différentes.

Restituer le format report-template.md, avec branche, worktree, SHA initial/final, fichiers, commandes de tests et résultats, limites, dépendances, conflits, temps actif seulement s'il est réellement mesuré. Après le commit, donner son SHA final dans le message de restitution ; ne pas tenter d'inscrire le hash d'un commit dans son propre contenu.

## Responsabilité exclusive

Fichiers applicatifs permis : src/adapters/mcp/handler.ts, financial-tools.ts, portfolio-reads.ts et portfolio-financial.ts (ces trois derniers dans le même dossier), nouveau src/adapters/mcp/security-events.ts.
Tests permis : tests/mcp-security-events.test.ts, tests/mcp-security-ci.test.ts et tests/helpers/mcp-security-events.ts.
Workflow permis : .github/workflows/mcp-security-validation.yml.
Documents permis : sous-dossier D/ de cette mission, comprenant evidence.md, logging-budget.md, native-security-options.md, inventory.md et report.md.

Ne pas éditer les tests B, auth, calculs, migrations, collector live, scheduler, bindings, lockfiles, dépendances, README, roadmap, mémoire, matrice ou prompts communs. Aucun nouveau scanner/configuration de service sans décision justifiée. C attend D : pas de travail concurrent sur ses contrats.

## Travail et acceptation

1. AVANT l'implémentation télémétrie, qualifier à partir des documents officiels et de la configuration existante : forfait applicable, disponibilité des logs/traces/live-tail, quota d'événements/volume, coût, rétention, capacités de recherche/export, filtrage/échantillonnage existants et risque de données privées. Distinguer offre documentée, configuration connue et mesure réelle. Estimer la consommation des événements proposés et le plafond retenu.
2. Métadonnées Cloudflare/GitHub en lecture seule, uniquement via moyens officiels et permissions existantes, sont permises pour ce cadrage opérationnel ; ni nouveau droit, ni lecture de credentials Wrangler, ni export financier. Si l'offre exacte ou une capacité n'est pas vérifiable, marquer non vérifié ; ne pas présenter l'estimation comme une mesure. Poursuivre CI/inventaire si la télémétrie reste bloquée ; aucun coût/activation implicite pour lever le blocage.
3. AVANT tout nouvel outil DevSecOps, comparer les solutions natives GitHub : dependency graph, Dependabot alerts/updates, revue de dépendances, secret scanning/push protection et leurs conditions réelles d'accès/coût ; examiner les audits disponibles via les gestionnaires déjà installés. Distinguer capacité commerciale et réglage effectif du dépôt. Aucune activation distante, installation ou audit réseau exhaustif non nécessaire ; aucun upgrade de masse. Conserver la preuve de décision dans native-security-options.md.
4. Implémenter F1 de façon minimale seulement si le budget et la confidentialité sont justifiés : événement allowlisté par callback, outil connu, résultat/code bornés, corrélation serveur, durée. Aucun argument/résultat, token, cookie, sujet, identifiant financier, stacktrace ou texte client. Vérifier les API du SDK ; aucun second parsing non borné. Logger défaillant = même décision et même réponse métier.
5. Préparer F2 : workflow synthétique V2.1, SHA d'Actions et permissions minimales, sans secrets prod ni fournisseurs. Ne pas modifier la collecte live ni lancer un workflow distant. L'installation future des jobs CI se distingue d'une installation locale autorisée.
6. Inventorier les compositions suivies et leurs frontières dans inventory.md. Les déploiements réellement exposés restent non vérifiés sans preuve officielle en lecture seule ; aucun scan actif ni changement distant.
7. Exécuter uniquement les tests nouveaux de redaction, succès/refus/erreur et logger cassé, plus les régressions réellement affectées et justifiées. Ne pas prétendre qu'ils prouvent l'immunité d'un LLM ni une couverture OWASP complète.
8. Livrer les documents D, le compte rendu standard et le diff ; après critères satisfaits, committer localement avec git-commit, sans push. Si un prérequis est bloqué, livrer le travail indépendant validé et marquer la partie non développée/testée sans forcer son statut.

Commencer chaque réponse par le worktree et la branche effectivement vérifiés.
