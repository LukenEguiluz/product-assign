#!/bin/sh
set -e
if [ -z "${DJANGO_SECRET_KEY}" ]; then
  echo "Defina DJANGO_SECRET_KEY en el archivo .env (vea env.example)." >&2
  exit 1
fi
if [ -n "${DJANGO_DATA_DIR}" ]; then
  mkdir -p "${DJANGO_DATA_DIR}"
fi
python manage.py migrate --noinput
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${GUNICORN_WORKERS:-1}" \
  --threads "${GUNICORN_THREADS:-2}" \
  --timeout "${GUNICORN_TIMEOUT:-120}" \
  --access-logfile - \
  --error-logfile - \
  --capture-output
