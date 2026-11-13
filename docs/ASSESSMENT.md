# Kontainers: assessment of v0.1.1

Assessed 2026-11-12 at commit `c665221` (tag `v0.1.1`). Every build, test and run below happened in
throwaway Docker containers (OrbStack, linux/arm64) unless noted. Paths are relative to the repo root.

## Summary

The repository holds two applications:

1. `src/index.ts`, a single-file Bun server (331 lines). This is what the root `Dockerfile` builds and
   what `ataiva/kontainers:latest` on Docker Hub runs (checked: the image's `/app/dist/index.js`
   contains the stub's `jwt-token-` login and its hard-coded HTML).
2. `backend/`, `frontend/` and `shared/`, a larger Elysia + React application (about 17,900 lines).
   It does not install, build or start.

Neither one is a working container manager. The published image accepts any login as admin and
exposes Docker control without authentication. It should not be run anywhere reachable by others.

## Architecture

### The shipped server: `src/index.ts`

- A single `Bun.serve` on port 3000 (`src/index.ts:4-5`), bound to all interfaces.
- Talks to Docker by spawning the `docker` CLI (`src/index.ts:25, 45-57, 81, 96, 111, 126`). The image
  installs `docker-cli` (`Dockerfile:4-8`); the README tells users to mount `/var/run/docker.sock`
  (`README.md:207`).
- "Login" returns a random string as a token and `role: 'admin'` for any non-empty email and
  password (`src/index.ts:134-149`). Nothing checks the token afterwards.
- Proxy rules, traffic, system metrics and the dashboard return constants (`src/index.ts:166-230`);
  the dashboard always reports 5 containers, 3 running.
- The "UI" is five static HTML pages with forms that submit nowhere (`src/index.ts:233-323`).
- No storage. The `-v kontainers-data:/app/data` in the README mounts a directory nothing writes to.

### The unfinished application: `backend/`, `frontend/`, `shared/`

- Backend: Elysia on port 3001 (`backend/src/index.ts:50`), routes grouped under `/api`
  (`backend/src/routes/index.ts:12`). Several route modules also set their own `/api/...` prefix
  (`backend/src/api/auth.ts:16`), so auth would land at `/api/api/auth/*`.
- Docker: `dockerode` against `/var/run/docker.sock` (`backend/src/integrations/docker.ts:11-13`).
  Container list, inspect, create, start, stop, restart, remove, logs and stats are written. No
  images, networks, volumes, exec or compose.
- Proxy: writes nginx config files and runs `nginx -t` / `nginx -s reload` with `exec`
  (`backend/src/integrations/nginx.ts:105-111, 339-366`; `backend/src/services/nginxConfig.ts:385-448`).
  The backend container has no nginx; compose puts nginx in a separate frontend container
  (`docker/docker-compose.yml`), so the reload can never work.
- Proxy rule storage: an in-memory `Map` behind a mock `db` object that discards writes
  (`backend/src/services/proxy.ts:14-61, 67, 197-199`). Rules vanish on restart.
- Certificates: `certManager.ts` uses a mock ACME client that returns empty orders and a
  `mock-private-key` buffer (`backend/src/services/certManager.ts:12-40`). Nothing calls the
  service (`certManagerService` is only defined, `certManager.ts:453`). No certificate is ever issued.
- Users: SQLite via `drizzle-orm/better-sqlite3` in `./data/kontainers.db` (`backend/src/db/index.ts:9-16`).
  No migrations directory exists, so tables are never created (`backend/src/db/index.ts:21-30`).
- Frontend: React + Vite SPA (`frontend/src/App.tsx`). No login route; every page renders without
  auth. Service calls to `/api/containers` etc. send no token (`frontend/src/services/containerService.ts:9-12`);
  the auth client stores a bearer token in `localStorage` (`frontend/src/services/authService.ts:12, 29`).

## What works end to end

Nothing that matters to a user.

- Shipped stub, started in Docker: `/health` returns 200; `GET /api/containers` lists containers
  through the docker CLI with no token. The login test returned
  `200 {"token":"jwt-token-0.92a4…","user":{"email":"nobody@example.com","role":"admin"}}` for an
  invented account, and the dashboard returned its constants.
- Root `bun install --frozen-lockfile` and `bun run build` succeed, but they only build the stub.

## Build failures (the real application)

| Step | Result |
|---|---|
| `backend: bun install` | fails: `@elysiajs/websocket@^0.7.3` does not exist; `kontainers-shared@workspace:*` fails because the root `package.json` declares no `workspaces` |
| `backend: bun run build` | fails: `zod`, `@elysiajs/cors`, `kontainers-shared` unresolved |
| `backend: bun src/index.ts` | fails: missing `@elysiajs/swagger`; with workspaces forced and websocket removed (scratch only), fails next on `better-sqlite3`, `bcrypt` and `jsonwebtoken`, none of which are declared in `backend/package.json` |
| `frontend: bun run build` | 192 TypeScript errors (`tsc --noEmit`): missing `axios`, `recharts`, `kontainers-shared`, implicit `any`, unused symbols |

The backend also mixes Elysia versions: root depends on `elysia@^0.8`, backend on `^0.7.30`.

## Security problems

Severity assumes the documented deployment: Docker socket mounted, port published on all interfaces.

1. **Critical. No authentication on Docker control** (shipped image). Every `/api/containers*` route in
   `src/index.ts:22-131` runs `docker` commands for anyone who can reach port 3000. With the socket
   mounted, creating a container is root on the host.
2. **Critical. Login accepts anything** and returns `role: admin` (`src/index.ts:134-149`).
3. **Critical. Argument injection into `docker create`** (shipped image). `name`, `image`, `command`,
   port and env values from the request body go straight into the argv (`src/index.ts:45-57`). There is
   no shell, so this is not shell injection, but any value starting with `-` is parsed by `docker`
   as a flag, so a caller chooses arbitrary `docker create` options (bind mounts, `--privileged`).
   Path segments used as IDs (`src/index.ts:79, 94, 109, 124`) have the same problem.
4. **Critical. No authentication on the unfinished backend's container, proxy and config routes.**
   `authenticate` is applied only inside `auth.ts` and `health.ts`; `containers.ts`, `proxy.ts`,
   `config.ts` and both WebSockets (`backend/src/api/containers.ts:134, 160`, `backend/src/websocket/index.ts:19`)
   are open. Container create accepts arbitrary bind mounts (`backend/src/integrations/docker.ts:94-99`).
5. **Critical. Self-registration as admin.** `POST /register` is public and accepts `role`
   (`backend/src/api/auth.ts:42-53`).
6. **High. Password-reset token returned in the response** to anyone who knows an email
   (`backend/src/api/auth.ts:55-64`), so any account can be taken over.
7. **High. Default JWT secret** `kontainers-jwt-secret-key-change-in-production`
   (`backend/src/services/auth.ts:10`). Anyone can mint admin tokens if `JWT_SECRET` is unset.
8. **High. Default admin password `admin`** (`backend/src/services/auth.ts:89-101`); not reachable
   today because `db/index.ts:45-48` calls an empty local function instead.
9. **High. Nginx config injection.** Rule fields are interpolated into nginx config without
   validation: `sourceHost`, `sourcePath`, `targetContainer`, headers, rewrite rules and
   `customNginxConfig` (`backend/src/integrations/nginx.ts:141-170`; `backend/src/services/nginxConfig.ts:79-375`).
   An authenticated user (or, today, anyone) can add any nginx directive, including ones that read
   files from the proxy host. WAF `customRules` go into ModSecurity config verbatim (`nginxConfig.ts:571-573`).
10. **High. Path traversal in backups.** `backupId` from the request body or path is joined into a file
    path (`backend/src/services/config.ts:233, 259`): `restore` reads and `DELETE /backups/:id`
    unlinks `../../anything.json`. Rule IDs (`nginx.ts:107, 123`) and cert IDs (`nginxConfig.ts:476, 510`)
    have the same shape.
11. **Medium. Mass assignment.** `PUT /api/auth/me` passes the body to `updateUser`, which spreads it
    into the update (`backend/src/services/auth.ts:153-172`); only the Elysia schema stops `role`.
12. **Medium. Rate limiting is keyed on `X-Forwarded-For`** from the client
    (`backend/src/middleware/rateLimiter.ts:35`), so any caller resets their own limit; and the table
    it uses does not exist.
13. **Medium. CORS allows any `http://localhost:*` origin with credentials**
    (`backend/src/middleware/cors.ts:20, 25`).
14. **Medium. Bearer token in `localStorage`** (`frontend/src/services/authService.ts:29`): readable by
    any script on the origin. No CSRF design either way.
15. **Medium. Wildcard binds.** The stub listens on all interfaces; compose publishes `80:80` and
    `3001:3001` on all interfaces and grants `NET_ADMIN`, `SYS_PTRACE` (`docker/docker-compose.yml`);
    the README publishes `3000:3000` (`README.md:206`).
16. **Low. Error responses leak internals** (`backend/src/middleware/error.ts:36-40`).
17. **Low. Non-cryptographic IDs** for proxy rules (`backend/src/services/proxy.ts:3-9`).

I did not run live exploit probes against a Docker daemon; items 1-3 follow directly from the code
and from the confirmed behaviour of the shipped image above.

## Dependency vulnerabilities

- `npm audit --package-lock-only` (root `package-lock.json`): 19 (15 high, 3 moderate, 1 low).
  Highs include `elysia`, `drizzle-orm` (SQL identifier injection, GHSA-gpj5-g38j-94v9), `jws`
  (HMAC verification, GHSA-869p-cjfg-cm3x, via `jsonwebtoken`), `react-router`, `postcss`.
- `bun audit` across all three workspaces (scratch install): 70 (38 high, 29 moderate, 3 low),
  adding `zod`, `vite`, `@elysiajs/cors` (origin validation), `playwright` (<1.55.1).
- The repo carries both `bun.lock` and `package-lock.json` for the root only; the workspaces have no
  lockfile.

## Tests

`bun test` at the root: 244 tests across 28 files, 233 pass, 11 fail, 3 unhandled errors (8.7 s,
oven/bun:1.2.16, arm64).

- Most tests exercise their own mocks rather than the application. `tests/unit/backend/services/auth.test.ts`
  creates `mockBcrypt`/`mockJwt` and asserts the mocks return what they were told to;
  `tests/unit/backend/integrations/docker.test.ts` does the same with a `MockDockerApi`. Of 28 files, 6
  import any application code, and only `tests/backend-sanitize.test.ts` and the shared-utils tests test it.
- Files such as `spy-mockRestore*.test.ts`, `jest-compatibility.test.ts`, `path-alias*.test.ts`,
  `simple*.test.ts` test the test runner.
- 19 passing tests are in `examples/testing-demo`, a separate demo class unrelated to the app.
- The 11 failures are the "real" integration tests: they need `docker`, `nginx`, `psql` and a server on
  :3000 (`tests/integration/*.ts`). The database test uses PostgreSQL, which the app does not use.
- Playwright specs in `.playwright/` target the stub's static HTML (`data-testid` attributes in
  `src/index.ts:293-318`), so they pass against a page that does nothing.
- `coverage/` is committed.
- CI (`.github/workflows/test.yml`) runs lint, unit, smoke, performance, integration and Playwright;
  `deploy.yml` builds only the stub image and only for `linux/amd64` (no `platforms:`), which is why
  the image cannot be pulled on arm64.

## Repository state

- No `LICENSE` file; the README shows an MIT badge.
- `github.com/ataiva-software/kontainers` exists and its `main` and tags are at the same commits as
  `github.com/ao/kontainers` (`main` = `c665221`, `v0.1.0` = `c680ed3`, `v0.1.1` = `c665221`). They are
  the same copy. Seven files link to `ataiva-software`.
- History: 72 commits, 64 authored as an address that must be rewritten before any push (session rule).
- Version strings disagree: root `package.json` 1.0.0, stub reports 1.0.0, health route reports 2.0.0,
  tags are 0.1.x.
