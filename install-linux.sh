#!/usr/bin/env bash
# Mandelbrot Odyssey for Linux: installs Node.js if needed, the app, and shortcuts on the desktop and in the menu.
#
#   From the web:     curl -fsSL https://raw.githubusercontent.com/yahyabmo/the-mandelbrot-set/main/install-linux.sh | bash
#   From this folder: ./install-linux.sh    (or right-click it, then "Run as a Program")
#   To remove it:     ~/.local/share/mandelbrot-odyssey/uninstall.sh
set -euo pipefail

NAME="Mandelbrot Odyssey"
ID="mandelbrot-odyssey"
REPO="yahyabmo/the-mandelbrot-set"
COMMENT="A real-time journey into the Mandelbrot set"
CATEGORIES="Education;Science;Math;"
NODE_VERSION="24.22.2"

# Empty when the installer comes through a pipe: then the app comes from GitHub.
SRC="${BASH_SOURCE[0]:-}"

# All of it is read before anything runs, which matters when it comes through a pipe.
main() {
  DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
  ROOT="$DATA/$ID"
  BIN="$HOME/.local/bin"
  DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"

  # Opened from the file manager, there is no terminal to follow the installation in: open one.
  if [ -n "$SRC" ] && [ ! -t 1 ] && [ -z "${IN_TERMINAL:-}" ] && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
    export IN_TERMINAL=1
    for t in x-terminal-emulator gnome-terminal ptyxis kgx konsole xfce4-terminal mate-terminal tilix xterm; do
      command -v "$t" >/dev/null || continue
      case "$t" in
        gnome-terminal | ptyxis | kgx) exec "$t" -- bash "$SRC" "$@" ;;
        xfce4-terminal | mate-terminal) exec "$t" -x bash "$SRC" "$@" ;;
        *) exec "$t" -e bash "$SRC" "$@" ;;
      esac
    done
  fi
  # In a terminal opened for it, keep the window until it has been read.
  [ -n "${IN_TERMINAL:-}" ] && trap 'echo; read -rp "Press Enter to close this window. " _' EXIT

  say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
  die() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

  if [ "${1:-}" = "--uninstall" ]; then
    [ -x "$ROOT/uninstall.sh" ] && exec "$ROOT/uninstall.sh"
    say "$NAME is not installed."
    exit 0
  fi

  command -v curl >/dev/null || die "curl is needed: install it with your package manager (sudo apt install curl), then run this again."
  command -v tar >/dev/null || die "tar is needed: install it with your package manager, then run this again."
  mkdir -p "$ROOT" "$BIN" "$DATA/applications"

  # 1. Node.js 18 or newer: the one of the system, or a copy of our own, checked against its checksum.
  node_ok() { [ -x "$1" ] && "$1" -e "process.exit(+process.versions.node.split('.')[0] >= 18 ? 0 : 1)" 2>/dev/null; }
  NODE=""
  if command -v node >/dev/null && node_ok "$(command -v node)" && command -v npm >/dev/null; then
    NODE="$(command -v node)"
  elif node_ok "$ROOT/node/bin/node"; then
    NODE="$ROOT/node/bin/node"
  else
    case "$(uname -m)" in
      x86_64 | amd64) ARCH=x64 ;;
      aarch64 | arm64) ARCH=arm64 ;;
      *) die "There is no Node.js $NODE_VERSION for this processor ($(uname -m)): install Node.js 18 or newer yourself, then run this again." ;;
    esac
    say "Downloading Node.js $NODE_VERSION…"
    TAR="node-v$NODE_VERSION-linux-$ARCH.tar.xz"
    TMP="$(mktemp -d)"
    curl -fL --progress-bar "https://nodejs.org/dist/v$NODE_VERSION/$TAR" -o "$TMP/$TAR"
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
    (cd "$TMP" && grep " $TAR\$" SHASUMS256.txt | sha256sum -c --quiet -) || die "The Node.js download is damaged: run this again."
    rm -rf "$ROOT/node" && mkdir -p "$ROOT/node"
    tar -xJf "$TMP/$TAR" -C "$ROOT/node" --strip-components=1
    rm -rf "$TMP"
    NODE="$ROOT/node/bin/node"
  fi
  export PATH="$(dirname "$NODE"):$PATH"

  # 2. The app: the folder this installer is in when it holds the app, otherwise the latest from GitHub.
  HERE=""
  [ -n "$SRC" ] && [ -f "$SRC" ] && HERE="$(cd "$(dirname "$SRC")" && pwd)"
  NEW="$ROOT/app.new"
  rm -rf "$NEW" && mkdir -p "$NEW"
  if [ -n "$HERE" ] && [ -f "$HERE/package.json" ] && grep -q "\"name\": \"$ID\"" "$HERE/package.json"; then
    say "Copying $NAME from $HERE…"
    tar -C "$HERE" --exclude=./node_modules --exclude=./dist --exclude=./.git -cf - . | tar -C "$NEW" -xf -
  else
    say "Downloading $NAME…"
    curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/main" | tar -xz -C "$NEW" --strip-components=1
  fi

  say "Installing and building (about a minute the first time)…"
  (cd "$NEW" && npm ci --no-fund --no-audit --loglevel=error && npm run build --silent)
  # A copy that is running is stopped before it is replaced.
  [ -f "$ROOT/app/scripts/launch.js" ] && "$NODE" "$ROOT/app/scripts/launch.js" --stop
  rm -rf "$ROOT/app" && mv "$NEW" "$ROOT/app"
  cp "$ROOT/app/docs/icon.png" "$ROOT/icon.png"

  # 3. The launcher, and the way back.
  cat >"$ROOT/launch.sh" <<LAUNCH
#!/usr/bin/env bash
# Open $NAME in the browser, starting it first if needed. "--stop" stops it.
NODE="$NODE"
[ -x "\$NODE" ] || NODE=node
exec "\$NODE" "$ROOT/app/scripts/launch.js" "\$@"
LAUNCH
  cat >"$ROOT/uninstall.sh" <<UNINSTALL
#!/usr/bin/env bash
# Remove $NAME: its shortcuts, the app and its copy of Node.js.
"$ROOT/launch.sh" --stop 2>/dev/null
rm -rf "$ROOT" "$BIN/$ID" "$DATA/applications/$ID.desktop" "$DESKTOP_DIR/$ID.desktop"
echo "$NAME is removed."
UNINSTALL
  chmod +x "$ROOT/launch.sh" "$ROOT/uninstall.sh"
  ln -sf "$ROOT/launch.sh" "$BIN/$ID"

  # 4. The shortcuts: in the menu of applications, and on the desktop.
  ENTRY="$(printf '%s\n' "[Desktop Entry]" "Type=Application" "Name=$NAME" "Comment=$COMMENT" \
    "Exec=\"$ROOT/launch.sh\"" "Icon=$ROOT/icon.png" "Terminal=false" "Categories=$CATEGORIES")"
  printf '%s\n' "$ENTRY" >"$DATA/applications/$ID.desktop"
  if [ -d "$DESKTOP_DIR" ]; then
    printf '%s\n' "$ENTRY" >"$DESKTOP_DIR/$ID.desktop"
    chmod +x "$DESKTOP_DIR/$ID.desktop"
    # GNOME asks for this before it lets a desktop shortcut start anything.
    gio set "$DESKTOP_DIR/$ID.desktop" metadata::trusted true 2>/dev/null || true
  fi
  update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true

  say "$NAME is installed. Open it from the shortcut on your desktop, or run: $ROOT/launch.sh"
  "$ROOT/launch.sh"
}

main "$@"
