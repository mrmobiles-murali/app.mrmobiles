#!/usr/bin/env bash
set -euo pipefail

bot_repair_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
bot_repair_cli_version="60.1.3"

if ! command -v apt-get >/dev/null 2>&1; then
  printf '%s\n' 'Open Ubuntu first: proot-distro login ubuntu'
  exit 1
fi
if [[ ! -f "$HOME/.config/mr-mobiles/bot.json" ]]; then
  printf '%s\n' 'The saved bot configuration is missing in this Ubuntu account.'
  printf '%s\n' 'Run: python3 ~/mr-mobiles-app/scripts/botctl.py configure'
  exit 1
fi

bot_repair_node_major=0
if command -v node >/dev/null 2>&1; then
  bot_repair_node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
fi
if (( bot_repair_node_major < 22 )) || ! command -v npm >/dev/null 2>&1; then
  if (( EUID != 0 )); then
    printf '%s\n' 'Install Node.js 22 or newer and npm in Ubuntu, then run this script again.'
    exit 1
  fi
  printf '%s\n' 'Installing Node.js and npm in Ubuntu for Vercel sign-in...'
  apt-get update
  apt-get install -y nodejs npm ca-certificates
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  printf '%s\n' 'Node.js 22 or newer is required. Upgrade Ubuntu Node.js before continuing.'
  exit 1
fi

printf '%s\n' 'Installing the verified Vercel CLI version...'
npm install -g "vercel@${bot_repair_cli_version}"
printf '%s\n' 'Sign in with the Vercel account that can manage mrmobilesofficial_bot.'
printf '%s\n' 'If the browser does not open, open the displayed Vercel sign-in link in Chrome.'
vercel login
exec python3 "$bot_repair_root/scripts/sync_telegram_token.py"
