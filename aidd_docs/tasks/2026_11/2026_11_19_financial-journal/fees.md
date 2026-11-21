# Frais déclarés — convention validée le 20 novembre 2026

État de la phase frais. La [phase dividendes suivante](dividends.md) ajoute les seuls encaissements reçus et leurs corrections, sans modifier ces conventions de frais ni la méthode du PRU.

Source : validation explicite de l'utilisateur, option « frais d'achat capitalisés et montant brut explicite ». Développement/test local uniquement, sans publication ni données financières réelles.

## Convention

- `amount` est le montant brut hors frais pour une déclaration avec frais. `fees` est un montant EUR réel explicite, facultatif, non négatif ; aucun calcul de barème courtier.
- Achat : débit `amount + fees`, ajout de la quantité et de ce même montant au coût restant. PRU recalculé sur cette base exacte.
- Vente : crédit `amount - fees`. Produit net positif ou nul ; frais supérieurs au brut refusés (`negative_sale_proceeds`, 409). Le coût libéré reste celui au PRU avant vente ; les frais et le prix de vente ne changent pas le PRU restant. Vente totale : coût restant nul, ligne omise.
- Achat devenu non finançable à cause des frais : refus `insufficient_cash`, sans écriture. Les validations de quantité, chronologie et portefeuille restent identiques.
- Montants et frais : chaînes décimales EUR, au plus deux décimales et 30 chiffres significatifs ; aucun arrondi d'entrée. Calculs cash en unités BigInt, coûts en fractions exactes. Présentation du PRU/coût : 18 décimales, demi-pair uniquement à l'affichage, inchangée.

## Compatibilité historique et provenance

Une ancienne opération sans `fees` conserve exactement son montant, son delta de trésorerie, son coût et son résultat d'idempotence. Aucun champ par défaut n'est inséré dans les entrées persistées/canoniques. L'absence de frais signifie « non déclarés, aucun ajustement », pas « preuve de frais historiquement nuls ». Aucun ancien montant n'est requalifié ou décomposé automatiquement.

`fees="0"` est une déclaration explicite distincte d'un champ absent. Les écritures numériques équivalentes sont normalisées ; changer des frais, ou passer d'absents à explicitement nuls avec la même clé, produit un conflit d'idempotence. Les frais restent dans l'entrée immuable avec sa date/provenance ; un autre portefeuille conserve son propre journal et ses clés.

Le coût initial demeure quantité × PRU déclaré, avec sa provenance. Traitement historique des frais Bourse Direct **inconnu** : ni retrait ni ajout supposé. Aucune lecture n'annonce un PRU global « hors frais » ou « frais inclus ». `cost_basis_policy.version=2` précise `opening_fees=unknown`, la capitalisation/déduction des seuls frais déclarés, `omitted_fees=not_declared_no_adjustment` et la base brute. Par position, `cost_provenance.opening_fees` est `unknown` ou `not_applicable` si elle n'appartient pas à l'ouverture.

## Contrepassation

Une contrepassation inverse le delta de trésorerie original, frais compris, et la quantité originale. Le moteur de coût inverse le delta de coût original : achat = brut + frais ; vente = coût libéré, indépendamment des frais de vente. L'événement d'origine est conservé. Aucun frais de remplacement n'est accepté sur une contrepassation : remplacement par nouvelle déclaration ultérieure.

Il s'agit d'une correction comptable, pas d'une demande de remboursement au courtier. Contraintes de solvabilité et limites de réconciliation après opérations intermédiaires inchangées : un coût incompatible reste signalé indisponible, sans réécrire les événements.

## Portée technique

- `src/domain/transactions.ts` : frais facultatifs sur achats/ventes, validation et cash exact.
- `src/domain/cost-basis.ts` : capitalisation à l'achat, politique/provenance explicites. Aucun effet des frais de vente sur le coût restant.
- Contrat OpenAPI V1.1 local et descriptions des deux outils MCP courants enrichis. Anciennes réponses REST/MCP V1 inchangées.
- Stockage JSON existant réutilisé : aucune migration supplémentaire ni modification des adaptateurs ou du schéma D1. Tests natifs locaux de lecture, replay, persistance et isolation ; aucune opération distante.
- Les frais modifient les liquidités projetées, donc la valorisation totale courante conformément aux mouvements ; le calcul des valeurs de marché des titres et la valorisation historique V1 ne changent pas.

Preuves : [phase 4](phase-4.md). Limites : frais non décomposés historiquement, pas de tarification automatique, dividendes et performances non implémentés. Prochain incrément : dividendes explicites, date/provenance, crédit de trésorerie et corrections/idempotence, sans modifier le PRU des titres.
