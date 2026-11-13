# Kontainers: plan

Based on `docs/ASSESSMENT.md`.

## Status (2026-11-13)

Done, with tests, on the rewrite branch: 1.1, 1.2, 2.1-2.7, 3.1-3.4, 4.1, 4.2, 4.4, 5 (README,
licence, CI). Run `scripts/test.sh`: 114 unit, 47 API, 4 image, 8 browser, 9 proxy/ACME tests and
the compose check pass in containers.

Differences from the plan as written:

- 2.1: before setup, page GETs redirect to `/setup` (303) instead of returning 401; API paths and
  POSTs return 401. Logins likewise redirect to `/login`.
- 2.6: no `dockerode`; a small typed client (`src/docker.ts`) sends only fields it builds itself.
  docker-socket-proxy does not filter `/containers/{id}/exec` creation, only `/exec/*/start`;
  documented in `compose.yaml`.
- 2.7: Caddy (embedded, admin API on a unix socket) instead of `acme-client` + nginx. Renewal is
  Caddy's (when a third of the lifetime remains); it is not exercised by the tests.
- 3.1: logs are polled every 2 s rather than streamed over a WebSocket, so there is no WebSocket
  endpoint to secure.
- 4.3: there is no earlier release with this schema, so the upgrade test starts with 0.2.1.
  Migrations refuse a newer schema (tested).

Still open: item 4 below (history rewrite), then the push, PR and release.

## Owner decisions

Decided 2026-11-12: scope (a) narrow rewrite; licence MIT; canonical repo `github.com/ao/kontainers`;
Docker Hub: put a "do not use" warning in the description now and keep the tags until a fixed release
replaces them. Still open: item 4 (history rewrite permission).

1. **Scope.** The assessment shows neither codebase works, so the choice is between:
   - (a) **Narrow rewrite (recommended):** one container, one port, one small UI. Containers (list,
     start, stop, restart, remove, logs), images, networks, volumes, and domain → container proxy
     rules with Let's Encrypt. Keep the Elysia/React layout but rebuild the backend; drop the WAF,
     load balancing, analytics, custom-nginx and ModSecurity features.
   - (b) **Archive:** mark the repo and Docker Hub image unsafe, point users to existing tools, stop.
   - (c) Fix the existing `backend/` as written. Not recommended: most features are mocks, and the
     nginx-config surface is large and hard to make safe.
2. **Licence.** No `LICENSE` file; the README shows MIT. Which licence?
3. **Canonical repo.** `ao/kontainers` and `ataiva-software/kontainers` are at identical commits.
   Which one is canonical, and should the other be archived with a pointer?
4. **History rewrite.** 64 commits carry an address that must be removed before any push. The
   rewrite scripts (backup bundle, `git-filter-repo` in Docker with a mailmap, checks, leased
   force-push) were blocked by this session's permission system, so the owner needs to allow them
   or run them.
5. **Docker Hub image.** `ataiva/kontainers:latest` is the unsafe stub. Deprecate it now (update the
   description to say "do not use", or delete the tags) instead of waiting for a fixed release?

The tasks below assume (a).

## 1. Runs from a clean install

**1.1 One workspace, one lockfile, one image.** Root `package.json` declares workspaces; `bun.lock`
covers all of them; delete `package-lock.json`, `src/index.ts` (the stub), committed `coverage/`, and
`examples/`. A multi-stage `Dockerfile` builds the frontend and serves it from the backend on one port.
- Accept: `docker build .` succeeds from a clean clone on amd64 and arm64; `bun install --frozen-lockfile`
  passes in CI; the container starts and `GET /healthz` returns 200.

**1.2 Documented run command.** A `compose.yaml` and a single `docker run`, both publishing
`127.0.0.1:8080:8080` and using a named data volume.
- Accept: a CI job runs the README command verbatim against docker-in-docker and reaches the setup page.

## 2. Safe by default

