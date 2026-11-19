# Changelog

## Unreleased

- Update image and automatic updates work for containers kontainers did not create: compose and
  `docker run` ones. They are copied whole from `docker inspect` at the daemon's own API version
  (privileges, limits, labels, healthchecks, per-network aliases, links and addresses, and
  anonymous volumes included), with the old image's defaults left to the new image. The copy is
  created and compared with the old container before the old one stops, so a copy that would lose
  something changes nothing. Compose's record of the image is set to what compose would record
  (the image ID, or the platform manifest digest with Docker 29's containerd image store), so
  `docker compose up -d` afterwards does not recreate the container. When the new image changes
  the user or a data directory in a volume that the container shares with the old image, the
  update is refused rather than guessed. Refused too: `--rm` containers, digest-pinned
  references, swarm tasks, containers whose namespaces or volumes others use, and kontainers' own
  compose project.
- Every Update image stops the old container with its own stop timeout (compose's
  `stop_grace_period`), not 10 seconds. An update that fails or is held back points the tag back
  at the image the container runs, so `docker compose up -d` does not install the failed one.
- After a restart in the middle of an update, a stop kontainers had begun is waited for, and the
  old container is started again.
- The label `kontainers.autoupdate=true` opts a container into automatic updates from its own
  configuration (a compose file), and keeps it opted in when compose recreates it.
- Before a migration the database is copied to `/data/backups/before-schema-N-...db`; without the
  copy there is no migration. Daily copies are kept too (`KONTAINERS_BACKUP_KEEP`, 7; 0 turns them
  off), listed on the Settings page with download links.

## 0.5.0

Two-factor login, and an update window and delay for automatic updates.

Upgrading from 0.4.x:

- Take a backup first (`docker exec kontainers bun src/main.ts backup /data/pre-0.5.db`): the
  database is migrated at the first start (schema 5 to 7: settings, first-seen times of images,
  two-factor keys and recovery codes), and 0.4.x refuses to open the migrated one.
- Nothing else changes in `compose.yaml` or the `docker run` command; the new settings are on the
  Settings page, and the two environment variables below are optional.

- Two-factor login, per account, on the Settings page: a code from an authenticator app (TOTP)
  after the password, or one of ten one-time recovery codes. Turning it on logs out the account's
  other sessions; replacing or removing the key needs the password. 20 wrong codes within 24
  hours lock the account's second step for 24 hours from the first of them (a successful login
  before then starts the count again; another account turning the user's two-factor off, or a
  restart, ends the lock), and the next login says how many wrong codes were entered since the
  last one. Another account can turn it off for a user, and so can
  `docker compose exec kontainers bun src/main.ts reset-2fa USERNAME` on the host
  (`docker exec <container> ...` without compose).
- Automatic updates can be limited to an update window (hours in UTC, days of the week) and wait a
  number of hours after a newer image is first seen (Settings, or `KONTAINERS_AUTOUPDATE_WINDOW`
  and `KONTAINERS_AUTOUPDATE_DELAY_HOURS`). A container that waits says until when.
- README: images and links by full address, so the Docker Hub description shows them.

## 0.4.1

- The image stores the Caddy binary once. 0.4.0 copied it in and then gave it the capability to
  bind ports 80 and 443 in a second layer, which holds a full copy: the download is 101.9 MB
  (arm64) and 102.3 MB (amd64) on Docker Hub, against 118.5 and 120.5 MB for 0.4.0.
- The 0.4.0 notes below said its download was about 17 MB larger than 0.3.0's; it was 36 MB larger
  (82.5 to 118.5 MB on arm64, 85.0 to 120.5 MB on amd64), 16.5 MB of it the copy above.

## 0.4.0

Automatic updates with rollback, notifications, Edit settings, registry logins, Clean up, an
Activity page, and a Containers page for hosts with hundreds of containers.

Upgrading from 0.3.0:

- Take a backup first (`docker exec kontainers bun src/main.ts backup /data/pre-0.4.db`): the
  database is migrated at the first start, and 0.3.0 refuses to open the migrated one.
- With `docker run`, add `--stop-timeout 30`, so kontainers has time to put a container back if it
  is stopped in the middle of an update. With your own compose file, change the image tag, add
  `stop_grace_period: 30s` to the kontainers service and `AUTH: 1` to docker-proxy (it lets
  kontainers check a registry login); the repository's `compose.yaml` has all three.
- Registry logins create `/data/registry.key`, which the database backup leaves out: back up the
  data volume, or enter the passwords again after restoring a database backup elsewhere.

### New

- Automatic updates, opted in per container created in kontainers. After an update check finds a
  newer image, the container is recreated with the same settings, volumes, networks, aliases and
  fixed addresses, and watched for 30 s (`KONTAINERS_AUTOUPDATE_SETTLE`), then until it is
  healthy if it has a healthcheck (`KONTAINERS_AUTOUPDATE_HEALTH_TIMEOUT`, 120 s). If it stops,
  restarts or turns unhealthy, the old container is put back and that image is held back until a
  newer one appears. A stop someone asks for meanwhile is not counted as a failure.
- Updates that are interrupted (kontainers stopped or killed, the Docker daemon restarted) are
  finished at the next start from a record written before anything is stopped. A container is
  removed only on clear evidence; otherwise both are left, and the Activity page (and a
  notification, to targets that take automatic-update events) says to check them by hand.
