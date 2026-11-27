# Frontières de confiance

| Frontière | Données / autorité | Contrôle et limite |
| --- | --- | --- |
| Propriétaire → ChatGPT | Intention, données financières autorisées | Modèle/client non fiable pour accorder des droits ; ses annotations et booléens n'autorisent rien |
| ChatGPT → Cloudflare Access → /mcp | OAuth géré à l'edge puis assertion signée | JWT RS256, issuer/JWKS configurés, audience exacte ou paire connue explicitement admise, sujet propriétaire ; aucune audience arbitraire |
| MCP / REST → services | Arguments structurés et UUID | Schémas stricts ; permissions serveur, résolution propriétaire et réel/fictif ; REST V2 lecture seule |
| Outils → contexte du modèle | Texte, provenance, résultats financiers | Sorties structurées, descriptions statiques ; le texte libre reste non fiable ; isolement de mémoire ChatGPT non attestable depuis le dépôt |
| Navigateur → application Access distincte → relay → service financier | Approbation d'une proposition exacte | AUD navigateur distincte, refus Bearer/service, Origin conservé, CSRF cookie+formulaire, durée de cinq minutes, digest lié à l'intention ; GET peut préparer le nonce mais n'écrit pas le journal |
| Services → D1 | Ouvertures, propositions, événements, reçus | SQL lié, garde propriétaire/ancre/statut, CAS et batch atomique pour événement/reçu ; consommation de proposition avant append : échec ambigu échoue fermé, sans relance aveugle |
| Scheduler → GitHub Actions → collecteur Python | Déclenchements et secrets d'ingestion | Ledger de dispatch, permissions GitHub restreintes, secrets au seul job live ; ce chemin n'accorde pas portfolio:write |
| Collecteur → fournisseurs | Symboles bornés et cotations externes | Yahoo isolé en processus, sortie normalisée limitée, délais et nettoyage ; aucune prose fournisseur nécessaire au MCP |
| Collecteur → Access Service Auth → ingestion → D1 | Cotations partagées | AUD machine, identité machine signée et grants provider/instrument ; absence de permission financière |
| EODHD en observation | Données différées et quota distinct | Transport fixe HTTPS, refus des redirections, diagnostics bornés ; aucune activation de fallback dans cette mission |
| Dépôt / dépendances / CI → déploiement | Code de confiance et manifeste privé | Lockfiles, SHA d'Actions, validation Linux acquise ; trous de contrôle CI à traiter, inventaire déployé complet non revérifié |
| Anciennes compositions → infrastructure | Diagnostic et PoC séparés | Aucun accès financier dans le diagnostic par défaut ; inventaire local distinct des serveurs effectivement exposés |

Pas de MCP client, lancement de shell, import dynamique d'outil tiers, resources/prompts distants ou serveur MCP découvert automatiquement dans la composition financière examinée. Le modèle peut avoir d'autres connecteurs hors du périmètre serveur : absence de passerelle d'exfiltration ici ne prouve pas l'absence de risque au niveau du client.
