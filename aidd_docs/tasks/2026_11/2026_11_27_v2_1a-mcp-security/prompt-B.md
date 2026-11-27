# Mission V2.1B — frontières et preuves

- Worktree exact : /Users/damiensavodelli/Documents/www-dev/pea-tracker-v2.1b
- Branche : feat/v2.1b-mcp-boundaries
- Lire phase-1.md.

Le cadrage A et les orientations sont approuvés par le propriétaire le 27 novembre 2026. Le SHA initial commun est inscrit dans l'enveloppe définitive de lancement du pilote ; vérifier HEAD contre ce SHA avant toute modification. Les prompts de lancement sont générés après le commit A pour éviter une autoréférence de SHA dans son propre contenu.

Lire AGENTS.md, la politique VCS, le skill git-commit et les documents references.md, security.md, owasp-matrix.md, missions.md, ownership.json et report-template.md de ce dossier. Ne pas relancer l'audit A ni les validations acquises.

Autorisation de mission : réaliser le périmètre décrit, les nouveaux tests ciblés nécessaires, la documentation du lot, puis un commit local Conventional Commits après contrôle de confidentialité et satisfaction des critères. Aucune validation intermédiaire requise dans ce cadre. Pas d'amend, push, merge, rebase, tag ou release : le pilote reprend ensuite les SHA.

Interdits : autres worktrees/branches, main, changement de production ou de paramètres distants, Access/OAuth, toute écriture D1, même locale (employer des données synthétiques en mémoire), transaction financière de test sur le réel, fournisseur financier, nouvelle infrastructure/souscription, Orchestrator et sous-agent. L'installation de dépendances reste soumise à une autorisation explicite ; utiliser les outils déjà disponibles sans modifier une installation partagée. Un manque d'outillage, un risque critique ou une sortie de périmètre justifie seul un arrêt ciblé.

Les tests déterministes vérifient des protections serveur ; ils ne prouvent pas le comportement d'un LLM. Un test/evaluation LLM réel nécessiterait un protocole et une autorisation distincts. Ne pas chercher dix risques sur dix couverts ; garder non vérifiés les contrôles dépendant de services externes. Inventaire local des compositions et inventaire des déploiements distants sont deux preuves différentes.

Restituer le format report-template.md, avec branche, worktree, SHA initial/final, fichiers, commandes de tests et résultats, limites, dépendances, conflits, temps actif seulement s'il est réellement mesuré. Après le commit, donner son SHA final dans le message de restitution ; ne pas tenter d'inscrire le hash d'un commit dans son propre contenu.

## Responsabilité exclusive

Modifications permises seulement :
- tests/mcp-security-boundaries.test.ts, tests/helpers/mcp-security-boundaries.ts si un contrôle nouveau est justifié ;
- sous-dossier B/ de cette mission, comprenant evidence.md et report.md.

Tous les fichiers applicatifs, workflows, lockfiles, matrice, README, roadmap et mémoire communs restent en lecture seule. D possède les wrappers MCP. Ne pas créer de branches/worktrees : ils sont préparés par le pilote.

## Travail et acceptation

1. Pour MCP01/MCP02/MCP07, vérifier les preuves existantes d'identité, audience, propriétaire, permissions et approbation indépendante. Pas de nouvelle couche d'auth ni changement de scopes.
2. Le SDK 1.32.2 borne déjà le corps à 4 Mio et les batches à 100 ; les deux refus 413 sont acquis. Ne pas développer un second parseur ou refaire ce probe sans changement pertinent.
3. Ajouter uniquement des tests nouveaux justifiés de non-divulgation/non-autorisation. Tout token de test est synthétique ; aucun credential réel lu ou affiché. Les preuves opérationnelles de rotation/révocation restent non vérifiées sans contrôle autorisé.
4. Lectures locales et documents officiels uniquement dans B ; ne pas consommer les quotas logs/API du compte. Les coûts/rétention/capacités Cloudflare et services GitHub sont qualifiés par D, pas dupliqués ici.
5. Livrer B/evidence.md et B/report.md ; une conclusion sans changement applicatif est recevable. Les tests ajoutés doivent réussir ; si aucun n'est nécessaire, le dire sans rejouer les anciens.
6. Vérifier diff, fichiers propriétaires et confidentialité ; committer localement avec le skill git-commit. Restituer SHA et état du worktree, sans push.

Commencer chaque réponse par le worktree et la branche effectivement vérifiés.
