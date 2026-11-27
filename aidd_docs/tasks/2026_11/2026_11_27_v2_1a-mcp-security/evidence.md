# Preuves et limites V2.1A

## Référence et worktree

- V2.0.0 livrée : `c7cf0c53a1088431d0a5b43da29b3480f5f21806`.
- Lecture fraîche de main distant et du tag annoté résolu : mêmes SHA ; release publique non draft du 25 novembre 2026.
- Point de départ local propre sur main ; seul worktree enregistré au début : pea-tracker. Aucun worktree historique supposé encore présent.
- Nouveau worktree sibling : `pea-tracker-v2.1`, branche `integration/v2.1`, créée depuis ce SHA ; pas de commit/push/merge.
- Le Git système affiche une demande d'acceptation de licence Xcode. Le binaire déjà installé des Command Line Tools fonctionne ; aucune licence acceptée ni configuration système modifiée.
- Aucune dépendance copiée/installée dans le nouveau worktree ; le probe SDK utilise l'installation déjà présente du checkout V2.0 pour des données synthétiques.

## Réutilisation

Linux 118 TypeScript + 91 Python, run 45636475608, application 630f4aa ; puis acceptation de production V2.0 et migrations 0008/0009 préservant les données. Pas de replay de ces suites ni de nouvelle affirmation de succès de collecte depuis la livraison.

Les tests cités dans la matrice sont des preuves de code et résultats historiques, pas des exécutions de ce cadrage. Les contrôles client REST/ChatGPT restent attribués au propriétaire.

## Contrôles nouveaux

Référence OWASP figée par commit et blob ; observation du SDK 1.32.2 / protocoles supportés ; lecture des wrappers de taille ; probe synthétique déclaré/stream, limite 4 194 304 octets : HTTP 413 dans les deux cas, zéro réseau et aucune donnée financière.

Validateur officiel du plan AIDD : **VALID**, après correction de quatre marqueurs création/modification de fichiers futurs. Les contrôles de liens locaux, des motifs de secret/chemin privé et du diff final ont été effectués ; aucun code applicatif ni index Git modifié. L'interdiction de sous-agents prévaut sur la revue indépendante suggérée par le skill de planification : aucune revue indépendante lancée, auto-relecture seulement.

## Arrêt

A s'arrête au cadrage. Les futurs lots ne démarrent pas sur des documents non committés. Prochaine décision : approbation du plan, puis autorisation de commit du cadrage et des missions choisies. Aucune autorisation de livraison V2.0 n'est réutilisée pour V2.1.

## Autorisation de préparation des missions — 27 novembre 2026

Le propriétaire valide A, B parallèle à D puis C/E, autorise le commit/push documentaire du pilote et la création des deux worktrees au même SHA A. Chaque agent B/D peut terminer ses tests nouveaux nécessaires, documenter et committer localement sans confirmation intermédiaire ; push et merges restent au pilote. Aucun agent lancé.

Le contrôle de confidentialité et le validateur documentaire sont exécutés pour ce commit uniquement ; aucun nouvel audit A ni test applicatif acquis. Les quotas/coûts/rétention logs et les options natives GitHub sont des prérequis de D, pas des résultats acquis de cette préparation. Les prompts définitifs recevront le SHA A après commit ; les gabarits suivis ne peuvent contenir le hash de leur propre commit.
