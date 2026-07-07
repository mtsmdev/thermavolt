FROM node:24-bookworm-slim AS frontend

WORKDIR /app/web
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM php:8.4-cli-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libzip-dev unzip \
    && docker-php-ext-install bcmath sockets zip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node

ARG TARGETARCH
ARG RR_VERSION=3.0.1
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) rr_sha=a6156d34a08cfdfba4934e737ed3208b11c6eab666def5c81f1b640ef43568e7 ;; \
      arm64) rr_sha=c07f8556080b8c995c82ecc5cdf13c60c18d01da966eede848f657810b17dbd3 ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/roadrunner-server/roadrunner/releases/download/v${RR_VERSION}/roadrunner-${RR_VERSION}-linux-${TARGETARCH}.tar.gz" -o /tmp/rr.tar.gz; \
    echo "$rr_sha  /tmp/rr.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/rr.tar.gz --strip-components=1 -C /usr/local/bin "roadrunner-${RR_VERSION}-linux-${TARGETARCH}/rr"; \
    rm /tmp/rr.tar.gz; \
    rr --version

WORKDIR /app/web
COPY web/ ./
RUN mkdir -p storage/app/private storage/app/public \
        storage/framework/cache/data storage/framework/cache/locks \
        storage/framework/sessions storage/framework/views storage/logs \
        bootstrap/cache /data \
    && composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && php -r 'if (!extension_loaded("pdo_sqlite")) { exit(1); }' \
    && chown -R www-data:www-data storage bootstrap/cache /data
COPY --from=frontend /app/web/public/build ./public/build

ENV PHP_BINARY=/usr/local/bin/php \
    RR_BINARY=/usr/local/bin/rr \
    GATEWAY_HOST=0.0.0.0

USER www-data
EXPOSE 8000
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
