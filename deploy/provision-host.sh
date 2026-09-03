#!/usr/bin/env bash
#
# Task 8.7: the human steps of hosting the mockup, gathered in one guided, idempotent script — the
# DNS A record, the TLS certificate, the `erp-deploy` user and its sudoers entry, the systemd
# units, and the production secrets file. Nothing here runs unattended: every host-changing action
# is printed before it runs and gated on an explicit confirmation, so reading this script (or
# re-running it after an interruption) never surprises the operator.
#
# Everything above the "STAGES" marker is the wizard library: do not hand-edit
# it. Author the per-step stages below the marker.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library — delightful, consistent UX. Identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=() # KEYs written to ENV_FILE this run
SKIPPED=()     # things we couldn't do, or the operator declined

# _clear — wipe the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

# banner "Title" — opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later — it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" — clear the screen, then announce a stage and show progress.
# Clearing keeps only the current step on screen.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." — a plain instruction line.
say()  { printf '  %s\n' "$1"; }
# step "..." — a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL — open in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser — visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser — visit it manually: $url"
}

# pause "msg" — wait for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" — y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY — current value of KEY in ENV_FILE, if any.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

# ask KEY "Prompt" — read a value into $KEY. Offers the existing .env value as
# a default on re-runs (Enter keeps it). Visible input (non-secret).
ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
  # Persisting here, and only here, is what makes the banner's "it remembers values already saved"
  # true. `ask_secret` deliberately does not: a password re-asked on a re-run is a small cost, a
  # password cached in a second file for the convenience of re-running is a second thing to protect.
  [[ -n "$input" ]] && write_env "$key" "$input"
}

# ask_secret KEY "Prompt" — like ask, but input is hidden, and never persisted (see `ask`).
ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# write_env KEY VALUE — upsert KEY=VALUE into ENV_FILE (creates it; replaces
# any existing line). Idempotent.
write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

# The wizard library's `set_secret` and `set_var` helpers (write a GitHub Actions repo secret or
# variable through `gh`) are deliberately absent. ADR-0029 is that CI holds no host credential at
# all, and this is the deployment wizard: a helper here whose only purpose is to put a value into
# GitHub Actions is a loaded gun pointed at that decision, unused or not.

# finish — clear, then a closing summary of everything configured.
finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} )) && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES — author this section. One stage() per step the human takes.
# Replace the example below. Set TOTAL_STAGES to match the stages you write.
# ──────────────────────────────────────────────────────────────────────────

TOTAL_STAGES=8

# This wizard never persists an answer into the repository's own `.env` — that file is app
# configuration (`.env.example`), not host secrets. `ask`'s reuse-on-rerun cache, when used below,
# lives here instead.
ENV_FILE="/root/.erp-provision-host-answers"

REPO_PATH="/opt/erp-maquette/repo"       # hardcoded: the systemd units in deploy/systemd/ hardcode
DEPLOY_DIR="$REPO_PATH/deploy"           # this same path as ExecStart's WorkingDirectory, so it is
                                          # not asked — a mismatch would silently break every unit.
STATE_DIR="/var/lib/erp-deploy"
BACKUP_DIR="/var/backups/erp-maquette"
SECRETS_DIR="/etc/erp-maquette"
SECRETS_FILE="$SECRETS_DIR/environment"

# run "description" cmd [args...] — print the exact command, then execute it only after an
# explicit yes. A "no" records the step as skipped (shown in the closing summary) instead of
# silently moving on, so a partial run is visible rather than assumed complete.
run() {
  local desc="$1"
  shift
  printf '  %s$ %s%s\n' "$DIM" "$*" "$RESET"
  if confirm "$desc"; then
    "$@"
  else
    SKIPPED+=("$desc ($*)")
    warn "skipped — do it yourself later: $*"
  fi
}

banner "Maquette ERP — host provisioning (task 8.7)"
note "Targets erp.clementvallois.fr on this host. Every step below is printed before it runs and"
note "asks first; Ctrl-C is always safe, and re-running only offers the steps still undone."

