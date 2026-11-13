#!/bin/sh
# Runs the test suites in containers. Nothing runs on the host and nothing is published:
# the Docker daemon under test is a throwaway docker:dind on a private network.
#
#   scripts/test.sh            unit + API (with dind)
#   scripts/test.sh unit       unit only
#   scripts/test.sh api        API only
#   scripts/test.sh image      build the image and smoke-test it behind the socket proxy
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
  docker rm -f "$APP" "$SOCKPROXY" "$DIND" >/dev/null 2>&1 || true
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

if [ "$SUITE" = all ] || [ "$SUITE" = api ] || [ "$SUITE" = image ]; then
  start_dind
fi

if [ "$SUITE" = all ] || [ "$SUITE" = api ]; then
  bun_run -e KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 "$BUN_IMAGE" bun test --timeout 120000 tests/api
fi

if [ "$SUITE" = all ] || [ "$SUITE" = image ]; then
  docker build -q -t kontainers:test . >/dev/null
  # Same settings as compose.yaml. The proxy reads dind's socket from the shared volume.
  docker run -d --name "$SOCKPROXY" --network "$NET" --network-alias docker-proxy \
    -v "$SOCKVOL":/var/run -e CONTAINERS=1 -e IMAGES=1 -e NETWORKS=1 -e VOLUMES=1 -e POST=1 \
    -e ALLOW_START=1 -e ALLOW_STOP=1 -e ALLOW_RESTARTS=1 tecnativa/docker-socket-proxy:0.3.0 >/dev/null
  # No -p: the test container joins the app's network namespace and uses 127.0.0.1.
  docker run -d --name "$APP" --network "$NET" -e DOCKER_HOST=tcp://docker-proxy:2375 kontainers:test >/dev/null
  i=0
  until docker logs "$APP" 2>&1 | grep -q 'setup token'; do
    i=$((i + 1)); [ $i -gt 30 ] && { docker logs "$APP"; exit 1; }; sleep 1
  done
  TOKEN=$(docker logs "$APP" 2>&1 | sed -n 's/.*setup token: \([^ ]*\).*/\1/p' | head -1)
  [ "$(docker exec "$APP" id -u)" != 0 ] || { echo "image runs as root"; exit 1; }
  docker run --rm --network "container:$APP" -v "$CACHE":/cache -v "$PWD":/app -w /app \
    -e KONTAINERS_TEST_URL=http://127.0.0.1:8080 -e KONTAINERS_TEST_SETUP_TOKEN="$TOKEN" \
    -e KONTAINERS_TEST_SOCKET_PROXY=tcp://docker-proxy:2375 \
    "$BUN_IMAGE" bun test --timeout 120000 tests/image
fi
