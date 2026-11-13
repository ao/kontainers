#!/bin/sh
# Runs the test suites in containers. Nothing runs on the host and nothing is published:
# the Docker daemon under test is a throwaway docker:dind on a private network.
#
#   scripts/test.sh            everything below, in order
#   scripts/test.sh unit       typecheck and unit tests
#   scripts/test.sh api        the server process against dind
#   scripts/test.sh image      build the image and smoke-test it behind the socket proxy
#   scripts/test.sh e2e        Playwright (Chromium) against the image
#   scripts/test.sh proxy      proxy rules and certificates against Pebble, all inside dind
#   scripts/test.sh renewal    Pebble issues 90-second certificates; Caddy must renew them on its own
#   scripts/test.sh compose    the README compose instructions, verbatim, inside dind
#
# Env: BUN_IMAGE (default oven/bun:1.3.1), CACHE_VOLUME (default kontainers-test-cache)
set -eu

cd "$(dirname "$0")/.."
SUITE=${1:-all}
BUN_IMAGE=${BUN_IMAGE:-oven/bun:1.3.1}
CACHE=${CACHE_VOLUME:-kontainers-test-cache}
ID=$$
NET=kontainers-test-$ID
DIND=kontainers-dind-$ID

APP=kontainers-app-$ID
SOCKPROXY=kontainers-sockproxy-$ID
SOCKVOL=kontainers-dindsock-$ID

cleanup() {
  if [ -n "${KEEP:-}" ]; then echo "KEEP set: left $DIND, $NET and $SOCKVOL running; remove them with docker rm -f / network rm / volume rm"; return; fi
  docker rm -f -v "$APP" "$SOCKPROXY" "$DIND" >/dev/null 2>&1 || true
  docker volume rm "$SOCKVOL" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}

start_dind() {
  # TLS off is safe here: the daemon is reachable only on this private network and publishes no port.
  docker run -d --privileged --name "$DIND" --network "$NET" --network-alias dind \
    -v "$SOCKVOL":/var/run -e DOCKER_TLS_CERTDIR= docker:28-dind \
    --host=tcp://0.0.0.0:2375 --host=unix:///var/run/docker.sock >/dev/null
  i=0
  until docker exec "$DIND" docker version >/dev/null 2>&1; do
    i=$((i + 1)); [ $i -gt 60 ] && { docker logs "$DIND"; exit 1; }; sleep 1
  done
}
trap cleanup EXIT INT TERM

bun_run() {
  docker run --rm --network "$NET" \
    -v "$CACHE":/cache -e BUN_INSTALL_CACHE_DIR=/cache/bun \
    -v "$PWD":/app -w /app "$@"
}

docker network create --internal=false "$NET" >/dev/null
bun_run "$BUN_IMAGE" bun install --frozen-lockfile
bun_run "$BUN_IMAGE" ./node_modules/.bin/tsc --noEmit

if [ "$SUITE" = all ] || [ "$SUITE" = unit ]; then
  bun_run "$BUN_IMAGE" bun test tests/unit
fi

if [ "$SUITE" != unit ]; then
  start_dind
fi

if [ "$SUITE" = all ] || [ "$SUITE" = api ]; then
  bun_run -e KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 "$BUN_IMAGE" bun test --timeout 120000 tests/api
fi

# A fresh app container from the image, Docker API through the socket proxy as in compose.yaml.
# No -p: test containers join the app's network namespace and use 127.0.0.1. Sets TOKEN.
start_app() {
  if ! docker inspect "$SOCKPROXY" >/dev/null 2>&1; then
    docker build -q -t kontainers:test . >/dev/null
    # The proxy reads dind's socket from the shared volume.
    docker run -d --name "$SOCKPROXY" --network "$NET" --network-alias docker-proxy \
      -v "$SOCKVOL":/var/run -e CONTAINERS=1 -e IMAGES=1 -e NETWORKS=1 -e VOLUMES=1 -e POST=1 \
      -e ALLOW_START=1 -e ALLOW_STOP=1 -e ALLOW_RESTARTS=1 tecnativa/docker-socket-proxy:0.3.0 >/dev/null
  fi
  docker rm -f "$APP" >/dev/null 2>&1 || true
  docker run -d --name "$APP" --network "$NET" -e DOCKER_HOST=tcp://docker-proxy:2375 kontainers:test >/dev/null
  i=0
  until docker logs "$APP" 2>&1 | grep -q 'setup token'; do
    i=$((i + 1)); [ $i -gt 30 ] && { docker logs "$APP"; exit 1; }; sleep 1
  done
  TOKEN=$(docker logs "$APP" 2>&1 | sed -n 's/.*setup token: \([^ ]*\).*/\1/p' | head -1)
}

if [ "$SUITE" = all ] || [ "$SUITE" = image ]; then
  start_app
  [ "$(docker exec "$APP" id -u)" != 0 ] || { echo "image runs as root"; exit 1; }
  docker run --rm --network "container:$APP" -v "$CACHE":/cache -v "$PWD":/app -w /app \
    -e KONTAINERS_TEST_URL=http://127.0.0.1:8080 -e KONTAINERS_TEST_SETUP_TOKEN="$TOKEN" \
    -e KONTAINERS_TEST_SOCKET_PROXY=tcp://docker-proxy:2375 \
    "$BUN_IMAGE" bun test --timeout 120000 tests/image