# ── Stage 1 — DNS ───────────────────────────────────────────────────────────────────────────────
stage "DNS — the A record for erp.clementvallois.fr"
say "The certificate stage later needs this record to already resolve to this host."
public_ip="$(curl --silent --fail --max-time 5 https://ifconfig.me 2>/dev/null || true)"
if [[ -n "$public_ip" ]]; then
  say "This host's public IPv4, as seen from outside: ${BOLD}${public_ip}${RESET}"
else
  warn "couldn't auto-detect this host's public IP — find it yourself (e.g. your VPS console)."
fi
step "In your DNS provider's dashboard, create: erp.clementvallois.fr  A  <that IP>"
open_url "https://dnschecker.org/#A/erp.clementvallois.fr"
pause "Created the record? Press Enter once it's saved (propagation can take a few minutes)."
if [[ -z "$public_ip" ]] || ! command -v dig >/dev/null 2>&1; then
  warn "can't verify propagation automatically (no detected IP, or 'dig' isn't installed)."
  SKIPPED+=("DNS propagation — verify manually before the certificate stage")
else
  until [[ "$(dig +short erp.clementvallois.fr A 2>/dev/null | tail -n1)" == "$public_ip" ]]; do
    warn "erp.clementvallois.fr does not resolve to $public_ip yet."
    if ! confirm "Check again?"; then
      SKIPPED+=("DNS propagation — verify manually before the certificate stage")
      break
    fi
  done
fi

# ── Stage 2 — the erp-deploy user ───────────────────────────────────────────────────────────────
stage "The erp-deploy Unix user (ADR-0030)"
say "System account, no login shell, no home directory, and — deliberately — not in the docker"
say "group: docker group membership is root-equivalent on a host that also holds unrelated data."
if id erp-deploy >/dev/null 2>&1; then
  say "erp-deploy already exists — nothing to do."
else
  run "Create the erp-deploy system user" \
    useradd --system --no-create-home --shell /usr/sbin/nologin erp-deploy
fi

# ── Stage 3 — sudoers ────────────────────────────────────────────────────────────────────────────
stage "The narrow sudoers entry"
say "Lets erp-deploy start exactly the deploy, rollback and reset units — nothing broader."
if [[ -f "$DEPLOY_DIR/erp-deploy.sudoers" ]]; then
  run "Validate the sudoers file" visudo -cf "$DEPLOY_DIR/erp-deploy.sudoers"
  run "Install it at /etc/sudoers.d/erp-deploy (root:root, 0440)" \
    install -o root -g root -m 0440 "$DEPLOY_DIR/erp-deploy.sudoers" /etc/sudoers.d/erp-deploy
else
  warn "$DEPLOY_DIR/erp-deploy.sudoers not found — run stage 4 (repository checkout) first, or"
  warn "run this wizard again once the repository is in place."
fi

# ── Stage 4 — repository checkout and systemd units ─────────────────────────────────────────────
stage "The repository checkout and systemd units"
say "The units in deploy/systemd/ point at $DEPLOY_DIR — that path is what gets installed, not"
say "wherever this script happens to be running from."
if [[ -d "$REPO_PATH/.git" ]]; then
  say "$REPO_PATH already looks like a checkout — leaving it as is (pull it yourself if it's stale)."
else
  ask CLONE_URL "Git URL to clone into $REPO_PATH:"
  run "Clone the repository" git clone "$CLONE_URL" "$REPO_PATH"
