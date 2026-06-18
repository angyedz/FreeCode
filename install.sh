#!/usr/bin/env bash
# FreeCode installer — build the agent for Linux and expose it as `freecode`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ORANGE=$'\033[38;5;208m'
GREEN=$'\033[32m'
RED=$'\033[31m'
RESET=$'\033[0m'
say() { echo "${ORANGE}>>${RESET} $1"; }
ok()  { echo "${GREEN}[OK]${RESET} $1"; }
err() { echo "${RED}[ERR]${RESET} $1" >&2; }

# 1. Check requirements
command -v node >/dev/null 2>&1 || { err "Node.js >= 18 is required (not found)."; exit 1; }
command -v npm  >/dev/null 2>&1 || { err "npm is required (not found)."; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node 18+ required (found $(node -v))."
  exit 1
fi
say "Using node $(node -v), npm $(npm -v)"

# 2. Install dependencies
say "Installing dependencies..."
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi
ok "Dependencies installed"

# 3. Build a standalone Linux bundle with esbuild
BUILT=""
say "Building Linux bundle..."
if npm run build >/dev/null 2>&1; then
  BUILT="$SCRIPT_DIR/dist/freecode.mjs"
  if ! head -n1 "$BUILT" | grep -q '^#!'; then
    TMP="$(mktemp)"
    { echo '#!/usr/bin/env node'; cat "$BUILT"; } > "$TMP" && mv "$TMP" "$BUILT"
  fi
  chmod +x "$BUILT"
  ok "Built $BUILT"
else
  err "Bundle build failed; using tsx runtime launcher as fallback."
fi

# 4. Create the `freecode` launcher in ~/.local/bin
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
LAUNCHER="$BIN_DIR/freecode"
if [ -n "$BUILT" ]; then
  cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
exec node "$BUILT" "\$@"
EOF
else
  cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
exec npx --yes tsx "$SCRIPT_DIR/src/index.ts" "\$@"
EOF
fi
chmod +x "$LAUNCHER"
ok "Installed launcher: $LAUNCHER"

# 5. Ensure ~/.local/bin is on PATH
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
add_to_rc() {
  [ -f "$1" ] || return 0
  grep -qF "$PATH_LINE" "$1" && return 0
  { echo ""; echo "# Added by FreeCode installer"; echo "$PATH_LINE"; } >> "$1"
  say "Added ~/.local/bin to PATH in $1"
}
case ":$PATH:" in
  *":$BIN_DIR:"*) ok "~/.local/bin already on PATH" ;;
  *)
    add_to_rc "$HOME/.bashrc"
    add_to_rc "$HOME/.zshrc"
    add_to_rc "$HOME/.profile"
    say 'Restart your shell or run: export PATH="$HOME/.local/bin:$PATH"' ;;
esac

echo
ok "Done. Launch the agent with: freecode"
