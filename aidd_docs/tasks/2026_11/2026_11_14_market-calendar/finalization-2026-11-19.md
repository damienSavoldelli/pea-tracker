# Finalisation locale calendrier / fraîcheur — 19 novembre 2026

Le résolveur XPAR continu 2026–2027, la génération, le raccordement au lecteur et les contrats V1 existants sont conservés. Aucune nouvelle étude de calendrier, aucun appel Yahoo ni aucune affectation de production ajoutés.

## Qualification des affectations

Les artefacts privés de qualification/catalogue déjà utilisés pour la V1 ont été consultés localement sans afficher leurs valeurs. Ils attestent identité, MIC, devise et convention de cotation ; ils ne fournissent ni preuve du groupe/mode de négociation continu ni rattachement instrument/profil vérifié. L'identité d'un instrument ne démontre pas son profil de séance.

**Aucune affectation réelle supplémentaire ne peut donc être déclarée qualifiée sur ces seules preuves.** Aucun défaut XPAR n'est ajouté. Les affectations synthétiques existantes restent des fixtures, pas des instructions d'activation. Les preuves génériques du profil demeurent celles de `profiles.json` et `reference-validation.md` ; elles ne remplacent pas une preuve par instrument.

Conserver `unknown` pour les instruments non explicitement qualifiés, ALXP, enchères et phases non établies, horaires intraday des demi-séances et dates hors couverture. L'activation dépend encore de la preuve instrument → profil et d'une autorisation distincte ; aucun secret ni paramètre distant n'a été modifié.

## Distinction des retards

Un scénario d'intégration synthétique supplémentaire vérifie le résolveur et la règle V1 ensemble :

- samedi fermé, cours de la dernière séance connue : `last_completed_session` / `market_closed`, même si la collecte date de la veille ;
- marché ouvert, séance attendue absente malgré un fetch récent : `stale` / `expected_session_missing` ;
- ancienne transaction de la séance courante, fetch récent : âge de marché élevé distinct de l'âge de collecte, aucune promesse de temps réel ;
- séance courante disponible mais fetch ancien de plus de 60 minutes : `stale` / `collection_over_60_minutes`.

Seuils, priorité des raisons, DTO REST/MCP et calculs de valorisation inchangés. Les tests existants de valorisation et d'intégration du lecteur ont déjà passé après le merge ; ils ne sont pas relancés pour cette seule addition de couverture.

## Qualification ciblée — 21 novembre 2026

Les 20 entrées du catalogue existant ont été rapprochées localement de leurs métadonnées de source : identifiants uniques et MIC concordants. Résultat : **0 affectation qualifiée, 20 `unknown`**, dont 19 XPAR sans preuve instrument → mode/groupe continu et une ALXP sans profil admis. Les qualifications fournisseur existantes ne contiennent pas cette preuve. Aucune déduction depuis le type, le symbole ou le MIC ne remplace ce prérequis.

Un inventaire privé identifie chaque instrument, le motif et la preuve manquante ; il reste hors Git. La liste d'affectations admissibles est vide et la configuration privée existante n'en active aucune. Aucun code, profil, schéma ou paramètre de production n'est modifié. Qualifier les 19 XPAR demande une source établissant leur mode/groupe de négociation ; ALXP exige en plus un profil compatible vérifié. Sans ces preuves, conserver `unknown` est le résultat retenu, pas une activation du calendrier pour les 20 instruments.

Validation proportionnée : contrôle local des 20 correspondances et de l'absence d'affectation active ; **14 tests ciblés réussis** dans `tests/market-calendar.test.ts` (entrées absentes/ambiguës et MIC non admissibles, 28 autres cas non relancés). Aucune suite complète, requête distante, modification financière ou opération de déploiement.

## Activation partielle de place autorisée — 21 novembre 2026

La mission complémentaire distingue explicitement **jours de fermeture de place** et **phase de négociation individuelle**. La [source officielle Euronext](https://www.euronext.com/en/trading/trading-hours-holidays), colonnes Paris des éditions 2026 et 2027 consultées ce jour, établit les jours de séance/fermeture des marchés au comptant sans qualifier le continu ou le fixing d'un instrument. Le blocage précédent reste valable pour les profils intraday, mais n'empêche plus la couverture limitée aux fermetures de place.

L'adaptateur accepte une affectation explicite `calendar_id=euronext-paris-cash-days-v1` avec MIC XPAR, distincte de l'ancien `profile_id`. Il réutilise uniquement les dates et bornes UTC validées du référentiel existant : jours entièrement fermés → `closed` avec dernière date de séance ; jours de séance, demi-séances et couverture incertaine → `unknown`. Les heures du profil continu ne sont jamais utilisées pour cette affectation. Aucun défaut implicite par MIC ; anciens profils et politique de fraîcheur inchangés.

Préparation privée locale : **19 XPAR qualifiés pour les fermetures de place**, **une ALXP non affectée** ; **aucun mode individuel continu/fixing qualifié**. ALXP reste `unknown` faute de preuve de rattachement admise pendant cette vérification limitée. Ni cette restriction ni l'absence d'horaires individuels ne sont présentées comme un marché ouvert. Aucun identifiant privé ni montant financier n'est ajouté à Git.

**54 tests ciblés calendrier réussis et typecheck réussi** : compatibilité des profils existants, fermetures 2026/2027, frontières été/hiver, demi-séances, absence d'inférence intraday, MIC incohérents/ALXP, dernière séance normale et séance antérieure manquante. Configuration de préparation uniquement ; activation en production à autoriser séparément, sans migration ni modification OAuth/Access.
