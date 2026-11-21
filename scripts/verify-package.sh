#!/usr/bin/env bash
set -euo pipefail

mode=${1:?Expected local or registry}
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export WHOLLAMA_DIR="$tmp/whollama"
export npm_config_cache="$tmp/npm-cache"
export npm_config_userconfig="$tmp/npmrc"
export npm_config_fetch_retries=0
export npm_config_fetch_timeout=20000
touch "$npm_config_userconfig"
unset NODE_AUTH_TOKEN
version=$(node -p "require('$root/package.json').version")

case "$mode" in
  local)
    (cd "$root" && npm pack --json --pack-destination "$tmp" > "$tmp/pack.json")
    ;;
  registry)
    for attempt in 1 2 3 4 5 6; do
      if (cd "$tmp" && npm pack "@tsany/whollama@$version" --json > "$tmp/pack.json"); then
        break
      fi
      if [ "$attempt" -eq 6 ]; then
        echo "Package $version was not downloadable after $attempt attempts" >&2
        exit 1
      fi
      sleep 15
    done
    npm view "@tsany/whollama@$version" dist.integrity --prefer-online > "$tmp/integrity"
    node -e '
      const fs = require("fs")
      const pack = JSON.parse(fs.readFileSync(process.argv[1]))[0]
      const expected = fs.readFileSync(process.argv[2], "utf8").trim()
      if (!expected || pack.integrity !== expected) throw new Error("Registry integrity mismatch")
    ' "$tmp/pack.json" "$tmp/integrity"
    ;;
  *)
    echo "Expected local or registry" >&2
    exit 2
    ;;
esac

node -e '
  const fs = require("fs")
  const pack = JSON.parse(fs.readFileSync(process.argv[1]))[0]
  const paths = new Set(pack.files.map(file => file.path))
  for (const required of ["package.json", "dist/index.js", "data/benchmarks.json", "data/catalog.json"]) {
    if (!paths.has(required)) throw new Error(`Missing ${required}`)
  }
  if ([...paths].some(path => path.startsWith("graphify-out/"))) throw new Error("Graph output included")
  fs.writeFileSync(process.argv[2], pack.filename)
' "$tmp/pack.json" "$tmp/filename"

mkdir "$tmp/project"
cd "$tmp/project"
npm install --no-save --ignore-scripts "$tmp/$(cat "$tmp/filename")"
./node_modules/.bin/whollama --offline --json --top 1 > "$tmp/result.json"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$tmp/result.json"
./node_modules/.bin/whollama compare qwen3:14b llama3.2:3b --offline --json > "$tmp/compare.json"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$tmp/compare.json"
