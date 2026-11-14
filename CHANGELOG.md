# Changelog

## 0.2.1

- kontainers recognises its own container, and under compose the rest of its project (the socket
  proxy), and offers no Stop, Restart, Remove or Update for them; the server refuses those actions
  too. Before, one click could stop the UI or cut it off from Docker.
- An HTTPS proxy rule with a wildcard hostname (`*.example.com`) is refused with an explanation.
  Let's Encrypt issues wildcard certificates only over a DNS challenge, which kontainers does not
  do, so such a rule waited for a certificate forever. Wildcards still work over plain HTTP.
- With the proxy on, kontainers' container joins the proxy network so Caddy can reach the targets,
  and the UI answered there too: any proxy target container could reach the login page. The UI
  now refuses connections from that network (except its gateway, the host side).
- Failed logins are counted before the password check. Before, many guesses sent at the same time
  all passed the limit check, so the 5-per-username and 20-per-address limits did not hold.
- A proxy rule can no longer target kontainers itself or the container that serves its Docker API
  (the socket proxy in `compose.yaml`). Such a rule connected the socket proxy to the proxy
  network, where every target could use the Docker API, and Caddy would have served that API on
  ports 80 and 443. Rules saved earlier are kept but not served, the Proxy page says why, and the
  socket proxy is taken off the proxy network.
- The Host check took hex-only names such as `cafe` for IPv6 addresses; IPv6 is now accepted only
  in brackets (`[fd00::1]:8080`).
- "Environment (values hidden)" showed the second and later lines of a multi-line value.
- `KONTAINERS_SELF_CONTAINER` names kontainers' container when its hostname is not the container ID.
- First-run setup could create more than one account when several requests with the right token
  arrived at once (the token was given up only after the password hash). It is now claimed first.
- A new look: a container-yard palette, each container row's state shown as a stripe down its left
  edge, the current page marked in the navigation, and the proxy rules shown before the form.
- `SECURITY.md` with private vulnerability reporting; Dependabot for the base images and actions.
- README: screenshots, measured download size, memory and start time, and a shorter start.

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
