# Coût restant et PRU — règles locales du 20 novembre 2026

État de la phase 3, avant frais explicites. La [phase frais suivante](fees.md) remplace l'exclusion des frais par la capitalisation des frais d'achat et la déduction des frais de vente déclarés. Le traitement historique des frais dans le PRU initial reste inconnu ; aucun PRU global hors frais/frais inclus n'est garanti.

Source : mission utilisateur « Coût restant et PRU calculé ». Développement local uniquement, sans activation, migration, données de production ni publication.

## Base et mouvements

- Coût initial = quantité déclarée × PRU déclaré, sans arrondi, avec provenance. Base déclarée, pas reconstruction du coût historique payé. Les éventuels frais déjà incorporés au PRU du courtier ne sont ni reconstitués ni retranchés.
- Achat : ajout de la quantité et du montant déclaré au coût restant.
- Vente : coût libéré = coût avant vente × quantité vendue / quantité avant vente. Le produit de vente n'entre jamais dans le PRU restant.
- Vente totale : quantité et coût restant nuls ; pas de division par zéro. Les lectures omettent les lignes soldées ; un rachat repart de son montant déclaré.
- Versements/retraits : aucun effet sur le coût des titres. Frais et dividendes non modélisés ; sorties explicitement hors frais. Aucun gain ni performance calculé.

## Précision et arrondi

Entrées inchangées : 30 chiffres significatifs, quantités/PRU initial à 12 décimales, opérations à 2. Le produit initial peut avoir 24 décimales. Aucun montant n'utilise Number.

Le domaine conserve des fractions réduites de BigInt : précision exacte pour les décimaux d'entrée et les quotients périodiques, sans arrondi intermédiaire. Une précision décimale finie ne peut représenter exactement tous les PRU.

Une valeur disponible contient `status=available`, `exact.numerator`/`exact.denominator` (chaînes d'entiers, fraction EUR), `value` (chaîne arrondie au plus à 18 décimales, demi-pair), `rounded` (représentation différente de l'exact). `value` n'est jamais réinjecté dans le calcul. Une fraction positive très petite peut s'afficher `0` avec `rounded=true` et un numérateur non nul. La valorisation V1 reste inchangée, y compris son affichage à deux décimales. Politique explicite `cost_basis_policy.version=1` dans les deux lectures.

## Contrepassation et indisponibilité

Le replay suit l'ordre chronologique du journal capturé. Chaque événement produit un delta de coût ; une contrepassation ultérieure inverse ce delta original, pas le coût au PRU du jour de correction. Rien n'est réécrit ni ajouté aux événements persistés.

Des opérations intermédiaires peuvent rendre cette inversion incompatible : coût négatif, ou restauration d'un coût inconnu. La ligne reçoit `reversal_cost_conflict`, sans coût/PRU inventé. Positions, liquidités et montants de valorisation restent disponibles ; les règles de solvabilité du journal ne changent pas. Une clôture complète remet le coût restant à zéro ; un achat ultérieur peut repartir d'une base connue. Aucune annulation rétroactive ni réconciliation automatique des ventes passées n'est supposée.

PRU initial manquant/invalide : `opening_cost_unavailable`, jamais zéro implicite. Un zéro déclaré est une base connue. Les achats/ventes partiels ne réparent pas une base inconnue. Le contrat V1 impose déjà un PRU : ce cas défensif est testé au domaine sans relâcher ce contrat pour accepter des ouvertures incomplètes.

## Intégration et portée

`src/domain/cost-basis.ts` fournit `projectCostBasis`. `PortfolioService.current` transmet l'ouverture épinglée et les événements de la même lecture que les soldes. Identité du portefeuille, ancre, séquences, dates et quantités finales sont contrôlées ; incohérence : `cost_projection_mismatch`. Propriétaire et séparation réel/fictif restent contrôlés par `TransactionService`, avec tests sur stockage partagé.

Chaque position courante expose `remaining_cost`, `pru`, `cost_provenance` (provenance initiale ou null pour une nouvelle ligne, version du journal). Les événements du journal fournissent dates, auteurs et provenance des opérations. Le statut global est `computed`, `partial` ou `unavailable`. Le marqueur `not_computed` des anciens soldes/résultats immuables du journal n'est pas réécrit : les coûts sont calculés à la lecture.

`ValuationService.current` transporte ces champs sans modifier quantités, liquidités, cours ou sommes. Les deux routes REST/outils MCP V1.1 existants bénéficient du calcul ; les réponses historiques V1 sont inchangées. La performance reste indisponible (`performance_not_computed`).

## Limites et suite

Preuves : [phase 3](phase-3.md). Bornes conservées : 1 000 événements/100 positions. Les fractions peuvent croître ; budget CPU et volume des réponses en Worker hébergé non certifiés par les tests locaux. Aucun déploiement ni donnée réelle utilisés.

Suite proposée : préciser puis intégrer les frais d'achat/vente et leurs effets sur cash/coût ; déclarer les dividendes et leur crédit de liquidités ; ensuite gains réalisés/latents, puis performances avec conventions approuvées. Le seul PRU ne reconstitue pas une performance historique complète.