fi

if [ "$SUITE" = all ] || [ "$SUITE" = e2e ]; then
  start_app
  docker run --rm --network "container:$APP" --shm-size=1g -v "$PWD":/app -w /app \
    -e KONTAINERS_TEST_URL=http://127.0.0.1:8080 -e KONTAINERS_TEST_SETUP_TOKEN="$TOKEN" \
    mcr.microsoft.com/playwright:v1.56.1-noble ./node_modules/.bin/playwright test
fi

# Pebble (a test ACME server) and the kontainers it issues certificates for, inside dind. Everything
# below runs inside dind, so kontainers manages the same daemon its targets run on, as on a real
# host. D runs a docker command against the dind daemon.
D() { docker exec -i "$DIND" docker "$@"; }
PEBBLE=ghcr.io/letsencrypt/pebble:latest
CHALL=ghcr.io/letsencrypt/pebble-challtestsrv:latest

# Starts Pebble, a DNS stub that points every name at kontainers, and kontainers with the proxy on.
# Sets KIP (kontainers' address on the test network) and TOKEN.
#   ACME_VALIDITY  lifetime in seconds of Pebble's default-profile certificates (default: its own, 90 days)
#   ACME_ENV       extra "-e NAME=value" options for kontainers
acme_stack() {
  docker build -q -t kontainers:test . >/dev/null
  docker pull -q "$PEBBLE" >/dev/null && docker pull -q "$CHALL" >/dev/null
  docker save kontainers:test "$PEBBLE" "$CHALL" | D load -q >/dev/null

  D network create kt >/dev/null
  docker exec "$DIND" mkdir -p /work
  t=$(D create "$PEBBLE")
  D cp "$t:/test/certs/pebble.minica.pem" - | docker exec -i "$DIND" tar -x -C /tmp
  D cp "$t:/test/config/pebble-config.json" - | docker exec -i "$DIND" tar -x -C /work
  D rm "$t" >/dev/null
  if [ -n "${ACME_VALIDITY:-}" ]; then
    # Every profile, not only "default": Pebble issued the "shortlived" profile's lifetime when an
    # order named no profile, so setting one profile is not enough.
    docker exec "$DIND" sed -i "s/\"validityPeriod\": [0-9]*/\"validityPeriod\": $ACME_VALIDITY/g" /work/pebble-config.json
    [ "$(docker exec "$DIND" grep -c "\"validityPeriod\": $ACME_VALIDITY\$" /work/pebble-config.json)" = "$(docker exec "$DIND" grep -c validityPeriod /work/pebble-config.json)" ] \
      || { echo "could not set Pebble validity"; exit 1; }
  fi
  GID=$(docker exec "$DIND" stat -c %g /var/run/docker.sock)
  D create --name kontainers --network kt --group-add "$GID" \
    -v /var/run/docker.sock:/var/run/docker.sock -v kdata:/data \
    -e DOCKER_HOST=unix:///var/run/docker.sock -e KONTAINERS_PROXY=1 \
    -e KONTAINERS_HTTP_PORT=5002 -e KONTAINERS_HTTPS_PORT=5001 \
    -e KONTAINERS_ACME_CA=https://pebble:14000/dir -e KONTAINERS_ACME_CA_ROOT=/etc/pebble-ca.pem \
    -e KONTAINERS_ACME_EMAIL=ci@kontainers-ci.dev -e KONTAINERS_PROXY_RECONCILE_MS=2000 ${ACME_ENV:-} kontainers:test >/dev/null
  docker exec "$DIND" chmod 644 /tmp/pebble.minica.pem
  D cp /tmp/pebble.minica.pem kontainers:/etc/pebble-ca.pem
  D start kontainers >/dev/null
  KIP=$(D inspect -f '{{(index .NetworkSettings.Networks "kt").IPAddress}}' kontainers)
  # Every DNS name resolves to kontainers, so Pebble's HTTP-01 / TLS-ALPN checks reach Caddy.
  D run -d --name challtestsrv --network kt "$CHALL" -defaultIPv4 "$KIP" -defaultIPv6 "" \
    -http01 "" -https01 "" -tlsalpn01 "" -doh "" -dnsserver :8053 -management :8055 >/dev/null
  D run -d --name pebble --network kt -e PEBBLE_VA_NOSLEEP=1 \
    -v /work/pebble-config.json:/test/config/pebble-config.json:ro "$PEBBLE" \
    -config test/config/pebble-config.json -dnsserver challtestsrv:8053 >/dev/null
  i=0
  until D logs kontainers 2>&1 | grep -q 'setup token'; do
    i=$((i + 1)); [ $i -gt 30 ] && { D logs kontainers; exit 1; }; sleep 1
  done
  TOKEN=$(D logs kontainers 2>&1 | sed -n 's/.*setup token: \([^ ]*\).*/\1/p' | head -1)

  docker cp tests "$DIND:/work/tests"
  docker exec "$DIND" cp /tmp/pebble.minica.pem /work/pebble-ca.pem
}

