#!/bin/sh
set -eu

# Migraciones y estáticos del admin (Django + unfold) en cada arranque.
python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Backend Django detrás de nginx (solo escucha en localhost del contenedor).
gunicorn celtuc.wsgi:application \
    --bind 127.0.0.1:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout "${GUNICORN_TIMEOUT:-60}" \
    --access-logfile - \
    --error-logfile - &

# nginx en primer plano: sirve el frontend y hace de proxy a gunicorn.
exec nginx -g 'daemon off;'
