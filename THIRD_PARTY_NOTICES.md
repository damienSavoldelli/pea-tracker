# Third-party notices

PEA Tracker's PolyForm license does not replace the licenses of these components.
No dependency version, upstream notice or existing schema license was removed.
This inventory was checked against the locked npm dependency graph, installed
Python metadata/license files and `skills-lock.json` on 25 November 2026. It is
not an assertion that a future bundled binary/image is redistribution-ready.

## Direct application dependencies

| Component | Locked version | License | Retained license text |
| --- | --- | --- | --- |
| @modelcontextprotocol/sdk | 1.32.2 | MIT | [Text](licenses/third-party/modelcontextprotocol-sdk-LICENSE.txt) |
| Hono | 4.13.16 | MIT | [Text](licenses/third-party/hono-LICENSE.txt) |
| jose | 6.2.15 | MIT | [Text](licenses/third-party/jose-LICENSE.txt) |
| Zod | 4.6.7 | MIT | [Text](licenses/third-party/zod-LICENSE.txt) |
| yfinance | 1.8.0 | Apache-2.0 | Installed distribution LICENSE.txt; [source](https://github.com/ranaroussi/yfinance) |

Python transitive packages retain their distribution license files. In particular,
requests/tzdata use Apache-2.0; pandas, lxml and several network packages use BSD
licenses; peewee's installed LICENSE is MIT even though its metadata field is
empty. curl_cffi's Python package is MIT; its native distribution and bundled
libraries require their own notices too. numpy declares a composite expression,
not just BSD. Retain the full upstream wheel/source license directories.

## Copyleft and tooling boundaries

- certifi 2026.10.23 contains MPL-2.0-covered certificate material. Preserve its
  notices and source availability; do not apply noncommercial restrictions to it.
- npm's lightningcss 1.33.0 platform packages are MPL-2.0 development dependencies.
- npm's sharp/libvips platform packages include LGPL-3.0-or-later (some with
  additional MIT/Apache terms), all development-only in this lockfile.
- TypeScript 7.0.2 is Apache-2.0; Vitest 5.1.0 MIT; Wrangler 4.158.0
  MIT OR Apache-2.0. Their dependency/native notices remain applicable.

No modification of upstream MPL/LGPL files or static combination into project
source was identified in this scoped check. Use of separate development tools is
not a license grant over project code. If redistributing tools, wheels, native
libraries, an image or compiled bundle, preserve each license/NOTICE and satisfy
its applicable source/relinking obligations; never wrap upstream rights in a
noncommercial prohibition. Keep such artifacts outside the V2.0 source-only release
until that artifact's contents and obligations are checked.

## Material already copied into the repository

| Material | Upstream | Terms retained |
| --- | --- | --- |
| Cloudflare skills, references and their host symlinks | [cloudflare/skills](https://github.com/cloudflare/skills) | [Apache-2.0 text](licenses/third-party/cloudflare-skills-LICENSE.txt); original source links retained |
| git-commit skill and host symlink | [github/awesome-copilot](https://github.com/github/awesome-copilot) | [MIT text and GitHub copyright](licenses/third-party/github-awesome-copilot-LICENSE.txt) |
| OpenAPI schema material | Existing schema directory | [Existing Apache-2.0 text](aidd_docs/api/schemas/LICENSE), unchanged |

`skills-lock.json` records upstream provenance. Existing project-specific edits
are retained; the root license does not erase upstream notices or rights. These
skills are authoring tools, not deployed Worker runtime dependencies.

## Distribution obligations

MIT/BSD/ISC require retention of the applicable copyright/license/disclaimer
notices. Apache-2.0 additionally requires the license, relevant upstream NOTICE
content and notices of modifications where applicable. MPL covers its files;
LGPL has conditions for conveyed libraries/combined works. Merely listing package
names does not discharge these obligations for a bundled distribution.

This delivery changes only project license metadata and documentation; GitHub
source archives do not vendor node_modules or Python environments. Preserve
upstream licenses when dependencies are separately installed. Before shipping a
compiled archive, attach an inventory and the actual notices/source compliance
material for everything included; no such artifact is authorized here.

Primary guidance: [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0),
[Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/),
[GNU LGPL 3.0](https://www.gnu.org/licenses/lgpl-3.0.html).