# Runs one suite's tests against the stack from acme_stack.
#   $1  test directory   $2  --add-host options for the names the suite uses
acme_driver() {
  # The driver runs as root with the dind socket so it can restart kontainers mid-test.
  set +e
  D run --rm --name driver --network kt --user root -v /var/run/docker.sock:/var/run/docker.sock -v /work:/app -w /app \
    $2 \
    -e KONTAINERS_TEST_URL="http://$KIP:8080" -e KONTAINERS_TEST_SETUP_TOKEN="$TOKEN" \
    -e KONTAINERS_TEST_PEBBLE_MGMT=https://pebble:15000 -e KONTAINERS_TEST_PEBBLE_CA=/app/pebble-ca.pem \
    -e KONTAINERS_TEST_CERT_VALIDITY="${ACME_VALIDITY:-7776000}" \
    --entrypoint bun kontainers:test test --timeout 180000 "$1"
  rc=$?
  set -e
  if [ $rc -ne 0 ]; then
    echo "--- certificates in kontainers storage"
    D exec kontainers sh -c 'for f in $(find /data/caddy -name "*.crt"); do echo "$f: $(grep -c BEGIN "$f") certificate(s)"; done' || true
    echo "--- pebble roots"
    D run --rm --network kt -v /work:/w --entrypoint bun kontainers:test -e '
      const { X509Certificate } = require("crypto"); const ca = require("fs").readFileSync("/w/pebble-ca.pem", "utf8");
      for (const p of ["roots/0", "intermediates/0"]) { const t = await (await fetch("https://pebble:15000/" + p, { tls: { ca } })).text(); const c = new X509Certificate(t); console.log(p, "subject:", c.subject.replace(/\n/g, ", "), "| issuer:", c.issuer.replace(/\n/g, ", ")); }' || true
    echo "--- kontainers log"; D logs kontainers 2>&1 | tail -60 | cut -c1-400; echo "--- pebble log"; D logs pebble 2>&1 | tail -20 | cut -c1-300; exit $rc; fi
}

# Removes the kontainers, Pebble and DNS stub containers, the volume and the network, so the next
# suite starts clean.
acme_teardown() {
  D rm -f kontainers pebble challtestsrv >/dev/null 2>&1 || true
  D volume rm kdata >/dev/null 2>&1 || true
  D network rm kt >/dev/null 2>&1 || true
}

if [ "$SUITE" = all ] || [ "$SUITE" = proxy ]; then
  acme_stack
  acme_driver tests/proxy "--add-host app.test:$KIP --add-host plain.test:$KIP --add-host nothing.test:$KIP"
  acme_teardown
fi

# Certificates last 90 seconds and Caddy checks every 10 seconds. Caddy renews when a third of the
# lifetime is left, so a renewal is due about every 60 seconds.
if [ "$SUITE" = all ] || [ "$SUITE" = renewal ]; then
  ACME_VALIDITY=90 ACME_ENV="-e KONTAINERS_ACME_RENEW_CHECK=10" acme_stack
  acme_driver tests/renewal "--add-host renew.test:$KIP"
  acme_teardown
fi

if [ "$SUITE" = all ] || [ "$SUITE" = compose ]; then
  # The README's compose instructions, verbatim, inside dind (so "127.0.0.1" is dind's loopback).
  docker image inspect kontainers:test >/dev/null 2>&1 || docker build -q -t kontainers:test . >/dev/null
  docker save kontainers:test | docker exec -i "$DIND" docker load -q >/dev/null
  docker exec "$DIND" docker tag kontainers:test ataiva/kontainers:0.2.0
  docker exec "$DIND" mkdir -p /compose
  docker cp compose.yaml "$DIND:/compose/compose.yaml"
  C() { docker exec -w /compose "$DIND" docker compose "$@"; }
  C up -d --quiet-pull 2>&1 | tail -3
  i=0
  until C logs kontainers 2>&1 | grep -q 'setup token'; do
    i=$((i + 1)); [ $i -gt 30 ] && { C logs; exit 1; }; sleep 1
  done
  i=0
  until docker exec "$DIND" wget -qO- http://127.0.0.1:8080/readyz 2>/dev/null | grep -q ready; do
    i=$((i + 1)); [ $i -gt 30 ] && { echo "readyz never passed"; C logs; exit 1; }; sleep 1
  done
  [ "$(C port kontainers 8080)" = 127.0.0.1:8080 ] || { echo "compose publishes $(C port kontainers 8080), expected 127.0.0.1:8080"; exit 1; }
  docker exec "$DIND" wget -qO- http://127.0.0.1:8080/setup | grep -q 'First-run setup' || { echo "setup page missing"; exit 1; }
  # The socket proxy is on an internal network with no published port.
  [ -z "$(C port docker-proxy 2375 2>/dev/null || true)" ] || { echo "docker-proxy port is published"; exit 1; }
  echo "compose: setup token printed, /readyz ok through docker-socket-proxy, only 127.0.0.1:8080 published"
  C down -v >/dev/null 2>&1
fi
