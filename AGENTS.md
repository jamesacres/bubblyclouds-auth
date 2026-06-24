# AGENTS.md

## Architecture

- Single-application repo. All source in `src/`; CDK infrastructure in `deploy/` (separate TypeScript project — never import between them). See ARCHITECTURE.md.
- `oidc-provider` owns the OIDC protocol. Custom logic lives in interaction routes, `loadExistingGrant`, `issueRefreshToken`, and the `Account` model — not in protocol re-implementation.
- New HTTP routes go in `src/routes/oidcInteraction.ts` (login/interaction UI) or `src/routes/api.ts` (account management). New external integrations go in `src/lib/`.

## Commands

### Main application

```bash
npm start           # Run locally with SAM CLI (synthesises CDK template first)
npm run start:ssl   # Start SSL proxy for local HTTPS (second terminal)
npm test            # Run all Jest tests
npm test -- src/handlers/oidc.test.ts   # Run a single test file
```

### CDK infrastructure (`deploy/`)

```bash
cd deploy
npm run build       # Compile TypeScript CDK code
npm run lint:fix    # Auto-fix lint
npm run test        # Run CDK tests
npm run cdk:synth   # Synthesise CloudFormation (ENV=dev)
npm run cdk:deploy  # Deploy to AWS (ENV=prod)
```

### Linting / formatting (root)

```bash
npx eslint .
npx prettier --write .
```

## Rules

- No barrel `index.ts` files. Import the specific file directly using relative paths.
- No path aliases — none are configured in `tsconfig.json`.
- Runtime config comes from AWS AppConfig, not environment variables. The config schema is `src/types/AppConfig.ts` — update it when adding new config fields.
- All DynamoDB access goes through `DynamoDBAdapter`. The `modelId` key is `ModelType:id`. New model types must be added to the `Model` enum in `src/types/Model.ts`.
- Email addresses must always pass through `sanitiseEmail` (lowercases and validates) before storage or lookup — this is how account deduplication works.
- The `uid` field on a DynamoDB `BubblyUser` record is the sanitised email; it is indexed by `uidIndex` GSI for account lookup.
- Views are EJS templates returned as plain strings from `src/views/`. Render them with `render()` from `ejs` in the route handler.
- At the end of a complex task, run `npm test` and `npx eslint .` and fix all issues.
- At the end of any task, run `npx prettier --write .` to fix formatting.
- When moving or renaming files, update any test files that import them.
