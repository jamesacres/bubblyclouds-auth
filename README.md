# bubblyclouds-auth

An OpenID Connect (OIDC) authentication service for the Bubbly Clouds platform. It acts as a full OIDC provider — client apps redirect users here for login and receive back tokens and userinfo. It supports email magic-code sign-in and federated login via Google and Apple Sign In.

Deployed as two AWS Lambda functions behind API Gateway (REST), with DynamoDB for persistence and AWS AppConfig for runtime configuration.

## Architecture Overview

The service is a single-package Node.js application. The main Lambda handler wraps a Koa app with `serverless-http`. Inside Koa, `oidc-provider` (mounted at `/oidc`) handles all OAuth 2.0 / OIDC protocol endpoints. Custom interaction routes (login UI, federated callbacks, consent) sit alongside it as Koa middleware. A second, lightweight Lambda handles root redirects.

Infrastructure is defined separately in `deploy/` as a CDK TypeScript stack.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module responsibilities, dependency rules, and key patterns.

## Quick Start

**Prerequisites:** Node.js 20, npm, AWS SAM CLI (for local runs)

```bash
npm install
cd deploy && npm install && cd ..

# Run locally (requires SAM CLI and a synthesised CDK template)
npm start

# In a second terminal — expose HTTPS on localhost
npm run start:ssl
```

## Available Commands

### Application (root)

| Command                                 | Description                                   |
| --------------------------------------- | --------------------------------------------- |
| `npm start`                             | Synthesise CDK template then run with SAM CLI |
| `npm run start:ssl`                     | Start local SSL proxy (second terminal)       |
| `npm test`                              | Run all Jest unit tests                       |
| `npm test -- src/handlers/oidc.test.ts` | Run a single test file                        |
| `npm run test:integration`              | Run integration tests (requires DynamoDB)     |
| `npx eslint .`                          | Lint source files                             |
| `npx prettier --write .`                | Auto-format source files                      |

### CDK Infrastructure (`deploy/`)

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `npm run build`      | Compile CDK TypeScript              |
| `npm run lint`       | Lint CDK code                       |
| `npm run lint:fix`   | Auto-fix CDK lint issues            |
| `npm run test`       | Run CDK tests                       |
| `npm run cdk:synth`  | Synthesise CloudFormation (ENV=dev) |
| `npm run cdk:deploy` | Deploy to AWS (ENV=prod)            |
| `npm run cdk:diff`   | Diff deployed vs current            |

## Module Documentation

- **`src/handlers/oidc.ts`** — Lambda entry point; cold-start initialises the Koa + oidc-provider stack
- **`src/handlers/redirect.ts`** — Lightweight redirect Lambda (root → bubblyclouds.com)
- **`src/lib/oidc.ts`** — Constructs and fully configures the `oidc-provider` instance
- **`src/lib/federatedClients.ts`** — Google and Apple OIDC client wrappers and token-exchange logic
- **`src/lib/ses.ts`** — SES v2 email delivery (magic codes)
- **`src/lib/signInCode.ts`** — Magic code generation, DynamoDB storage, and verification
- **`src/adapters/dynamodb.ts`** — `oidc-provider` Adapter interface backed by a single DynamoDB table with GSIs
- **`src/models/account.ts`** — OIDC Account model: upserts users on login, returns userinfo claims
- **`src/routes/oidcInteraction.ts`** — Login UI, email code flow, Google/Apple callbacks, consent, abort
- **`src/routes/api.ts`** — Account management API (`POST /api/account/:id/delete`)
- **`src/views/`** — EJS HTML templates (login, consent, logout confirmation, federated repost)
- **`src/types/`** — Shared TypeScript interfaces: `AppConfig`, `BubblyUserProfile`, `BubblyAdapterPayload`, enums
- **`src/utils/`** — Pure helpers: email sanitisation, random code generation, Secrets Manager fetch
- **`deploy/lib/auth-stack.ts`** — CDK stack: Lambda, API Gateway, DynamoDB, Secrets Manager, AppConfig, custom domain

## Project Structure

```
bubblyclouds-auth/
├── src/
│   ├── handlers/          Lambda exports (oidc, redirect)
│   ├── lib/               External service integrations
│   ├── adapters/          DynamoDB ↔ oidc-provider bridge
│   ├── models/            Account domain model
│   ├── routes/            Koa routers (interaction UI, account API)
│   ├── views/             EJS HTML templates
│   ├── types/             Shared interfaces and enums
│   └── utils/             Pure helper functions
├── deploy/
│   ├── bin/               CDK app entry
│   └── lib/               CDK stack (auth-stack.ts)
├── scripts/               Miscellaneous scripts
├── jest.config.ts
├── tsconfig.json
└── package.json
```

## Tech Stack

- **Runtime:** Node.js 20 on AWS Lambda
- **HTTP framework:** Koa 2 + koa-router, wrapped by `serverless-http`
- **OIDC protocol:** `oidc-provider` v8
- **Persistence:** AWS DynamoDB (single table)
- **Email:** AWS SES v2 (magic sign-in codes)
- **Federated identity:** `openid-client` (Google, Apple) + `google-auth-library`
- **Configuration:** AWS AppConfig (runtime config), AWS Secrets Manager (RSA signing key)
- **Infrastructure:** AWS CDK v2 (TypeScript)
- **Language:** TypeScript 5, ESM (`"type": "module"`)
- **Testing:** Jest 29 with `ts-jest` and ESM mode
- **Linting:** ESLint + Prettier

## Configuration

Runtime config (OIDC clients, federated provider credentials, resource servers, cookie secrets, demo accounts) is stored in AWS AppConfig. The schema is `src/types/AppConfig.ts`.

The RSA signing key lives in Secrets Manager as `sigRSA` (JSON-serialised JWK).

`deploy/` requires a `.env` file with: `AWS_ACCOUNT_ID`, `AWS_DEFAULT_REGION`, `CERTIFICATE_ARN`, `DOMAIN_NAME`, `SUBDOMAIN`, `APP_CONFIG_APPLICATION_NAME`.

## Integration Tests

The integration tests run the full OIDC flows end-to-end against a real local DynamoDB instance. AWS is never called — SES and federated providers (Google, Apple) are mocked.

**Prerequisites:** Docker

```bash
# Start local DynamoDB in one terminal
docker run -p 8000:8000 amazon/dynamodb-local

# Run integration tests in another terminal
npm run test:integration
```

The tests cover: OIDC discovery, authorization endpoint (basic, full scopes, native client, `bubblyEmail`, `bubblyIdentityProvider`), full email sign-in → code exchange → refresh token, account deletion, token rotation, and native client consent flow.

## Contributing

1. Create a feature branch from `main`
2. Make changes; add or update tests in `src/handlers/*.test.ts`
3. Run `npm test` — all tests must pass
4. Run `npx eslint . && npx prettier --write .` — no lint errors
5. Open a pull request against `main`
