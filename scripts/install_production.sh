#!/usr/bin/env bash
set -euo pipefail

APP_NAME="MT5 Risk Monitor"
SERVICE_NAME="mt5-risk-monitor"
APP_USER="mt5risk"
APP_DIR="/opt/mt5-risk-monitor"
PORT="2001"
DOMAIN=""
PACKAGE_URL=""
GITHUB_REPO=""
ASSUME_YES=0
PKG_MANAGER=""
APT_UPDATED=0

usage() {
  cat <<'HELP'
Usage:
  sudo bash scripts/install_production.sh [options]
  curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/scripts/install_production.sh | sudo bash -s -- --github-repo OWNER/REPO

Options:
  --package-url URL       Download a production zip package from this URL.
  --github-repo OWNER/REPO
                          Download latest release asset mt5-risk-monitor-production.zip.
  --app-dir PATH          Install path. Default: /opt/mt5-risk-monitor
  --service-name NAME     systemd service name. Default: mt5-risk-monitor
  --user NAME             Linux service user. Default: mt5risk
  --port PORT             Local app port. Default: 2001
  --domain DOMAIN         Optional domain for Nginx reverse proxy on port 80.
  --yes                   Use defaults for prompts.
  -h, --help              Show this help.

Environment:
  GITHUB_TOKEN            Optional token for private GitHub release downloads.

Supported Linux:
  Amazon Linux / CentOS / RHEL / Rocky / Alma compatible systems with dnf or yum.
  Ubuntu / Debian compatible systems with apt-get.
HELP
}

while [ $# -gt 0 ]; do
  case "$1" in
    --package-url) PACKAGE_URL="${2:-}"; shift 2 ;;
    --github-repo) GITHUB_REPO="${2:-}"; shift 2 ;;
    --app-dir) APP_DIR="${2:-}"; shift 2 ;;
    --service-name) SERVICE_NAME="${2:-}"; shift 2 ;;
    --user) APP_USER="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Please run as root, for example: sudo bash scripts/install_production.sh" >&2
  exit 1
fi

ask() {
  local prompt="$1"
  local current="$2"
  local answer
  if [ "$ASSUME_YES" -eq 1 ]; then
    printf '%s\n' "$current"
    return
  fi
  read -r -p "$prompt [$current]: " answer
  printf '%s\n' "${answer:-$current}"
}

confirm() {
  local prompt="$1"
  if [ "$ASSUME_YES" -eq 1 ]; then return 0; fi
  local answer
  read -r -p "$prompt [y/N]: " answer
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

if [ -z "$PACKAGE_URL" ] && [ -n "$GITHUB_REPO" ]; then
  PACKAGE_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/mt5-risk-monitor-production.zip"
fi

if [ "$ASSUME_YES" -eq 0 ]; then
  echo "$APP_NAME Linux installer"
  echo "Press Enter to accept defaults."
  APP_DIR="$(ask "Install directory" "$APP_DIR")"
  SERVICE_NAME="$(ask "systemd service name" "$SERVICE_NAME")"
  APP_USER="$(ask "Linux service user" "$APP_USER")"
  PORT="$(ask "Local app port" "$PORT")"
  if [ -z "$DOMAIN" ]; then
    read -r -p "Optional domain for Nginx reverse proxy, empty to skip: " DOMAIN
  fi
  if [ -z "$PACKAGE_URL" ] && [ ! -f "./package-manifest.json" ]; then
    read -r -p "Production package URL, empty to use current directory: " PACKAGE_URL
  fi
fi

pkg_manager() {
  if [ -n "$PKG_MANAGER" ]; then
    echo "$PKG_MANAGER"
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
  elif command -v yum >/dev/null 2>&1; then
    PKG_MANAGER="yum"
  elif command -v apt-get >/dev/null 2>&1; then
    PKG_MANAGER="apt"
  else
    echo "No supported package manager found. Install requires dnf, yum, or apt-get." >&2
    exit 1
  fi
  echo "$PKG_MANAGER"
}

pm_install() {
  local manager
  manager="$(pkg_manager)"
  case "$manager" in
    dnf)
      dnf install -y "$@"
      ;;
    yum)
      yum install -y "$@"
      ;;
    apt)
      export DEBIAN_FRONTEND=noninteractive
      if [ "$APT_UPDATED" -eq 0 ]; then
        apt-get update
        APT_UPDATED=1
      fi
      apt-get install -y "$@"
      ;;
    *)
      echo "Unsupported package manager: $manager" >&2
      exit 1
      ;;
  esac
}

