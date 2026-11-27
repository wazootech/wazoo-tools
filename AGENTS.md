# @wazoo/tools Agent Guide

This repository contains Vercel AI SDK integration tools for Wazoo and Worlds
platforms.

## Commands

- `bun install --frozen-lockfile --ignore-scripts` - Install dependencies.
- `bun run check` - Type check (`bun check`).
- `bun test` - Run unit tests (`node:test`; the same files also run on Deno).
- `bun run ci` - Format check, Oxlint, type check, manifest check, tests.
- `bun run publish:dry` - `jsr publish --dry-run` (the `jsr` CLI bundles its own
  publisher; no Deno install needed).

## Code health

Family-wide rules live in the
[wazootech workspace constitution](https://github.com/wazootech/workspace/blob/main/AGENTS.md#code-health-standards);
this repo's specifics:

- Before pushing, run `bun run ci` (fmt, lint, check, manifests, test); CI runs
  it on every pull request and push to `main`.
- `oxlint --deny-warnings` enforces `no-explicit-any` and `ban-ts-comment` (no
  `@ts-ignore`), and `jsr.json` and `tsconfig.json` set `strict: true`.
- `package.json` (what Bun installs) and `jsr.json` (what `jsr publish` ships)
  must agree on exports and dependency ranges; `scripts/check-manifests.ts`
  enforces it. Bump `version` in `jsr.json` only.
- `secret-scan.yml` runs gitleaks on every pull request and push to `main`;
  never commit credentials.
- Workflow actions are pinned to full commit SHAs with a version comment, and CI
  installs with `bun install --frozen-lockfile`, so commit any `bun.lock`
  change. `oven-sh/setup-bun` uses `bun-version: "1.x"` on purpose (Bun is the
  one unpinned toolchain).
- `code-health.yml` enforces file length (120 lines of code per source file, 300
  per test; blank, comment, and import/re-export lines excluded; no allowlisted
  exceptions) and warns on `TODO`/`FIXME` without an issue link.
- `.github/CODEOWNERS` routes review to the repo owner.
