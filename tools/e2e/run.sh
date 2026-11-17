#!/usr/bin/env bash
# Starts one shared app stack profile and runs the Playwright suite mounted by
# the suite compose file. Usage: tools/e2e/run.sh <suite-dir> <sqlite|my|pg|all>
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: tools/e2e/run.sh <suite-dir> <sqlite|my|pg|all>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUITE_INPUT="$1"
REQUESTED_PROFILE="$2"

if [ "${SUITE_INPUT#/}" != "$SUITE_INPUT" ]; then
  SUITE_DIR="$(cd "$SUITE_INPUT" && pwd)"
else
  SUITE_DIR="$(cd "$ROOT/$SUITE_INPUT" && pwd)"
fi

VERSION="$(tr -d '[:space:]' < "$ROOT/tools/e2e/playwright-version")"

node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = process.argv[2];
const actual = pkg.devDependencies && pkg.devDependencies["@playwright/test"];
if (actual !== expected) {
  console.error(
    "@playwright/test in " +
      process.argv[1] +
      " is " +
      String(actual) +
      ", expected " +
      expected,
  );
  process.exit(1);
}
' "$ROOT/package.json" "$VERSION"

COMPOSE=()
cleanup() {
  if [ "${#COMPOSE[@]}" -eq 0 ]; then
    return 0
  fi
  "${COMPOSE[@]}" down -v --remove-orphans || true
  COMPOSE=()
}
trap cleanup EXIT

apply_profile_env() {
  local profile="$1"
  export E2E_REPO_ROOT="$ROOT"
  export E2E_SUITE_DIR="$SUITE_DIR"
  export PLAYWRIGHT_VERSION="$VERSION"
  export MASTER_KEY="konvoez-e2e-master-key"
  export JWT_SECRET="konvoez-e2e-jwt-secret"
  export MEDIASOUP_ANNOUNCED_IP="127.0.0.1"
  unset DB_ENGINE DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
  case "$profile" in
    sqlite) ;;
    my)
      export DB_ENGINE=mysql
      export DB_HOST=mysql
      export DB_PORT=3306
      export DB_USER=root
      export DB_PASSWORD=root
      export DB_NAME=konvoez
      ;;
    pg)
      export DB_ENGINE=postgres
      export DB_HOST=postgres
      export DB_PORT=5432
      export DB_USER=postgres
      export DB_PASSWORD=postgres
      export DB_NAME=konvoez
      ;;
    *)
      echo "Unknown profile: $profile" >&2
      exit 1
      ;;
  esac
}

run_profile() {
  local profile="$1"
  local suite_name project
  suite_name="$(basename "$SUITE_DIR")"
  project="konvoez-e2e-${suite_name}-${profile}"

  apply_profile_env "$profile"
  COMPOSE=(
    docker compose
    -p "$project"
    -f "$ROOT/tools/e2e/docker-compose.yml"
    -f "$SUITE_DIR/docker-compose.yml"
    --profile "$profile"
  )

  "${COMPOSE[@]}" up -d --wait --wait-timeout 300 --build app
  "${COMPOSE[@]}" run --rm -T --no-deps e2e bash -lc "set -euo pipefail
npx tsc -p tsconfig.json
actual=\$(npx playwright --version)
expected='Version ${VERSION}'
if [ \"\$actual\" != \"\$expected\" ]; then
  printf 'Playwright %s does not match %s\n' \"\$actual\" \"\$expected\" >&2
  exit 1
fi
npx playwright test"
  cleanup
}

case "$REQUESTED_PROFILE" in
  all)
    run_profile sqlite
    run_profile my
    run_profile pg
    ;;
  sqlite | my | pg)
    run_profile "$REQUESTED_PROFILE"
    ;;
  *)
    echo "Unknown profile: $REQUESTED_PROFILE" >&2
    exit 1
    ;;
esac
