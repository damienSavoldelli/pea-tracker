# Dividendes reçus — incrément local

État de la phase dividendes ; les [gains réalisés/latents](gains.md) sont ajoutés dans la phase suivante. Les dividendes restent séparés des gains de cession et ne modifient toujours ni quantité ni coût/PRU.

Source : mission utilisateur « Gestion des dividendes », à la suite des frais. Aucun chargement réel, commit, déploiement ou D1 distant autorisé.

## Règles retenues

- Entrée `type=dividend`, portefeuille explicitement lié par la composition existante. `amount` = montant EUR **effectivement reçu**, strictement positif, chaîne exacte à deux décimales maximum et 30 chiffres significatifs. Aucun montant brut, taux unitaire, retenue, fiscalité, droit à dividende ou conversion de change inféré.
- Date d'opération dans `effective_at`, provenance obligatoire ; référence externe réutilisée dans `provenance.reference` (null si absente). Aucun champ supplémentaire/défaut ne modifie la forme canonique des anciennes commandes.
- `instrument_id` facultatif : omis lorsque inconnu ; s'il est fourni, instrument existant au catalogue. Il peut ne plus être détenu. Son association est descriptive : sa devise de cotation ne modifie pas le cash EUR déclaré, et aucun change n'est calculé.
- Crédit espèces de `amount`. Aucun delta de quantité ; ni création d'une position pour un instrument non détenu, ni modification du coût restant/PRU. L'instrument associé reste visible dans l'événement et dans sa contrepassation.
- Ordre chronologique, version attendue, propriétaire, séparation réel/fictif et clé d'idempotence inchangés. Même clé/commande normalisée : résultat original ; montant, instrument ou référence modifiés avec la même clé : conflit. La référence externe est une trace, pas une nouvelle contrainte d'unicité : utiliser une clé d'idempotence stable pour les reprises.
- Correction par contrepassation ultérieure avec raison : débit opposé du cash reçu, aucun effet sur les titres/coût/PRU ; original conservé, double contrepassation refusée. Si les espèces ont été dépensées et ne sont plus disponibles, correction refusée sans écriture, conformément aux règles existantes.

## Lectures et compatibilité

Le journal REST existant distingue `input.type=dividend`, son montant, sa date, son instrument éventuel et sa provenance. Aucun nouveau droit ni outil MCP administratif.

Les deux lectures courantes REST/MCP V1.1 ajoutent `dividends` :

- `scope=recorded_since_opening`, `amount_basis=cash_received`, devise EUR ;
- `received` : somme des crédits de dividendes enregistrés, y compris ceux ultérieurement contrepassés ;
- `reversed` : somme positive de leurs contrepassations ;
- `net_received=received-reversed` ; compteurs `payments` et `reversals` ;
- en l'absence d'événements : montants et compteurs nuls.

Ce récapitulatif provient de la même version du journal que positions/cash. Il n'inclut aucun revenu antérieur à l'ouverture, n'est pas le solde espèces et ne constitue pas une performance. Les agrégats peuvent dépasser la limite de précision d'un montant individuel après plusieurs encaissements/retraits : addition entière exacte sans nouvelle limite artificielle sur une lecture valide.

Le domaine du coût reconnaît les dividendes comme mouvements de cash uniquement. Méthode du PRU et fractions/arrondis inchangés ; politique descriptive version 3, `dividends=cash_only_no_cost_effect`. Aucune déclaration sur l'inclusion historique des frais du PRU initial n'est ajoutée.

Les contrats REST/MCP historiques V1 et leur valorisation restent inchangés. En V1.1, seule l'augmentation/diminution des liquidités modifie le total de valorisation ; les valeurs de marché des titres restent identiques.

## Diff ciblé

- `src/domain/transactions.ts`, `src/application/transactions.ts` : variante dividende, attribution facultative validée et crédit cash, réutilisation des contrepassations.
- `src/domain/dividends.ts` : récapitulatif exact des revenus enregistrés ; `src/domain/cost-basis.ts` : reconnaissance sans mouvement de titres/coût.
- Services de lecture portefeuille/valorisation, descriptions MCP et OpenAPI V1.1 local enrichis.
- Adaptateurs Memory/D1 et schéma de stockage JSON existants réutilisés sans modification ni migration supplémentaire.

Preuves et limites : [phase 5](phase-5.md). Les dividendes historiques non enregistrés restent inconnus. Pas de fiscalité, calendrier d'éligibilité, montant brut ou réinvestissement automatique. Après ce bloc : conventions puis calculs des gains réalisés (cession nette de frais moins coût libéré), gains latents et performances avec traitement explicite des flux et de l'historique incomplet.