fi
if [[ -d "$DEPLOY_DIR/systemd" ]]; then
  run "Install the systemd units" install -m 0644 "$DEPLOY_DIR"/systemd/*.service \
    "$DEPLOY_DIR"/systemd/*.timer /etc/systemd/system/
  run "Reload systemd" systemctl daemon-reload
  run "Create $STATE_DIR (root-only)" install -d -o root -g root -m 0700 "$STATE_DIR"
  run "Create $BACKUP_DIR (root-only)" install -d -o root -g root -m 0700 "$BACKUP_DIR"
else
  warn "$DEPLOY_DIR/systemd not found — the checkout above did not complete as expected."
fi

# ── Stage 5 — production secrets ─────────────────────────────────────────────────────────────────
stage "The production secrets file"
say "Written once, root-owned, mode 0600 — the app container never sees the whole file (ADR-0030):"
say "compose.prod.yml lists only the variables each service actually needs."
regenerate_secrets=1
if [[ -f "$SECRETS_FILE" ]]; then
  warn "$SECRETS_FILE already exists. Regenerating starts every credential over."
  if ! confirm "Regenerate it now?"; then
    regenerate_secrets=0
    SKIPPED+=("Production secrets file — kept the existing one")
  fi
fi
if [[ "$regenerate_secrets" -eq 1 ]]; then
  ask POSTGRES_DB "Database name:"
  : "${POSTGRES_DB:=erp}"
  ask POSTGRES_USER "Schema-owner role name (migrations, seed):"
  : "${POSTGRES_USER:=erp_migration}"
  ask_secret POSTGRES_PASSWORD "Schema-owner password (leave hidden input, then Enter):"
  ask APP_DB_USER "Application role name (least-privilege):"
  : "${APP_DB_USER:=erp_app}"
  ask_secret APP_DB_PASSWORD "Application role password:"
  ask APP_PORT "App's published loopback port [3000]:"
  : "${APP_PORT:=3000}"
  session_signing_key="$(openssl rand -hex 32)"
  note "generated a new SESSION_SIGNING_KEY (not echoed back — it signs the persona cookie)"

  # `install` does not create leading directories, and nothing else here creates this one: without
  # it the install below dies with ENOENT after every credential has already been typed in.
  run "Create $SECRETS_DIR (root-only)" install -d -o root -g root -m 0700 "$SECRETS_DIR"

  umask 077
  secrets_tmp="$(mktemp)"
  # The trap, not the `rm` at the end of this block, is what removes it: every command below runs
  # under `set -e`, so any failure between here and there would otherwise leave both plaintext
  # database passwords and the signing key sitting in /tmp.
  trap 'rm -f "$secrets_tmp"' EXIT
  {
    printf 'POSTGRES_DB=%s\n' "$POSTGRES_DB"
    printf 'POSTGRES_USER=%s\n' "$POSTGRES_USER"
    printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
    printf 'APP_DB_USER=%s\n' "$APP_DB_USER"
    printf 'APP_DB_PASSWORD=%s\n' "$APP_DB_PASSWORD"
    # The compose network resolves the service name "postgres" — never localhost/127.0.0.1, which
    # would reach nothing from inside the app or migrate/seed containers.
    printf 'DATABASE_URL=postgres://%s:%s@postgres:5432/%s\n' \
      "$APP_DB_USER" "$APP_DB_PASSWORD" "$POSTGRES_DB"
    printf 'MIGRATION_DATABASE_URL=postgres://%s:%s@postgres:5432/%s\n' \
      "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$POSTGRES_DB"
    printf 'API_PUBLIC_ORIGIN=https://erp.clementvallois.fr\n'
    printf 'SESSION_SIGNING_KEY=%s\n' "$session_signing_key"
    printf 'APP_PORT=%s\n' "$APP_PORT"
    printf 'LOG_LEVEL=info\n'
  } >"$secrets_tmp"

  run "Install $SECRETS_FILE (root:root, 0600)" \
    install -o root -g root -m 0600 "$secrets_tmp" "$SECRETS_FILE"
  rm -f "$secrets_tmp"
  trap - EXIT
fi

# ── Stage 6 — GHCR read access ───────────────────────────────────────────────────────────────────
stage "GHCR read access"
say "The repository is private, so the image it publishes is too (ADR-0029: \"the GHCR read"
say "credential, while the package is private, exists on the host only\") — without this, every"
say "\`docker buildx imagetools inspect\` and every pull that pull-and-redeploy.sh runs refuses."
say "Logging in as root persists the credential in root's docker config, which every systemd"
say "oneshot unit here already runs as (ADR-0030) — nothing below repeats it per invocation."
if grep -q ghcr.io /root/.docker/config.json 2>/dev/null; then
  say "root already has a stored ghcr.io credential — nothing to do."
else
  step "Create a token: https://github.com/settings/tokens?type=beta — a fine-grained PAT scoped"
  step "to this repository only, with \"Read\" access to Packages, and nothing else."
  open_url "https://github.com/settings/tokens?type=beta"
  ask GHCR_USERNAME "Your GitHub username:"
  ask_secret GHCR_TOKEN "Paste the token (read:packages only):"
  # Not routed through run(): it echoes its command verbatim, which would print the token.
  printf '  %s$ docker login ghcr.io -u %s --password-stdin%s\n' "$DIM" "$GHCR_USERNAME" "$RESET"
  if confirm "Log in to ghcr.io as root now?"; then
    printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
  else
    SKIPPED+=("ghcr.io login (docker login ghcr.io -u $GHCR_USERNAME --password-stdin)")
    warn "skipped — log in yourself before the first deploy, or every pull will refuse."
  fi
fi

# ── Stage 7 — TLS certificate ────────────────────────────────────────────────────────────────────
stage "The TLS certificate"
say "/etc/letsencrypt/live currently holds only the apex domain — this issues a separate"
say "certificate for erp.clementvallois.fr, obtained before the real vhost can reference it."
if [[ -d /etc/letsencrypt/live/erp.clementvallois.fr ]]; then
  say "A certificate for erp.clementvallois.fr already exists — nothing to do."
else
  run "Create the ACME webroot" install -d -o www-data -g www-data -m 0755 /var/www/erp-certbot
  if [[ -f "$DEPLOY_DIR/nginx/erp.clementvallois.fr.acme-stub.conf" ]]; then
    run "Install the temporary HTTP-only stub vhost" \
      install -m 0644 "$DEPLOY_DIR/nginx/erp.clementvallois.fr.acme-stub.conf" \
      /etc/nginx/sites-available/erp.clementvallois.fr
    run "Enable the stub vhost" \
      ln -sf /etc/nginx/sites-available/erp.clementvallois.fr \
      /etc/nginx/sites-enabled/erp.clementvallois.fr
    run "Test the nginx configuration" nginx -t
    run "Reload nginx" systemctl reload nginx
  else
    warn "$DEPLOY_DIR/nginx/erp.clementvallois.fr.acme-stub.conf not found — run stage 4 first."
  fi
  run "Request the certificate" certbot certonly --webroot -w /var/www/erp-certbot \
    -d erp.clementvallois.fr
fi

# ── Stage 8 — the real nginx vhost, and going live ──────────────────────────────────────────────
stage "The real nginx vhost, and starting the timers"
say "Replaces the stub with the full vhost: security headers, a rate limit, X-Robots-Tag on"
say "everything nginx itself answers, proxying to the app's loopback port only (ADR-0030)."
if [[ -f "$DEPLOY_DIR/nginx/erp.clementvallois.fr.conf" ]]; then
  app_port="$(grep -oE '^APP_PORT=.*' "$SECRETS_FILE" 2>/dev/null | cut -d= -f2)"
  : "${app_port:=3000}"
  vhost_tmp="$(mktemp)"
  sed "s/{{APP_PORT}}/${app_port}/g" "$DEPLOY_DIR/nginx/erp.clementvallois.fr.conf" >"$vhost_tmp"
  run "Install the real vhost (replaces the ACME stub)" \
    install -m 0644 "$vhost_tmp" /etc/nginx/sites-available/erp.clementvallois.fr
  rm -f "$vhost_tmp"
  run "Test the nginx configuration" nginx -t
  run "Reload nginx" systemctl reload nginx
else
  warn "$DEPLOY_DIR/nginx/erp.clementvallois.fr.conf not found — run stage 4 first."
fi

say "Last step: enable the timers. erp-deploy.timer's first tick (within 2 minutes) performs the"
say "very first deployment — it seeds the database too, since no digest is on record yet"
say "(pull-and-redeploy.sh's own bootstrap case). erp-reset.timer runs the nightly reset at"
say "03:30 Europe/Paris (ADR-0032)."
run "Enable and start erp-deploy.timer" systemctl enable --now erp-deploy.timer
run "Enable and start erp-reset.timer" systemctl enable --now erp-reset.timer
note "To trigger the first deploy immediately instead of waiting for the timer:"
note "  sudo systemctl start erp-deploy.service"
note "To watch it: sudo journalctl -u erp-deploy.service -f"

finish
