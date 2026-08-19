#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
CALL_LOG="$TEMP_DIR/calls.log"
export CALL_LOG

mkdir "$TEMP_DIR/bin"

cat > "$TEMP_DIR/bin/psql" <<'EOF'
#!/bin/sh
printf '%s\n' psql >> "$CALL_LOG"
printf '%s\n' "${SCHEMA_EXISTS:-t}"
EOF

cat > "$TEMP_DIR/bin/yarn" <<'EOF'
#!/bin/sh
printf 'yarn %s\n' "$*" >> "$CALL_LOG"
if [ "${FAIL_INSTANCE_MIGRATION:-false}" = "true" ] && [ "$*" = "database:migrate:prod --force --include-slow" ]; then
  exit 42
fi
EOF

cat > "$TEMP_DIR/bin/application" <<'EOF'
#!/bin/sh
printf 'application %s\n' "$*" >> "$CALL_LOG"
EOF

chmod +x "$TEMP_DIR/bin/psql" "$TEMP_DIR/bin/yarn" "$TEMP_DIR/bin/application"

run_entrypoint() {
  PATH="$TEMP_DIR/bin:$PATH" \
    PG_DATABASE_URL='postgres://test' \
    DISABLE_DB_MIGRATIONS=false \
    DISABLE_CRON_JOBS_REGISTRATION=true \
    "$SCRIPT_DIR/entrypoint.sh" "$TEMP_DIR/bin/application" started
}

run_entrypoint

cat > "$TEMP_DIR/expected-success.log" <<'EOF'
psql
yarn command:prod cache:flush
yarn database:migrate:prod --force --include-slow
yarn command:prod upgrade
yarn command:prod cache:flush
application started
EOF

cmp "$TEMP_DIR/expected-success.log" "$CALL_LOG"

: > "$CALL_LOG"
set +e
FAIL_INSTANCE_MIGRATION=true run_entrypoint
status=$?
set -e

[ "$status" -eq 42 ]

cat > "$TEMP_DIR/expected-failure.log" <<'EOF'
psql
yarn command:prod cache:flush
yarn database:migrate:prod --force --include-slow
EOF

cmp "$TEMP_DIR/expected-failure.log" "$CALL_LOG"

: > "$CALL_LOG"
FAIL_INSTANCE_MIGRATION=false SCHEMA_EXISTS=f run_entrypoint

cat > "$TEMP_DIR/expected-fresh-database.log" <<'EOF'
psql
yarn database:init:prod
yarn command:prod cache:flush
yarn command:prod upgrade
yarn command:prod cache:flush
application started
EOF

cmp "$TEMP_DIR/expected-fresh-database.log" "$CALL_LOG"
