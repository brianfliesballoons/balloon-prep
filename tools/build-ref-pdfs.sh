#!/bin/zsh
# Rebuild the printable PDFs of the Reference cards (run after any card change, then commit refs/pdf).
# Needs Google Chrome. Serves the repo on localhost:8765 and prints each card with the app's own print layout.
set -e
ROOT="${0:A:h:h}"; OUT="$ROOT/refs/pdf"; CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE=$(mktemp -d); mkdir -p "$OUT"
python3 -m http.server 8765 --directory "$ROOT" >/dev/null 2>&1 & SRV=$!; trap 'kill $SRV; rm -rf "$PROFILE"' EXIT; sleep 1
ids=(all airspace legend $(python3 -c "import json,sys;print(' '.join(c['id'] for c in json.load(open(sys.argv[1]))))" "$ROOT/refs/cards.json"))
for id in $ids; do
  "$CH" --headless=new --disable-gpu --no-pdf-header-footer --user-data-dir="$PROFILE" --virtual-time-budget=8000 \
    --print-to-pdf="$OUT/$id.pdf" "http://localhost:8765/?b=$RANDOM#print=$id" 2>/dev/null
  echo "$id: $(pdfinfo "$OUT/$id.pdf" 2>/dev/null | awk '/Pages/{print $2}') page(s)"
done
