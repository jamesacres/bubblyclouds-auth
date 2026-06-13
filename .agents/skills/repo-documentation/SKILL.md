---
name: repo-documentation
description: Analyses a TypeScript repository and writes README.md, ARCHITECTURE.md, CLAUDE.md, and AGENTS.md from scratch. Use when a repo lacks agent-oriented documentation or when existing docs need a full rewrite to match the actual codebase.
---

# Repo Documentation

Produce four documentation files that let an AI agent immediately understand and work in a TypeScript repository: `README.md`, `ARCHITECTURE.md`, `CLAUDE.md`, and `AGENTS.md`. These files are not generic templates — they are derived from reading the actual repo.

## When to Use This Skill

- A TypeScript (or JavaScript) repository has no agent-facing docs
- Existing docs are stale or don't reflect the real structure
- Onboarding a new AI agent to an unfamiliar codebase
- After a major architectural refactor

## What Each File Does

| File | Audience | Purpose |
|------|----------|---------|
| `README.md` | Humans & agents | Project overview, quick-start commands, project structure, tech stack |
| `ARCHITECTURE.md` | Agents & senior devs | Package hierarchy, dependency rules, decision trees, key patterns |
| `CLAUDE.md` | Claude Code (Claude AI) | Concise rules the agent must follow every session (loaded automatically) |
| `AGENTS.md` | Other AI agents (Gemini, GPT, etc.) | Identical to CLAUDE.md — copy with any agent-specific adjustments |

---

## Step 1 — Read the repository

Before writing anything, build a complete mental model. Run all of the following in parallel:

```bash
# Top-level shape
ls -la
cat package.json

# Monorepo / workspace detection
cat pnpm-workspace.yaml 2>/dev/null || cat lerna.json 2>/dev/null || cat nx.json 2>/dev/null

# Build tooling
cat turbo.json 2>/dev/null || cat nx.json 2>/dev/null

# TypeScript config
cat tsconfig.json

# All package.json files (reveals packages, their names, and inter-dependencies)
find . -name "package.json" -not -path "*/node_modules/*" | sort

# Scripts available at root
cat package.json | grep -A 50 '"scripts"'

# Test setup
cat jest.config.* 2>/dev/null || cat vitest.config.* 2>/dev/null

# CI/CD
ls .github/workflows/ 2>/dev/null
```

Then read every `package.json` under `packages/` and `apps/` (or equivalent workspace dirs). Record:

- Package name (`name` field)
- Local dependencies (`dependencies`/`devDependencies` that reference `workspace:*` or sibling packages)
- `exports` map (reveals the import patterns used)
- `main`/`types` fields

Also read the top-level `tsconfig.json` for path aliases — these often mirror the package structure.

---

## Step 2 — Derive the architecture

From the data collected, answer these questions before writing:

### 2a. What kind of repo is this?

- **Monorepo** — multiple packages + apps, managed by Turborepo / Nx / Lerna / pnpm workspaces
- **Single-package library** — one `src/`, published to npm
- **Single application** — one deployable unit (API server, CLI tool, etc.)
- **Hybrid** — a primary app with co-located supporting packages

### 2b. If a monorepo: what are the layers?

Build a dependency graph from the `workspace:*` references you read. Group packages into layers where:

- **Layer 0 / Foundation** — packages with zero local dependencies (pure types, utils, constants)
- **Layer 1+** — packages that depend only on lower layers

Write out the layer assignment explicitly before drafting ARCHITECTURE.md. The number of layers and their names are specific to this repo — do not copy the layer names from any example.

Example derivation (do not use these names literally):

```
Layer 0: @my-app/types, @my-app/config        (no local deps)
Layer 1: @my-app/db, @my-app/logger           (depend only on L0)
Layer 2: @my-app/auth, @my-app/billing        (depend on L0–L1)
Layer 3: @my-app/api                          (depends on L0–L2)
Layer 4: apps/web, apps/admin                 (depend on all packages)
```

### 2c. What patterns are used?

Identify:

- **Import pattern**: compiled dist? JIT TypeScript source? Path aliases?
- **Export pattern**: barrel `index.ts`? Granular exports in `package.json`? Neither?
- **Testing**: Jest, Vitest, Playwright, etc. — what command runs tests?
- **Linting / formatting**: ESLint, Biome, Prettier — what command fixes issues?
- **Type checking**: `tsc --noEmit`, `tsc -p tsconfig.json`, etc.
- **Build**: Turborepo pipeline? Custom scripts? What order?
- **Deployment**: Static export, Docker, Lambda, CLI binary, npm publish?

### 2d. What are the coding conventions?

Look for patterns across existing files:

- Are there type casts (`as SomeType`) — if so, are they idiomatic or avoided?
- Are there `any` usages — tolerated or banned?
- Comment density — heavy JSDoc or almost none?
- Index files — used for re-exports or avoided?
- Generic type parameter naming — `T`, `TFoo`, `Foo`?

Capture rules that are non-obvious. Skip anything a TypeScript developer would already know.

---

## Step 3 — Write ARCHITECTURE.md

Structure this file to answer the question: **"Where does my code go, and why?"**

