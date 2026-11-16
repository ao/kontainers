# Changelog

## Unreleased

- Fixed: Update image, Edit settings and automatic updates dropped anonymous volumes (an image's
  VOLUME, such as a database's data directory): the new container started empty and the data
  was left in a dangling volume. The container's actual mounts are now carried over by name.
- If kontainers stops in the middle of an update or an edit, it tidies up when it starts again: a
  container left set aside as `<name>-old-<id>` is put back if nothing has its name, or removed
  if the new container is running.
- Fixed: when the image a container was made from was gone (a `docker build` that reused the
  tag deletes it), Update image copied that image's environment and command into the new
  container. It now refuses and points to Edit settings, before pulling or stopping anything.
- Fixed: two updates of one container at once could leave the old one running beside the new
  one; the second is now refused. A 120-character name no longer makes Update stop and restart
  the container for nothing (the set-aside name is shortened to fit).
- Fixed: with a full data volume, a Stop or Start that worked was reported as "internal error"
  (writing the activity entry failed), a session could end, and a new login gave a 500. Now the
  action's own outcome is shown with a note that it could not be recorded, logged-in users keep
  working, and the login page says the data volume is full. The activity entry's target is cut
  to 200 characters.
- Fixed: removing, disabling or retargeting a proxy rule left its container on the proxy
  network, in reach of every other target. Containers no enabled rule points at are now
  disconnected (kontainers itself stays). The proxy network is made again if it is missing, for
  example when the Docker API was not reachable at start, and the Proxy page says when it
  cannot be.
- Fixed: update checks missed a container left on an old image after a `docker pull` (the list
  then shows an image ID, so the container's own reference is used), and on Docker's containerd
  image store every locally built image was "newer image available", kontainers included: a
  digest the registry never served now counts as built on this host. Registry errors are put
  in words. Four images are checked at a time, and Check for updates answers within 20 s,
  carrying on in the background when a registry is slow.
- Fixed: long names, hostnames and paths pushed tables far off the screen (2400-4400 px wide);
  table cells now wrap, and a container's ports are listed by host port.
- Fixed: a mistake in the New container form discarded everything typed; the form now comes
  back filled in, with the error. Several actions at once in one session (two tabs) each show
  their outcome instead of the last one only.
- The container page shows the command, published ports, how often the container restarted,
  and for an unhealthy one the last healthcheck's output; unhealthy rows get the warning stripe.
  Networks and volumes are sorted and say which containers use each.
- Input: international hostnames are stored in punycode; length limits for names and
  environment values say what the limit is; trailing spaces in environment values are kept; a
  stray space in an image to pull is ignored; creating a volume whose name exists is refused
  (Docker answered as if it had made it).
- The Proxy page says when nothing answers on a rule's target port (visitors would get a 502):
  kontainers tries a connection from its own container every 10 seconds.
- A hostname's rules must all be HTTPS or all plain HTTP. With a mix, each rule answered only on
  its own scheme and the HTTPS rule's redirect from HTTP went to the plain one.
- Container pages, their actions, logs and usage are addressed by container name, not ID, so a
  page left open keeps working after `docker compose up` or an update recreates the container.
- Fixed: log responses were unbounded (a container that printed a 20 MB line made a 40 MB
  response and spiked memory). Logs are read as a stream and the page keeps the newest 2 MB,
  saying how much earlier output it leaves out; a download keeps up to 50 MB.
- Fixed: editing a rule into another rule's hostname and path gave "internal error"; HTTPS rules
  for names over 230 characters are refused (Caddy's lock file name was too long, so the
  certificate never came and the page blamed DNS). A wildcard rule is no longer shown as a link,
  and the remove prompt names the path too.
- Changed: only kontainers itself and the container that serves its Docker API (found from
  `DOCKER_HOST`, by name, compose service or address, and looked up again every 30 s) are
  protected from Stop, Restart, Remove and Update. Before, every service in kontainers' compose
  project was, which locked out anyone who added kontainers to an existing compose file.
- Containers page: a search box (name, image or compose project) that filters as you type, a Show
  filter (all, running, stopped, needs attention), and rows grouped by compose project with a
  running count per project. "Needs attention" means restarting, dead, unhealthy, or exited with
  an error code (not 0, 130, 137 or 143); the count links to the filter. Filters are in the URL
  and work without script.
- Automatic updates, opted in per container on its page, for containers created in kontainers.
  The new container is watched while it settles (30 s, then until healthy if it has a
  healthcheck); if it stops, restarts or turns unhealthy, the old one is put back, the image is
  held back, and a newer image is tried at a later check. Update image now also watches the new
  container for 5 s and rolls back if it stops.
- Notifications to webhooks (JSON) and ntfy topics: newer image, automatic update result,
  container stopped on its own (crash, error exit, out of memory), unhealthy and recovered,
  certificate missing or about to expire. Each fact is sent once (crash loops: once per 10
  minutes). Settings lists targets with their last result and has a test button.
- The container page says when a container was stopped for running out of memory.
- Edit settings, for containers created in kontainers: image, command, ports, environment, volumes
  and restart policy, shown filled in. Saving recreates the container under the same name and on
  the same networks, watched for 5 s, with the old one put back if the new one fails. Bad input
  is refused before the old container is stopped. Host paths it already has may stay; new ones
  follow `KONTAINERS_ALLOW_BIND_MOUNTS`.
- New container: an option to update it automatically.
- Phones: the header puts the name on its own line and the navigation below; only the
  Containers table drops its ports column on a narrow screen (before, every table lost its fourth
  column). A browser test runs axe-core (WCAG 2 A and AA) on every page at desktop and phone
  size and checks that no page is wider than a 390-pixel screen.
- An Activity page: who did what and when, from which address, newest first, 100 a page, with a
  search. Failed attempts are recorded too, with the error, and so is what kontainers does on its
  own (automatic updates). Entries older than a year are removed.
- Logs on the container page: a filter that shows only matching lines (with a count), 300, 1000
  or 5000 lines, timestamps on or off, and a download of the last 10000 lines (up to 100000 with
  `?tail=`) as a file named after the container.
- Clean up (linked from Images): untagged images, tagged images no container uses, networks no
  container uses, and anonymous volumes no container mounts, each listed with sizes before
  removal. Stopped containers count as users. Named volumes are never removed in bulk. Items are
  removed one by one and never forced, so anything that came into use meanwhile is kept.

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