**2.1 First-run admin setup, no default password.** If no user exists, the only working route is
`/setup`, which takes a one-time token printed to the container log; it creates the first admin and
then disables itself. Remove public registration and returned reset tokens.
- Accept: API tests show every route except `/healthz`, `/setup` and `/login` returns 401 before setup;
  setup without the token fails; a second setup attempt fails; `POST /register` does not exist.

**2.2 Sessions.** Server-side sessions in SQLite; cookie `HttpOnly`, `SameSite=Strict`, `Secure` when
served over HTTPS, rotated at login, idle and absolute expiry, revoked on logout and password change.
Passwords hashed with argon2id (Bun built-in `Bun.password`). No JWT, no `localStorage` tokens.
- Accept: tests for expiry, logout revocation, fixation (session ID changes on login), cookie flags.

**2.3 CSRF.** Double-submit token on every state-changing request plus an `Origin`/`Host` check;
WebSocket upgrades check `Origin` and the session.
- Accept: a cross-origin POST with a valid cookie and no token is rejected; a WebSocket from another
  origin is rejected.

**2.4 Login rate limiting.** Per-account and per-IP limits, keyed on the socket address; trust
`X-Forwarded-For` only from a configured proxy list.
- Accept: the 6th bad attempt in a minute returns 429; a spoofed `X-Forwarded-For` does not reset it.

**2.5 Private bind.** Listens on `127.0.0.1` unless `KONTAINERS_LISTEN` says otherwise; refuses a
non-loopback bind over plain HTTP unless `KONTAINERS_ALLOW_INSECURE=1`.
- Accept: test that the default bind is loopback and that a `0.0.0.0` bind without TLS exits non-zero.

**2.6 Docker access.** Talk to Docker only through `dockerode` with typed parameters (no CLI, no
shell). Validate IDs and names against Docker's formats. Container create rejects host bind mounts,
`--privileged`, host network/PID and added capabilities unless an admin enables them in settings.
Document the socket's risk and ship a compose example with `tecnativa/docker-socket-proxy`
limited to the endpoints used.
- Accept: security tests that IDs like `--help` or `../x` are rejected, that a bind of `/` is refused by
  default, and that the app works through the socket proxy in the integration suite.

**2.7 Certificates.** Replace the mock with `acme-client`, HTTP-01, staging by default, keys at 0600,
renewal at 30 days left, failures surfaced in the UI. The proxy is generated from structured fields
only (no free-form nginx); use Caddy or nginx with validated hostnames and upstreams.
- Accept: integration test against Pebble in Docker issues, serves and renews a certificate; tests
  that a hostname with a newline, `;` or `{` is rejected.

## 3. Core features, tested

Each feature ships with unit tests, API tests against docker-in-docker, and a Playwright flow.

- **3.1 Containers:** list, inspect, start, stop, restart, remove, logs (streamed over WebSocket).
- **3.2 Images:** list, pull, remove.
- **3.3 Networks and volumes:** list, create, remove.
- **3.4 Proxy rules:** create, edit, enable, delete, persisted in SQLite and restored on restart; the
  generated config is tested for each rule shape.
- **3.5 Exec:** out of scope unless the owner wants it (it is a shell on every container).
- Accept for all: the API suite passes against a fresh dind daemon in CI, including failure paths
  (daemon down, image missing, container gone mid-request, app restart with rules present).

## 4. Operable

- **4.1 Config** from environment variables, documented in one table.
- **4.2 State** in one data volume (SQLite + certificates); `kontainers backup` writes a consistent
  snapshot; restore is documented and tested.
- **4.3 Upgrades:** schema migrations run on start and are tested from the previous release's data.
- **4.4 Health:** `/healthz` (process) and `/readyz` (DB and Docker reachable), unauthenticated, no
  internal details.
- Accept: test that upgrades a v-previous data volume; test that `/readyz` fails when the daemon is gone.

## 5. Docs and repo text

- README rewritten to match the code, with the risk of the Docker socket stated plainly.
- Links and badges point to the canonical repo; licence file added.
- CI: GitHub Actions running unit, API (dind), Pebble, Playwright and security tests; multi-arch image
  built in CI and pushed only on a tag (owner's step).
