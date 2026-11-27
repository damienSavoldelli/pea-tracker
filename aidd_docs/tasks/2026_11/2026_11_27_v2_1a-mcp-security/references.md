# Références figées — V2.1A

Date de consultation : 27 novembre 2026. Audit local de V2.0.0, commit `c7cf0c53a1088431d0a5b43da29b3480f5f21806`. Aucun contrôle Cloudflare ni fournisseur nouveau.

## OWASP

- [Projet officiel](https://owasp.org/www-project-mcp-top-10/) : publication évolutive, phase bêta ; pas une certification.
- [Dépôt figé](https://github.com/OWASP/www-project-mcp-top-10/tree/165fe0f78ef104459237b4a8e0f6e78db9b02391), commit `165fe0f78ef104459237b4a8e0f6e78db9b02391`, horodatage GitHub 2026-07-29T14:00:25Z.
- [Index v0.1 à cette révision](https://github.com/OWASP/www-project-mcp-top-10/blob/165fe0f78ef104459237b4a8e0f6e78db9b02391/tab_top10.md), objet blob `213688c33e54bd9a48a782951be6d3331e1c4047`.
- Les identifiants sont normalisés ici en MCP01 à MCP10 ; les numéros inconsistants de l'index ne créent pas d'autres risques.
- **Divergence officielle MCP06** : l'index dit « Prompt Injection via Contextual Payloads », alors que [la fiche détaillée figée](https://github.com/OWASP/www-project-mcp-top-10/blob/165fe0f78ef104459237b4a8e0f6e78db9b02391/2025/MCP06-2025%E2%80%93Intent-Flow-Subversion.md) dit « Intent Flow Subversion ». L'audit retient ce dernier titre et couvre l'injection indirecte/détournement d'intention. Ne pas suivre le lien périmé de l'index ni renuméroter.

## MCP

Base applicable au SDK installé 1.32.2 : protocole 2025-11-25, également présent parmi ses versions supportées. Ne pas lui attribuer automatiquement les capacités d'une version ultérieure.

- [Transport 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) : Origin, authentification, isolation des sessions. GET refusé 405 peut être conforme si aucun flux SSE n'est proposé.
- [Autorisation 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) : liaison au destinataire, absence de token passthrough, séparation client/serveur d'autorisation.
- [Outils 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) : consentement, schémas, annotations non constitutives d'une permission, noms uniques.
- [Recommandations de sécurité consultées, édition 2026-07-28](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices) : confused deputy, SSRF, tokens et sessions. Le lien « latest » redirige vers cette édition ; elle est une référence complémentaire, pas une preuve de conformité du SDK au protocole 2026-07-28.

Cloudflare assure Managed OAuth ; le Worker vérifie l'assertion Access signée. Ne pas confondre cette délégation avec un serveur OAuth maison ni rouvrir la comparaison historique Auth0. Découverte/consentement, politiques du compte, rotation et protection réseau non réinspectés à distance.

## Preuves de départ

[Acceptation V2.0](../../../releases/v2.0.0-production-validation.md), [notes](../../../releases/v2.0.0.md), [intégration Linux](../2026_11_25_v2-integration/evidence.md).
Release GitHub V2.0.0 publiée le 25 novembre 2026 ; main distant et tag résolu vérifiés égaux au commit audité. Aucune branche existante supprimée.
