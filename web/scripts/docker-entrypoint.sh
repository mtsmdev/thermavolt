#!/bin/sh
set -eu
umask 077

touch /data/database.sqlite

if [ -z "${APP_KEY:-}" ]; then
    if [ ! -s /data/app-key ]; then
        php artisan key:generate --show > /data/app-key
    fi
    APP_KEY=$(cat /data/app-key)
    export APP_KEY
fi

php artisan migrate --force --no-interaction
exec node scripts/start.mjs
