# kontainers: one image, one process (plus Caddy when the proxy is on).
FROM caddy:2.11.8 AS caddy

FROM oven/bun:1.4.4-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libcap2-bin \
 && rm -rf /var/lib/apt/lists/*
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
# Caddy runs as the unprivileged "bun" user and only needs to bind 80 and 443.
RUN setcap cap_net_bind_service=+ep /usr/bin/caddy \
 && apt-get purge -y libcap2-bin && apt-get autoremove -y \
 && mkdir -p /data && chown bun:bun /data

WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production
COPY src ./src

# Inside the container the app listens on all interfaces; the port publish is the boundary.
# Publish it on 127.0.0.1 only (-p 127.0.0.1:8080:8080) unless TLS is in front.
ENV KONTAINERS_LISTEN=0.0.0.0:8080 \
    KONTAINERS_IN_CONTAINER=1 \
    KONTAINERS_DATA=/data \
    KONTAINERS_CADDY_BIN=/usr/bin/caddy
VOLUME /data
EXPOSE 8080
USER bun
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:8080/healthz'); process.exit(r.ok ? 0 : 1)"]
ENTRYPOINT ["bun", "src/main.ts"]
