# Local execution rules

## Git

By explicit owner decision, `git.rules` permits direct `git add` and `git commit`
commands, including `git commit --amend`, without repeated system prompts. It does
not grant task authorization: AGENTS.md, the VCS policy and the git-commit skill
still require explicit user authorization before staging or committing. Amending
requires specific authorization to amend; a request for a new commit is insufficient.

Prefix rules allow every trailing argument, including `-a`, `--no-verify` and
`--amend`. Workflow restrictions still apply: review explicit paths, preserve
unrelated changes and never bypass hooks without explicit authorization. Push,
reset, rebase, clean, restore and rm remain prompted. Other destructive commands
receive no allow rule. No deployment is authorized by these rules.

Validate without executing Git writes:

```sh
codex execpolicy check --rules .codex/rules/git.rules -- git add -- README.md
codex execpolicy check --rules .codex/rules/git.rules -- git commit -m example
codex execpolicy check --rules .codex/rules/git.rules -- git commit -m example --amend
codex execpolicy check --rules .codex/rules/git.rules -- git push origin main
```

Restart Codex to load rules; the project configuration layer must be trusted.
Managed policies, sandbox restrictions and other active rules can still require
approval. These checks validate this file, not the complete host policy. No global
configuration, trust setting or filesystem permission is changed by these files.
Global Git options (`git -C ...`, `git -c ...`), wrappers and absolute executable
paths are intentionally outside this allow rule. Path selection remains a workflow
responsibility: prefix rules do not constrain the working directory or path suffixes.

