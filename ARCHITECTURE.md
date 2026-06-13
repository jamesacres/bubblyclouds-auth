# Architecture

## Module Structure

This is a single-application repository with no published packages. All source lives under `src/` and is bundled directly into a Lambda function by esbuild (via `aws-cdk-lib`'s `NodejsFunction`). There is a second independent sub-project at `deploy/` — the CDK stack — compiled separately with `tsc`.

```
src/
├── handlers/        Entry points (Lambda exports)
├── lib/             Service instantiation and external integrations
├── adapters/        Database adapter (DynamoDB ↔ oidc-provider)
├── models/          Domain model (Account: find/create users, emit claims)
├── routes/          Koa routers (interaction UI, account API)
├── views/           EJS templates returned as HTML strings
├── types/           Shared TypeScript interfaces and enums
└── utils/           Pure helpers (email sanitisation, random codes, secrets)

deploy/
├── bin/             CDK app entry point
└── lib/             CDK stack definition (auth-stack.ts)
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `handlers/oidc.ts` | Lambda entry point; initialises Koa + oidc-provider on cold start |
| `handlers/redirect.ts` | Lightweight redirect handler (root → bubblyclouds.com) |
| `lib/oidc.ts` | Constructs and configures the `oidc-provider` instance |
| `lib/federatedClients.ts` | Wraps Google and Apple OIDC clients; handles token exchange |
| `lib/ses.ts` | SES v2 email delivery |
| `lib/signInCode.ts` | Magic code generation, storage (DynamoDB), and verification |
| `lib/google.ts` | `openid-client` discovery for Google |
| `lib/apple.ts` | `openid-client` discovery for Apple |
| `adapters/dynamodb.ts` | `oidc-provider` Adapter interface backed by a single DynamoDB table |
| `models/account.ts` | OIDC Account model — `findByIDP` upserts users, `claims()` emits userinfo |
| `routes/oidcInteraction.ts` | Login UI, email code flow, federated callbacks, consent, abort |
| `routes/api.ts` | Account management API (`POST /api/account/:id/delete`) |
| `views/` | HTML templates as EJS strings (login, consent, logout, repost) |
| `types/` | Shared interfaces: `AppConfig`, `BubblyUserProfile`, `BubblyAdapterPayload`, etc. |
| `utils/` | `sanitiseEmail`, `randomHumanCode`, `getSecret` (Secrets Manager via local proxy) |

## Request Flow

```
API Gateway
  └── Lambda (oidc handler)
        └── Koa middleware
              ├── URL rewrite: /.well-known/*, /jwks, /api  →  /oidc/*
              ├── Helmet (CSP with per-request nonce)
              ├── oidc-provider app (mounted at /oidc)
              │     ├── /oidc/auth, /oidc/token, /oidc/jwks, etc.  (protocol)
              │     ├── /oidc/interaction/:uid  (login UI — oidcInteraction router)
              │     └── /api/account/:id/delete  (account API router)
              └── DynamoDBAdapter  (sessions, tokens, grants, user profiles)
```

## Dependency Rules

1. `handlers/` may import from `lib/`, `types/`, and `utils/`. They do not import from `routes/`, `views/`, or `adapters/` directly.
2. `lib/oidc.ts` wires everything together — it is the only place that imports both `routes/` and `adapters/`.
3. `routes/` import from `models/`, `lib/`, `types/`, `views/`, and `utils/`. They do not import from `adapters/` directly.
4. `models/` import from `adapters/` and `types/`. They do not import from `lib/` or `routes/`.
5. `adapters/` import from `types/` only.
6. `utils/` have no internal imports.
7. `deploy/` is a completely separate TypeScript project — it does not import from `src/`.

## Decision Tree: Where Does New Code Go?

```
Is this code AWS infrastructure?
  YES → deploy/lib/auth-stack.ts

Is this a Lambda entry point (new handler)?
  YES → src/handlers/

Is this an external integration (new identity provider, new AWS service)?
  YES → src/lib/

Does it read/write DynamoDB?
  YES, for a new OIDC model type → extend src/adapters/dynamodb.ts
  YES, for user account data     → src/models/account.ts

Is this a new HTTP route or page?
  New login/interaction page → src/routes/oidcInteraction.ts + src/views/
  New account management endpoint → src/routes/api.ts

Is this a shared TypeScript shape (interface or enum)?
  YES → src/types/

Is this a pure function with no side effects?
  YES → src/utils/
```

## Key Pattern: Single DynamoDB Table

All persistent state — OIDC sessions, tokens, grants, authorisation codes, device codes, and Bubbly user profiles — lives in one DynamoDB table.

The `modelId` partition key encodes `ModelType:id`, e.g. `Session-abc123` or `BubblyUser-bubblyclouds|xyz`. Three GSIs (`uidIndex`, `grantIdIndex`, `userCodeIndex`) support lookups by email (`uid`), grant, and device-flow user codes.

DynamoDB TTL (`expiresAt`, in Unix seconds) auto-expires most records. Because DynamoDB TTL deletion can lag by up to 48 hours, `DynamoDBAdapter.find()` performs a manual expiry check before returning any payload.

When a session references an account that has since been deleted, `DynamoDBAdapter.find()` validates the account still exists rather than returning a stale session.

## Key Pattern: oidc-provider Delegation

`oidc-provider` handles the full OAuth 2.0 / OIDC protocol. Custom logic does not re-implement any protocol primitives. Instead:

- **`loadExistingGrant`** — skips the consent screen for web/native clients by silently creating a grant.
- **`issueRefreshToken`** — extends refresh-token issuance to public web/native clients without requiring `offline_access`.
- **`findAccount`** — returns an `Account` instance; claims are fetched lazily in `claims()`.
- **`interactions`** — every interactive step (login, consent, federated callback) is handled in `src/routes/oidcInteraction.ts`, not inside `oidc-provider` internals.

## Key Pattern: Configuration via AppConfig

Runtime configuration (OIDC clients, cookie secrets, federated provider credentials, resource servers, demo accounts) is fetched from AWS AppConfig at cold-start via a local HTTP proxy sidecar. The schema is `src/types/AppConfig.ts`. No runtime configuration lives in environment variables except the AppConfig path and the DynamoDB table name.

The RSA signing key is stored in Secrets Manager as `sigRSA` (a JSON-serialised JWK) and fetched via the AWS Parameters and Secrets Lambda extension.

## Import Guidelines

All imports use relative paths within `src/`. There are no barrel `index.ts` files — import the specific file directly.

```typescript
// Within a module — relative path to the specific file
import { sanitiseEmail } from '../utils/email';
import { DynamoDBAdapter } from '../adapters/dynamodb';

// Type-only imports
import type { BubblyUserProfile } from '../types/BubblyUserProfile';
```

```typescript
// Do NOT create index.ts re-exports
// Do NOT use path aliases (none are configured)
// Do NOT import from deploy/ inside src/
```
