# Local Git execution rules

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
