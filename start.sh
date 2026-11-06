#!/usr/bin/env bash
# Install what is needed, then open Mandelbrot Odyssey in the browser. Extra options go to Vite.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org, then run this again."
  exit 1
fi
if ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"; then
  echo "Node.js $(node --version) is too old: version 18 or newer is needed (https://nodejs.org)."
  exit 1
fi

npm install --no-fund --no-audit
npm start -- "$@"
