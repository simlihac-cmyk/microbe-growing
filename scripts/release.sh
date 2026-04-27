#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: ./scripts/release.sh v1.0.1" >&2
  exit 1
fi

if [[ ! "$VERSION" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Version must look like v1.0.1 or 1.0.1" >&2
  exit 1
fi

SEMVER="${VERSION#v}"
TAG="v$SEMVER"
BRANCH="$(git branch --show-current)"

if [[ -z "$BRANCH" ]]; then
  echo "Could not determine the current git branch." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag already exists: $TAG" >&2
  exit 1
fi

npm version --no-git-tag-version "$SEMVER"
node - "$TAG" <<'NODE'
const fs = require("fs");
const version = process.argv[2].toUpperCase();
const file = "src/main.ts";
const source = fs.readFileSync(file, "utf8");
const next = source.replace(/<p class="version">V[^<]+<\/p>/, `<p class="version">${version}</p>`);

if (source === next) {
  console.error("Could not update title screen version in src/main.ts.");
  process.exit(1);
}

fs.writeFileSync(file, next);
NODE

npm test
npm run build

git add -A
git commit -m "release: $TAG"
git tag -a "$TAG" -m "$TAG"
git push origin "$BRANCH" --follow-tags

launchctl kickstart -k "gui/$(id -u)/com.sg_mac.microbe-growing"
sleep 3
curl -fsSI http://127.0.0.1:4130/ | head -n 1
