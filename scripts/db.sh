#!/usr/bin/env bash
# Wrapper around the portable PostgreSQL binaries in .postgres/pgsql/bin,
# for machines without Docker (see docker-compose.yml for the Docker path).
#
# Usage: scripts/db.sh {setup|start|stop}
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$ROOT_DIR/.postgres/pgsql/bin"
PGDATA="$ROOT_DIR/.pgdata"
PORT="${PGPORT:-5433}"
LOG="$PGDATA/server.log"

usage() {
  echo "Usage: $0 {setup|start|stop}" >&2
  echo "  setup  - initdb a fresh cluster into .pgdata (refuses if it already exists)" >&2
  echo "  start  - start the server on port $PORT, detached (does not block the caller)" >&2
  echo "  stop   - stop the server" >&2
  exit 1
}

require_binaries() {
  for bin in initdb pg_ctl createdb psql; do
    if [ ! -f "$PGBIN/$bin.exe" ]; then
      echo "Missing $PGBIN/$bin.exe — is .postgres/pgsql/bin populated?" >&2
      exit 1
    fi
  done
}

cmd="${1:-}"
require_binaries

case "$cmd" in
  setup)
    if [ -d "$PGDATA" ] && [ -n "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
      echo "Refusing to run initdb: '$PGDATA' already exists and is not empty." >&2
      echo "This would clobber the live cluster. Remove it yourself first if a" >&2
      echo "fresh cluster is really what you want." >&2
      exit 1
    fi
    echo "Initializing PostgreSQL cluster at $PGDATA ..."
    "$PGBIN/initdb.exe" -D "$PGDATA" -U pbk --auth=trust --encoding=UTF8
    echo "Cluster initialized."
    echo "Next: $0 start"
    echo "Then, if the 'pbk' database does not exist yet:"
    echo "  $PGBIN/createdb.exe -U pbk -h 127.0.0.1 -p $PORT pbk"
    ;;

  start)
    if [ ! -d "$PGDATA" ]; then
      echo "No cluster at '$PGDATA'. Run '$0 setup' first." >&2
      exit 1
    fi
    if "$PGBIN/pg_ctl.exe" -D "$PGDATA" status >/dev/null 2>&1; then
      echo "PostgreSQL is already running."
      exit 0
    fi
    echo "Starting PostgreSQL on port $PORT (detached, log: $LOG) ..."
    # Backgrounded and redirected so this does not block the caller: on
    # Windows/Git Bash, `pg_ctl -w start` run in the foreground does not
    # release the terminal even after the server is up.
    "$PGBIN/pg_ctl.exe" -D "$PGDATA" -o "-p $PORT" -l "$LOG" start \
      >"$PGDATA/pg_ctl-start.out" 2>&1 &
    disown
    echo "Start requested. Verify with:"
    echo "  $PGBIN/psql.exe -U pbk -h 127.0.0.1 -p $PORT -d pbk -tAc 'select 1'"
    ;;

  stop)
    if [ ! -d "$PGDATA" ]; then
      echo "No cluster at '$PGDATA'." >&2
      exit 1
    fi
    "$PGBIN/pg_ctl.exe" -D "$PGDATA" stop -m fast
    ;;

  *)
    usage
    ;;
esac
