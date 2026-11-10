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
