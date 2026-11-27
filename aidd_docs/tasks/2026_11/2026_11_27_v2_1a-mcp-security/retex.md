# RETEX vivant — première orchestration manuelle V2.1

## Faits acquis au cadrage

- Deux sessions maximum, lancées manuellement par le propriétaire ; aucun Orchestrator ni sous-agent.
- Un même commit A, deux worktrees et branches indépendants ; chaque lot possède ses tests et son sous-dossier documentaire.
- Les fichiers communs restent au pilote pour éviter les conflits documentaires artificiels.
- Autorisation locale de commit donnée au lancement ; push/merge gardés au pilote. Un agent ne demande pas plusieurs fois la même autorisation.
- Le commit de départ et le SHA final sont des preuves ; le second se restitue après commit, évitant l'autoréférence.
- Coût/rétention/capacité des logs et choix GitHub natifs doivent précéder le code/outillage ; les inconnues restent inconnues.

## Mesures à consolider après B/D

Résultats en attente : temps actif seulement si mesuré, temps calendaire séparé, tests nouveaux et régressions justifiées, fichiers réellement touchés, conflits réels, blocages d'environnement, décisions du pilote et écart entre plan et exécution. Ne pas inventer des gains de parallélisme ni annoncer l'expérimentation réussie avant restitution.

## Capitalisation ultérieure E

Après les restitutions, comparer les périmètres attendus/réels, les conflits, la qualité du compte rendu, les contrôles de confidentialité et les limites externes. Décider sur ces preuves si deux sessions restent utiles. Pas d'extension automatique vers une orchestration autonome.
