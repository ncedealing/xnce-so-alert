#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$ROOT_DIR/.build/production-package"
PACKAGE_NAME="mt5-risk-monitor-production.zip"

VERSION="$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "0.0.0")"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
VERSIONED_PACKAGE="mt5-risk-monitor-${VERSION}-${STAMP}.zip"

SKIP_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    -h|--help)
      cat <<'HELP'
Usage: scripts/make_production_package.sh [--skip-tests]

Builds the frontend, runs verification unless skipped, and creates:
  dist/mt5-risk-monitor-production.zip
  dist/mt5-risk-monitor-<version>-<utc timestamp>.zip

Node.js is not included in the package. The Amazon Linux installer installs it online.
HELP
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$ROOT_DIR"

if [ "$SKIP_TESTS" -eq 0 ]; then
  npm test
fi
npm run ui:build

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$DIST_DIR"

copy_path() {
  local path="$1"
  if [ -e "$ROOT_DIR/$path" ]; then
    mkdir -p "$STAGE_DIR/$(dirname "$path")"
    cp -R "$ROOT_DIR/$path" "$STAGE_DIR/$path"
  fi
}

for path in \
  package.json \
  README.md \
  src \
  public \
  templates \
  examples \
  scripts \
  docs \
  adapters \
  web-ui/package.json \
  web-ui/package-lock.json \
  web-ui/src \
  web-ui/index.html \
  web-ui/postcss.config.js \
  web-ui/tailwind.config.js \
  web-ui/tsconfig.app.json \
  web-ui/tsconfig.json \
  web-ui/vite.config.ts
do
  copy_path "$path"
done

find "$STAGE_DIR" -name '.DS_Store' -delete
find "$STAGE_DIR" -name '__pycache__' -type d -prune -exec rm -rf {} +
find "$STAGE_DIR" -name 'node_modules' -type d -prune -exec rm -rf {} +
find "$STAGE_DIR" -name '.git' -type d -prune -exec rm -rf {} +

cat > "$STAGE_DIR/package-manifest.json" <<EOF
{
  "name": "mt5-risk-monitor",
  "version": "$VERSION",
  "builtAt": "$STAMP",
  "nodeBundled": false,
  "entry": "src/web.js",
  "defaultConfig": "examples/config.example.json",
  "installer": "scripts/install_amazon_linux.sh"
}
EOF

(
  cd "$STAGE_DIR"
  zip -qr "$DIST_DIR/$VERSIONED_PACKAGE" .
)
cp "$DIST_DIR/$VERSIONED_PACKAGE" "$DIST_DIR/$PACKAGE_NAME"

echo "Production package created:"
echo "  $DIST_DIR/$VERSIONED_PACKAGE"
echo "  $DIST_DIR/$PACKAGE_NAME"
