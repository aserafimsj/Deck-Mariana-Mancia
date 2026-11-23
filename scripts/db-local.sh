#!/usr/bin/env bash
# Sobe um Postgres local descartável para os testes de banco (não precisa de Docker).
# Uso: scripts/db-local.sh start | stop | url
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="${PGDATA_DIR:-${TMPDIR:-/tmp}/scragbadum-pg}"
PORT="${PGPORT_LOCAL:-54329}"
# O Postgres não roda como root; nesse caso usa o usuário de sistema "postgres".
AS=()
if [ "$(id -u)" = "0" ]; then AS=(runuser -u postgres --); fi
case "${1:-start}" in
  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p "$DATA"
      if [ "$(id -u)" = "0" ]; then chown postgres "$DATA"; fi
      "${AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
    fi
    if ! "${AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      "${AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=localhost" -l "$DATA/log.txt" -w start >/dev/null
    fi
    echo "postgres://postgres@localhost:$PORT/postgres"
    ;;
  stop) "${AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -w stop >/dev/null && echo "parado" ;;
  url) echo "postgres://postgres@localhost:$PORT/postgres" ;;
  *) echo "uso: $0 start|stop|url" >&2; exit 1 ;;
esac