- Notifications to webhooks (JSON) and ntfy topics: a newer image (once per image, naming the
  containers that use it), an automatic update and its result, a container that stopped on its
  own (crash, error exit, probably out of memory), unhealthy and healthy again, and a certificate
  that is missing or close to expiry. Settings has a Send test button and each target's last
  result. Notifications are never sent to the Docker API kontainers uses, by any name or address,
  or to link-local (cloud metadata) addresses, and redirects are not followed.
- Edit settings, for containers created in kontainers: image, command, ports, environment, volumes
  and restart policy. Bad input and an image that is not on the host are refused before the old
  container is stopped; the form keeps what was typed after an error.
- Registry logins for private images (Docker Hub, GHCR, your own registry), used for pulls and
  update checks and checked before they are saved. Passwords are stored encrypted with a key in
  the data volume (`registry.key`) that the database backup leaves out.
- Clean up (from Images): untagged images, unused tagged images, unused networks and unused
  anonymous volumes, listed with sizes before anything is removed. Anything a container uses,
  running or stopped, stays; images built on the host and named volumes are never removed in bulk.
- An Activity page: every action and failed attempt, by whom and from where, and what kontainers
  did on its own, searchable and kept for a year.
- Containers page: search, a filter for running, stopped and "needs attention", grouping by compose
  project with Start all, Restart all and Stop all, and the filter kept in the address. A
  container page shows the command, ports, restarts and why its healthcheck fails.
- Logs: a filter, 300 to 5000 lines, timestamps on or off, and a download of the last 10000 lines
  (up to 100000 with `?tail=` in the address).
- Phones: every page fits a 390-pixel screen. A browser test checks accessibility (axe-core,
  WCAG 2.0 A and AA) on every page at desktop size and on every page after login at phone size.

### Changed

- Only kontainers itself and the container that serves its Docker API are protected from Stop,
  Restart, Remove and Update (before: every service in kontainers' compose project).
- Container pages and their actions are addressed by name, so a page left open survives a
  recreation.
- Stop, Start, Restart and Remove are refused while the same container is being updated or edited;
  one update or edit runs at a time per container.
- A hostname's proxy rules must all be HTTPS or all plain HTTP. HTTPS rules for names over 230
  characters are refused (the certificate could never be stored).
- `DOCKER_HOST=tcp://host` without a port means port 2375, as in Docker.
- Update image now watches the new container for 5 s, as Edit settings does, and puts the old one
  back if it stops, restarts or turns unhealthy. Update image, Edit settings and automatic updates
  wait while an interrupted update of the same container is not tidied up yet.
- A hostname whose existing rules mix HTTPS and plain HTTP keeps working, but a rule of it can be
  edited only into the same scheme as the others.
- The image is built on Caddy 2.11.8 and Bun 1.4.4 (0.3.0: 2.10.2 and 1.3.1); the download is about
  17 MB larger.

### Fixed

- Update image dropped anonymous volumes (an image's `VOLUME`, such as a database's data
  directory), so the new container started empty; it put every container on the default bridge
  network, even one kept on an internal network; and it lost network aliases and fixed addresses.
- Update image copied the old image's environment and command into the new container when that
  image had been deleted (a `docker build` reusing the tag); it now refuses.
- Two Update image clicks at once could leave the old container running beside the new one.
- Update checks missed containers left on an old image after a `docker pull` (Docker then lists
  the image by ID), reported every
  locally built image as having a newer one on Docker's containerd image store, and could take
  minutes with a slow registry (Check for updates now answers within 20 s and carries on).
  With docker-socket-proxy, a refused registry lookup now says which setting to turn on.
- Removing or disabling a proxy rule left its container on the proxy network. The proxy network is
  made again if it is missing.
- With a full data volume, actions that worked were reported as "internal error" and a login gave
  a 500; kontainers now starts, says the volume is full on every page, and keeps working.
- Log responses were unbounded; a page keeps the newest 2 MB, a download up to 20 MB.
- Long names, hostnames and paths pushed tables far off the screen.
- The New container form lost what was typed after an error; several tabs showed only the last
  outcome.
- Editing a proxy rule into another rule's hostname and path gave "internal error"; a wildcard
  rule was shown as a link.
- Creating a volume whose name exists was reported as done; trailing spaces in environment values
  were dropped; international hostnames are stored in punycode and shown as written.
- Stop of a stopped container and Start of a running one gave "Not Modified".

The full list of changes made while 0.4.0 was developed and tested, with the problems that
exploratory testing found, is in the commit history (pull request #14).

## 0.3.0

- Update checks. Every 6 hours (`KONTAINERS_UPDATE_CHECK_HOURS`, `0` for never) and on "Check for
  updates", kontainers asks the registry, through the Docker daemon, which image each container's
  tag points at now. Only manifests are fetched, no layers. Containers running an older image are
  marked on the list and their page, including ones left on an old image after a `docker pull`;
  for containers kontainers created, Update image is then the highlighted action.
- `compose.yaml`: the socket proxy also allows `DISTRIBUTION=1` (read-only registry lookups).
  Without it, update checks report that they were refused and say how to fix it.

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