check_os_compatibility() {
  if [ ! -f /etc/os-release ]; then
    return
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  local os_id="${ID:-}"
  local version="${VERSION_ID:-}"
  local major="${version%%.*}"
  case "$os_id" in
    centos|rhel|rocky|almalinux)
      if [ -n "$major" ] && [ "$major" -lt 8 ] 2>/dev/null; then
        echo "This installer requires Node.js 20. Please use CentOS/RHEL/Rocky/Alma 8+." >&2
        echo "Detected: ${PRETTY_NAME:-$os_id $version}" >&2
        exit 1
      fi
      ;;
    amzn)
      if [ "$version" = "2" ]; then
        echo "This installer requires Node.js 20. Amazon Linux 2023 is recommended; Amazon Linux 2 may fail because of older system libraries." >&2
      fi
      ;;
    *)
      ;;
  esac
}

install_base_tools() {
  check_os_compatibility
  echo "Detected package manager: $(pkg_manager)"
  if [ "$(pkg_manager)" = "apt" ]; then
    pm_install curl ca-certificates unzip tar passwd
  else
    pm_install curl ca-certificates unzip tar shadow-utils
  fi
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0
}

install_node() {
  local major
  major="$(node_major)"
  if [ "$major" -ge 20 ]; then
    echo "Node.js is already installed: $(node --version)"
    return
  fi

  echo "Installing Node.js 20 LTS online..."
  if [ "$(pkg_manager)" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup_20.sh
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x -o /tmp/nodesource_setup_20.sh
  fi
  bash /tmp/nodesource_setup_20.sh
  pm_install nodejs

  major="$(node_major)"
  if [ "$major" -lt 20 ]; then
    echo "Node.js installation failed or version is too old: $(node --version 2>/dev/null || echo missing)" >&2
    exit 1
  fi
  echo "Node.js installed: $(node --version)"
}

download_package() {
  local work_dir="$1"
  if [ -z "$PACKAGE_URL" ]; then
    if [ -f "./package-manifest.json" ] && [ -d "./src" ] && [ -d "./public" ]; then
      echo "$(pwd)"
      return
    fi
    echo "No package URL was provided and current directory is not a production package." >&2
    exit 2
  fi

  local package_path="$work_dir/package.zip"
  echo "Downloading package:"
  echo "  $PACKAGE_URL"
  if [ -n "${GITHUB_TOKEN:-}" ] && [ -n "$GITHUB_REPO" ]; then
    download_github_release_asset "$package_path"
  elif [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -fL -H "Authorization: Bearer ${GITHUB_TOKEN}" -o "$package_path" "$PACKAGE_URL"
  else
    curl -fL -o "$package_path" "$PACKAGE_URL"
  fi

  local extract_dir="$work_dir/extract"
  mkdir -p "$extract_dir"
  unzip -q "$package_path" -d "$extract_dir"
  find_package_root "$extract_dir"
}

download_github_release_asset() {
  local package_path="$1"
  local api_url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
  local asset_api_url
  asset_api_url="$(
    curl -fsSL \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "$api_url" \
    | node -e "
const fs = require('fs');
const release = JSON.parse(fs.readFileSync(0, 'utf8'));
const asset = (release.assets || []).find((item) => item.name === 'mt5-risk-monitor-production.zip');
if (!asset) {
  console.error('Release asset mt5-risk-monitor-production.zip was not found.');
  process.exit(1);
}
console.log(asset.url);
"
  )"
  curl -fL \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/octet-stream" \
    -o "$package_path" \
    "$asset_api_url"
}

find_package_root() {
  local dir="$1"
  if [ -f "$dir/package-manifest.json" ] && [ -d "$dir/src" ] && [ -d "$dir/public" ]; then
    echo "$dir"
    return
  fi
  local candidate
  candidate="$(find "$dir" -maxdepth 2 -name package-manifest.json -print -quit)"
  if [ -n "$candidate" ]; then
    dirname "$candidate"
    return
  fi
  echo "Downloaded archive does not look like an $APP_NAME production package." >&2
  exit 2
}

create_user() {
  if id "$APP_USER" >/dev/null 2>&1; then
    return
  fi
  local login_shell
  login_shell="/sbin/nologin"
  if [ ! -x "$login_shell" ] && [ -x "/usr/sbin/nologin" ]; then
    login_shell="/usr/sbin/nologin"
  fi
  if command -v useradd >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$APP_DIR" --shell "$login_shell" "$APP_USER"
  else
    adduser --system --group --home "$APP_DIR" --no-create-home "$APP_USER"
  fi
}

install_app_files() {
  local source_dir="$1"
  local backup_root="$APP_DIR/backups"
  local backup_dir="$backup_root/$(date -u +"%Y%m%dT%H%M%SZ")"

  mkdir -p "$APP_DIR" "$backup_root"
  if [ -f "$APP_DIR/src/web.js" ]; then
    mkdir -p "$backup_dir"
    tar -C "$APP_DIR" \
      --exclude='./config.local.json' \
      --exclude='./.env' \
      --exclude='./.env.local' \
      --exclude='./.state' \
      --exclude='./backups' \
      -czf "$backup_dir/app-backup.tar.gz" .
    echo "Existing app backup: $backup_dir/app-backup.tar.gz"
  fi

  local keep_dir
  keep_dir="$(mktemp -d)"
  for keep in config.local.json .env .env.local .state; do
    if [ -e "$APP_DIR/$keep" ]; then
      cp -a "$APP_DIR/$keep" "$keep_dir/"
    fi
  done

  find "$APP_DIR" -maxdepth 1 -mindepth 1 \
    ! -name 'config.local.json' \
    ! -name '.env' \
    ! -name '.env.local' \
    ! -name '.state' \
    ! -name 'backups' \
    -exec rm -rf {} +

  cp -a "$source_dir"/. "$APP_DIR"/
  for keep in config.local.json .env .env.local .state; do
    if [ -e "$keep_dir/$keep" ]; then
      rm -rf "$APP_DIR/$keep"
      cp -a "$keep_dir/$keep" "$APP_DIR/$keep"
    fi
  done
  rm -rf "$keep_dir"

  find "$APP_DIR" -name node_modules -type d -prune -exec rm -rf {} +
  find "$APP_DIR" -name .git -type d -prune -exec rm -rf {} +
  find "$APP_DIR" -name .DS_Store -delete
}

configure_app() {
  local config_path="$APP_DIR/config.local.json"
  if [ ! -f "$config_path" ]; then
    cp "$APP_DIR/examples/config.example.json" "$config_path"
  fi

  node - "$config_path" "$PORT" "$DOMAIN" <<'NODE'
const fs = require('fs');
const [configPath, port, domain] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.web = config.web || {};
config.web.host = domain ? '127.0.0.1' : '0.0.0.0';
config.web.port = Number(port);
config.web.auth = config.web.auth || {};
config.web.auth.cookieName = config.web.auth.cookieName || 'mt5_risk_session';
config.web.auth.sessionTtlHours = config.web.auth.sessionTtlHours || 12;
config.web.auth.secureCookie = domain ? 'auto' : false;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
NODE

  local has_users
  has_users="$(node - "$config_path" <<'NODE'
const fs = require('fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const users = config.web && config.web.auth && Array.isArray(config.web.auth.users) ? config.web.auth.users : [];
console.log(users.length > 0 ? 'yes' : 'no');
NODE
)"
  if [ "$has_users" = "no" ]; then
    node "$APP_DIR/scripts/setup_remote_login.js" --config "$config_path"
  else
    echo "Existing admin users found. Login users were preserved."
  fi
}

write_systemd_service() {
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=${APP_NAME}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/node ${APP_DIR}/src/web.js --config ${APP_DIR}/config.local.json
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
}

configure_nginx() {
  if [ -z "$DOMAIN" ]; then return; fi
  echo "Installing and configuring Nginx reverse proxy for $DOMAIN..."
  pm_install nginx
  cat > /etc/nginx/conf.d/mt5-risk-monitor.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 250m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
    }
}
EOF
  systemctl enable nginx
  systemctl restart nginx
}

open_firewall_hint() {
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    if [ -n "$DOMAIN" ]; then
      firewall-cmd --permanent --add-service=http || true
    else
      firewall-cmd --permanent --add-port="${PORT}/tcp" || true
    fi
    firewall-cmd --reload || true
  fi
}

main() {
  install_base_tools
  install_node
  create_user

  local work_dir
  work_dir="$(mktemp -d)"
  local source_dir
  source_dir="$(download_package "$work_dir")"

  install_app_files "$source_dir"
  configure_app
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  write_systemd_service
  configure_nginx
  open_firewall_hint

  echo
  echo "$APP_NAME deployment complete."
  echo "Service: systemctl status ${SERVICE_NAME}"
  if [ -n "$DOMAIN" ]; then
    echo "URL: http://${DOMAIN}"
  else
    echo "URL: http://<server-ip>:${PORT}"
  fi
  echo
  echo "Important: open the corresponding EC2 Security Group inbound rule."
  if [ -n "$DOMAIN" ]; then
    echo "  HTTP 80 from your trusted source or Cloudflare."
  else
    echo "  TCP ${PORT} from your trusted source."
  fi
}

main "$@"
