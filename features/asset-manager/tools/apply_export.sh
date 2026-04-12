#!/bin/zsh
set -euo pipefail
UI_ROOT="/Users/samg/AI/OpenClaw/dev/asset-manager"
SRC_DEFAULT="$HOME/Downloads/assets.updated.json"
DST="$UI_ROOT/data/assets.json"
SRC="${1:-$SRC_DEFAULT}"

if [[ ! -f "$SRC" ]]; then
  echo "❌ Export file not found: $SRC"
  echo "Usage: $0 [path-to-assets.updated.json]"
  exit 1
fi

mkdir -p "$UI_ROOT/data"

python3 - <<'PY' "$SRC"
import json,sys
p=sys.argv[1]
with open(p,'r',encoding='utf-8') as f:
    json.load(f)
print('JSON valid')
PY

cp "$SRC" "$DST"
echo "✅ Applied export to: $DST"