### Required sections

#### Package Hierarchy

Draw an ASCII box diagram showing layers top-to-bottom (applications at top, foundation at bottom). Use the actual package names. Include a one-sentence description of each package's responsibility.

#### Dependency Rules

State the invariants as numbered rules, e.g.:

1. Packages may only depend on packages in lower layers.
2. No circular dependencies.
3. All inter-package imports must be declared in `package.json`.

#### Decision Tree

A flowchart (ASCII or markdown) that answers "which package should this new code go in?" Start with the most discriminating question first (e.g., "Is this reusable or app-specific?").

#### Key Pattern: [name the dominant pattern]

Explain the most important non-obvious pattern. Common examples:

- **Just-in-Time (JIT) source exports** — packages export TypeScript source directly; the consuming app compiles it. Show the `package.json` exports block and explain why no build step is needed.
- **Compiled dist pattern** — packages publish a `dist/` directory. Show what `tsconfig.build.json` looks like and how path aliases differ.
- **Barrel-free imports** — no `index.ts` re-exports; import directly from the source file.

#### Import Guidelines

Show side-by-side good/bad examples for:
- Internal imports (within the same package) → relative paths
- Cross-package imports → absolute package name
- Type-only imports → `import type`

#### Architectural Principles

Numbered list of design invariants. Focus on the non-obvious ones specific to this repo. Do not pad with generic TypeScript advice.

---

## Step 4 — Write README.md

### Required sections

1. **Title + one-paragraph description** — what the project does, for whom, and what makes it distinctive
2. **Architecture Overview** — a 5–10 line summary of the layer structure with a pointer to ARCHITECTURE.md
3. **Quick Start** — prerequisites (Node version, package manager + version), install command, dev command
4. **Available Commands** — grouped table or code blocks for: dev, build, test, lint/fix, type-check
5. **Package / Module Documentation** — one bullet per package: name, one-sentence purpose
6. **Project Structure** — a directory tree showing the top 2–3 levels, with inline comments
7. **Tech Stack** — bulleted list: framework, language, build tool, test framework, deployment target
8. **Contributing** — branch → change → test → lint → PR

Do not include sections that don't apply (e.g. no "Mobile" section if there is no mobile build).

---

## Step 5 — Write CLAUDE.md

This file is loaded by Claude Code at the start of every session. Keep it **short and scannable** — aim for under 50 lines. Every line must be actionable.

### Structure

```markdown
Architecture:

- [One sentence describing the layer model, with a pointer to ARCHITECTURE.md]
- [Specific rule about dependency direction]
- [Specific rule about where to place new code — reference the decision tree]

Rules:

- [Convention 1 — non-obvious, specific to this repo]
- [Convention 2]
- ...
- at the end of a task, ONLY if it was complex, run [build command], [test command] and fix all issues
- at the end of a task, run [lint fix command] to fix linting issues
- When moving and changing files, update the test files
- Ensure md files are updated if they reference something which is no longer true
```

**What belongs in Rules:**

- Anti-patterns that would be natural for an agent but are banned here (e.g., "do not use `any`", "do not add index.ts files")
- Import rules not enforceable by a linter
- Naming conventions (e.g., "do not prefix type parameters with T")
- When to run build/test/lint (end-of-task cadence)

**What does NOT belong:**

- Anything derivable from reading the code
- Generic TypeScript best practices
- Anything already enforced by the linter

---

## Step 6 — Write AGENTS.md

Copy CLAUDE.md verbatim. Then review for any Claude-specific phrasing and generalise it. The content should be identical in most cases — the purpose is to serve agents that look for `AGENTS.md` specifically (e.g. Gemini, Codex, custom agents).

If there is a meaningful difference (e.g. a different test command to use in a non-interactive context), note it with a comment.

---

## Quality checks before finishing

Run through this checklist:

- [ ] ARCHITECTURE.md layer diagram uses the actual package names from the repo, not placeholder names
- [ ] README.md Quick Start commands were verified against `package.json` scripts — no invented commands
- [ ] CLAUDE.md is under 50 lines and contains no generic advice
- [ ] AGENTS.md matches CLAUDE.md (or deviates with explicit justification)
- [ ] Decision tree covers every package in the repo
- [ ] Import guidelines include ✅ and ❌ examples from real files in the repo (not invented ones)
- [ ] No section says "TODO" or "See X" without X existing in the repo

---

## Common mistakes to avoid

**Do not copy the layer names from this skill's examples.** The layer names (Foundation, Infrastructure, Collaboration, etc.) come from a specific monorepo. Derive names from the actual packages.

**Do not invent commands.** Only list scripts that appear in a `package.json` `"scripts"` block you actually read.

**Do not pad CLAUDE.md.** If the repo only has three non-obvious rules, write three rules. A shorter, accurate CLAUDE.md is better than a longer one with generic advice the agent already knows.

**Do not describe the files you are writing inside themselves.** ARCHITECTURE.md should not explain what ARCHITECTURE.md is for — it should just be the architecture.

**Do not assume monorepo.** Single-package repos need a simpler ARCHITECTURE.md that describes module organisation within `src/` rather than cross-package dependency rules.
