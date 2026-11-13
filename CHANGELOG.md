# Changelog

## 0.2.0

A rewrite. Nothing from 0.1.x carries over, including its data.

0.1.x is unsafe: the published image accepted any username and password as an administrator and
let unauthenticated requests control Docker. Stop and remove it.

- One image and one process. Server-rendered pages, SQLite state in `/data`, Caddy for the proxy.
- First-run setup with a one-time token from the log; no default account.
- Server-side sessions, CSRF tokens, origin and Host checks, login rate limiting, argon2id passwords.
- Listens on 127.0.0.1 by default; refuses plain-HTTP non-loopback binds outside the image.
- Containers, images, networks and volumes. Host bind mounts off by default; published ports
  default to 127.0.0.1.
- Proxy rules from hostname and path to a container port, with ACME certificates. Targets that
  compose recreates are reconnected; the Proxy page shows target state and certificate expiry.
- Update image: pull again and recreate a kontainers-created container with the same settings,
  restoring the old one if the new one fails. Live CPU, memory, network and process counts on the
  container page. Proxy rules can be edited in place.
- Containers are never force-removed; paused containers can be unpaused; a container that fails to
  start is not left behind. Commands use shell quoting without a shell.
- `compose.yaml` using docker-socket-proxy.
- `kontainers backup FILE`, `/healthz`, `/readyz`.
- Test suites: unit, API against dind, image, Playwright, and proxy against Pebble.
