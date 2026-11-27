# Compte rendu standard — lot B, C ou D

Ne remplir que des faits prouvés ; « non mesuré » ou « non vérifié » vaut mieux qu'une estimation présentée comme résultat.

## Identité

- Mission / statut : terminé, partiel ou bloqué.
- Branche et chemin exact du worktree.
- SHA initial commun.
- SHA final : communiqué dans la restitution après commit ; dans ce fichier, renvoyer au commit contenant le rapport pour éviter une autoréférence.
- Temps actif : méthode et durée réellement mesurée, ou non mesuré. Le temps calendaire ne prouve pas le temps actif.

## Périmètre et résultat

- Objectif, critères satisfaits/non satisfaits.
- Fichiers créés/modifiés, avec leur finalité.
- Développé / testé localement / vérifié sur service externe / non vérifié : statuts séparés.
- Tests déterministes serveur distincts de toute éventuelle évaluation comportementale LLM.
- Pour D : sources/datation, forfait/configuration connus, estimation de budget logs, limites rétention/coût et options natives GitHub.
- Inventaire local distinct des déploiements distants.

## Vérifications

| Commande exacte | Pourquoi nécessaire | Résultat / nombre de cas | Limites |
| --- | --- | --- | --- |
| À remplir uniquement après exécution | Nouveau contrôle ou régression affectée | Passé, échoué ou non exécuté | Aucun secret ou donnée financière |

Lister les preuves acquises réutilisées sans les rejouer. Ne pas ajouter des captures réelles ou logs bruts au rapport.

## Intégration pilote

- Dépendances et fichiers susceptibles de conflit.
- Surfaces explicitement inchangées.
- Limites externes et risques résiduels ; aucun objectif artificiel 10/10.
- Recommandation : intégrable, corrections requises ou bloqué.
- Commit(s) local(aux), état du worktree ; aucun push/merge fait par l'agent.