Reference: [official execution rules documentation](https://developers.openai.com/codex/rules).

## Wrangler

`wrangler.rules` permits fixed commands ending with literal `--` (end of options).
This prevents trailing flags from overriding `--env dev`, `--dry-run` or `--local`.
Use the exact templates in its `commands` list; other argument orders require
the existing approval policy. The installed Wrangler parser was checked offline:
flags after `--` remain positional arguments and can cause CLI errors.

Use direct commands without leading environment assignments or shell wrappers.
Codex 0.167.0 treats `CI=true ...` as an opaque shell invocation; changing its
arguments or redirection path can miss a saved approval. Fixed read-only templates
now cover `whoami`, D1 info/Time Travel info for the ingestion database, and
deployment/version lists for the four named project Workers. End each template
with `--`; D1 templates use the absolute config path specified in `wrangler.rules`.
These allow rules permit the reviewed diagnostics outside the sandbox, including
network access and Wrangler log writes; they do not change the sandbox globally.

Wrangler's `d1 migrations list` creates its tracking table, so it remains prompted.
SQL execution, exports, restores, secret operations and new deployments receive no
additional allow. Existing dev deployment rules remain unchanged. Individual
`versions view <id>` invocations still require review. Do not wrap commands or add
redirections expecting the direct template to match. Use `execpolicy check` with
all project rules and, when auditing saved approvals, the global rule file as well.

```sh
node node_modules/wrangler/bin/wrangler.js whoami --
node node_modules/wrangler/bin/wrangler.js deployments list --name pea-tracker-quotes-ingestion --json --
node node_modules/wrangler/bin/wrangler.js versions list --name pea-tracker-financial-read --json --
```

Validate the exact prompt override with all project rules:

```sh
codex execpolicy check --rules .codex/rules/git.rules --rules .codex/rules/checks.rules --rules .codex/rules/wrangler.rules --rules .codex/rules/python.rules -- /bin/zsh -lc 'CI=true WRANGLER_SEND_METRICS=false node node_modules/wrangler/bin/wrangler.js d1 migrations list pea-tracker-quotes-ingestion --config tests/fixtures/wrangler.access-collector-remote.private.jsonc --remote'
```

Supported launchers: `node node_modules/wrangler/bin/wrangler.js`, `npx wrangler`,
`npx --no-install wrangler` and `wrangler`; prefer the installed Node invocation.
Allowed templates cover loopback development, dev/PoC dry-runs, the fixed
`pea-tracker-dev` deployment with provisioning disabled, and local synthetic D1
migration list/apply plus `SELECT 1 AS ok`. Review migrations before applying.
Arbitrary SQL, custom persistence paths and existing test-helper invocations
without the final `--` receive no broad allow.

Remote deployment still requires explicit user authorization under AGENTS.md.
Production, PoC deployment, remote D1, secrets and destructive commands have no
allow here. No broad `deploy`, `dev`, `d1` or `npm run build` rule is added.

Validate a template or negative case without executing Wrangler:

```sh
codex execpolicy check --rules .codex/rules/wrangler.rules -- node node_modules/wrangler/bin/wrangler.js deploy --env production
```

Recheck after Wrangler/config changes. Rules match arguments, not configuration
contents, environment variables, executable resolution or account identity.
Absolute config paths must be updated if this repository moves. Existing global
approvals are unchanged; checking these files does not establish the full host
policy. Restart/trust requirements and sandbox filesystem, network and socket
restrictions still apply, including Wrangler logs outside the workspace.

## Local checks

`checks.rules` permits the installed Node binaries, bare tool names and
`npx --no-install` forms. No general `node`, `npm`, shell or script allow is added.
Use these forms from the repository root:

```sh
node node_modules/vitest/vitest.mjs run --
node node_modules/vitest/vitest.mjs run tests/auth.access.test.ts --
node node_modules/typescript/bin/tsc --noEmit
```

Vitest permits the full suite or one/two listed existing test files before `--`;
new targets and other options need review. Vitest ignores filters after `--`.
Appended flags cannot enable an API server, load another config or update
snapshots. Tests still execute project code and may
start local D1/HTTP fixtures. These rules do not inspect subprocesses or make
modified tests safe; review code/config before running outside the sandbox.

TypeScript rejects `--`, so its `--noEmit` prefix necessarily accepts trailing
compiler options, including overrides that can emit local files. It does not
allow a leading build/clean command. This is a compiler execution permission,
not a guarantee that every compiler argument is read-only.

Vite templates are listed in `checks.rules`: fixed root, local build output with
automatic directory clearing disabled, or a loopback dev server. Both end in
`--`. Vite is installed transitively; no frontend entrypoint or Vite package script
currently exists, so permission does not establish a working frontend build.
Vite production *builds* are local artifacts, not production deployments.
Existing Wrangler and Git restrictions remain in force. Sandbox/host policy may
still prompt even when these files return `allow`.

## Python collector

`python.rules` permits only reviewed collector checks and synthetic qualification:

```sh
# From the repository root
collector/.venv/bin/python -m pea_collector.checks --
collector/.venv/bin/python -m pea_collector.qualify --offline --
# From collector/
.venv/bin/python -m pea_collector.checks --
.venv/bin/python -m pea_collector.qualify --offline --
```

The corresponding `./`, absolute interpreter and existing
`../collector/.venv/bin/python` forms are included. The package must already be
installed in this local environment. Relative paths are meaningful only from the
documented directory; prefix rules cannot verify the working directory, environment
or executable/module contents. Recheck after changing either launcher.

Direct `python -m pytest collector/tests` remains prompted: pytest accepts trailing
options and additional test paths, **including after `--`**. A prefix allow cannot
restrict it to this test suite. `pea_collector.checks` instead rejects every extra
argument, clears inherited pytest options/plugins, disables plugin autoload, and
selects the collector test directory itself. These tests use synthetic data and
may open loopback fixtures; reviewed repository test code still runs outside the
sandbox. This is not permission to run unreviewed tests or transmit secrets.

Qualification defaults to synthetic/offline behavior. The allowed template pins
`--offline --`; appended arguments are rejected before any provider request.
`qualify --live` explicitly remains prompted. General Python, pip, uv installation,
the ingestion CLI, monitor, shell commands and live network operations receive no
allow rule. Existing Git, Wrangler, deployment and functional-approval policies
remain unchanged. No global rules or trust settings are modified.

Validate the entire project policy without executing the candidate command:

```sh
codex execpolicy check --rules .codex/rules/git.rules --rules .codex/rules/checks.rules --rules .codex/rules/wrangler.rules --rules .codex/rules/python.rules -- collector/.venv/bin/python -m pea_collector.checks --
codex execpolicy check --rules .codex/rules/git.rules --rules .codex/rules/checks.rules --rules .codex/rules/wrangler.rules --rules .codex/rules/python.rules -- collector/.venv/bin/python -m pea_collector.qualify --live
```

An appended argument may still match an `allow` prefix, but both approved modules
reject it before test selection or I/O. This parser guarantee is essential; the
rules themselves cannot enforce exact command length. Explicit `prompt` rules for
raw pytest and `--live` take precedence over broader saved `allow` rules when the
project layer is loaded. A check with these files does not prove that the current
Codex session has loaded them; restart/trust and host restrictions still apply.

Validation on 2026-11-11: 42 command cases with all four project rules loaded
together matched expectations: 14 `allow`, 15 `prompt`, 13 no-match. Coverage
includes six interpreter paths, direct pytest, live qualification, extra arguments,
general Python/pip and ingestion commands. Actual launcher checks also reject
extra paths/options with exit code 2 before tests/network; offline qualification
passes from both the repository root and `collector/`. No-match is not a forbid
rule: other active policies and sandbox controls still apply.
