# Gains réalisés et latents — incrément local

Suite locale : [flux externes et gain économique](performance.md), conditionnés à une référence de marché explicite. Le rendement en pourcentage reste indisponible et aucune référence réelle n'est activée.

Source : conventions explicites de la mission utilisateur « Gains réalisés et latents ». Implémentation locale ; aucun commit, déploiement ni accès au PEA réel.

## Calculs et précision

- Produit net de vente = brut − frais de vente déclarés.
- Coût cédé = quantité vendue × PRU moyen exact avant vente, incluant les seuls frais d'achat déjà capitalisés.
- Gain réalisé = produit net − coût cédé. Positif, nul ou négatif ; le PRU restant ne change pas lors d'une vente partielle. Une vente totale reste dans les résultats réalisés même si la position est soldée.
- Gain latent = valeur de marché existante − coût restant. Pourcentage = gain latent / coût restant × 100, uniquement lorsque ce coût est connu et strictement positif.
- À l'échelle du portefeuille, les gains latents concernent les titres, hors espèces. Le pourcentage utilise la somme de leurs coûts restants, pas une moyenne de pourcentages individuels ni la valorisation espèces comprises.
- Fractions BigInt exactes ; aucun arrondi intermédiaire, aucun Number financier. Représentation signée au plus à 18 décimales, demi-pair, avec fraction exacte et marqueur `rounded`. Les arrondis négatifs sont symétriques et n'affichent pas de zéro négatif. Le helper partagé conserve les sorties de coût/PRU précédentes.

## Corrections et couverture

Chaque vente conserve son identifiant, date, provenance, produit net, coût cédé et gain. La provenance du coût initial reste attachée à l'instrument, y compris après clôture. `realized.sales_results` conserve le résultat d'origine ; `reversed_by` le relie à sa contrepassation.

Les totaux et sous-totaux réalisés excluent les ventes contrepassées **une seule fois**. Une vente de coût inconnu est indisponible ; si elle est contrepassée, elle ne bloque plus les agrégats des seules ventes actives. Les résultats annulés restent consultables, sans être à additionner aux totaux courants.

Une contrepassation d'achat postérieure à des ventes actives ayant utilisé son coût moyen exige une réconciliation : gains de ces ventes marqués `correction_requires_reconciliation`. Aucun recalcul rétroactif ou ajustement de gain arbitraire n'est introduit. Les règles antérieures de contrepassation/coût et de solvabilité sont conservées ; les résultats ambigus ne deviennent pas un total financier présenté comme complet.

Les gains réalisés globaux/par instrument exposent `status`, `total` et `known_subtotal`, ainsi que les compteurs de ventes actives/contrepassées/indisponibles. Si un gain actif est indisponible, `total=null` ; le sous-total connu est explicite, ou null en l'absence de vente active calculable. Aucun gain avant l'ouverture n'est reconstitué.

Les gains latents par position restent indisponibles si leur cours ou leur coût manque. Total et pourcentage globaux sont nuls au sens JSON (`null`/statut indisponible), jamais un zéro financier supposé, dès qu'une position manque. Le sous-total connu reste distinct du total complet. Avec un coût nul, le gain absolu peut être calculé, mais pas son pourcentage. Portefeuille sans titres : gain nul, pourcentage indisponible.

Les métadonnées de cotation, motifs de non-valorisation et avertissements individuels restent inchangés ; les avertissements sont aussi agrégés sur le récapitulatif latent. Un prix de fraîcheur inconnue/périmée peut servir à l'estimation existante, avec ses réserves ; aucun temps réel n'est promis.

## Intégration

- `src/domain/fractions.ts` : arithmétique/représentation exactes partagées ; `cost-basis.ts` : replay unique `projectFinancialState`, coûts et gains réalisés. `projectCostBasis` reste compatible avec ses appelants précédents.
- `src/domain/gains.ts` : gains latents calculés depuis les valeurs de marché déjà produites, sans nouvel appel fournisseur.
- `PortfolioService.current` : coûts et `realized` à la même version du journal. `ValuationService.current` : mêmes réalisés, `positions[].unrealized` et récapitulatif `unrealized`.
- Contrat V1.1 local et descriptions MCP enrichis ; données sources, journal, schéma/adaptateurs D1, contrats REST/MCP historiques V1 et montants de valorisation inchangés. MCP reste en lecture seule, autorisation propriétaire/portefeuille inchangée.

## Préparation des performances — sans rendement publié

| Élément | État et précaution |
| --- | --- |
| Gains réalisés cumulés enregistrés | Calculés ici ; ne pas présenter les totaux partiels comme complets |
| Gains latents actuels | Calculés ici sur les titres/cours sélectionnés ; coût/couverture et fraîcheur explicites |
| Dividendes nets enregistrés | Récapitulatif existant, depuis l'ouverture uniquement |
| Frais déclarés | Déjà dans le coût d'achat et le produit net de vente ; aucune soustraction supplémentaire |
| Versements/retraits | Identifiables par types/dates du journal et contrepassations ; futurs flux externes, pas encore agrégés en moteur de rendement |
| État initial | Quantités/cash/coût déclarés disponibles ; ne fournit pas une valorisation de marché initiale ni un historique de flux complet |

Les dividendes sont déjà dans les liquidités et donc dans la valorisation globale : ne pas les rajouter à une variation du total PEA. Dans une décomposition séparée des résultats de titres et revenus, les dividendes ne sont ajoutés qu'une fois. Achats/ventes sont des mouvements internes ; versements/retraits sont des flux externes. Aucun ratio de performance n'est publié par cette livraison (`performance_available=false`).

Le gain latent fondé sur le PRU d'ouverture peut inclure une plus-value accumulée avant l'ouverture du journal ; un gain de cession utilise également ce coût déclaré, pas le cours de début de période. Le traitement historique des frais reste inconnu. Les gains calculés ne sont donc ni une performance depuis l'ouverture, ni une reconstruction fiscale/historique certifiée.

Prochaine décision : fixer la période, une valorisation de marché initiale documentée, le traitement temporel des flux externes et les corrections, puis livrer une performance globale explicitement bornée. Pas de TWR/XIRR, nouveaux fournisseurs ou statistiques historiques avancées dans cet incrément.

Preuves : [phase 6](phase-6.md). Les limites déjà identifiées de coût, taille des fractions, volume du journal et budget CPU hébergé non certifié restent applicables ; pas d'activation de production.
