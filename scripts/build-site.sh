#!/bin/sh
set -eu
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
dest="$root/dist"
rm -rf "$dest"
mkdir -p "$dest"
cp "$root/web/index.html" "$dest/index.html"
cp -R "$root/deals" "$dest/deals"
cp -R "$root/rates" "$dest/rates"
# The dashboard also looks for these files next to index.html.
if [ -f "$dest/deals/deals.js" ]; then
  cp "$dest/deals/deals.js" "$dest/deals.js"
fi
if [ -f "$dest/deals/deals.json" ]; then
  cp "$dest/deals/deals.json" "$dest/deals.json"
fi
if [ -f "$dest/rates/rates.json" ]; then
  cp "$dest/rates/rates.json" "$dest/rates.json"
fi
echo "built $dest"
