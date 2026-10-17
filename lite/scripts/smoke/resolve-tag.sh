#!/usr/bin/env bash
set -euo pipefail

tag="${INPUT_TAG:-}"
if [ "${EVENT_NAME:-}" = "workflow_run" ]; then
  tag="${RUN_BRANCH:-}"
fi

if [ -z "$tag" ]; then
  tag=$(gh release list --repo "$GITHUB_REPOSITORY" --limit 100 --json tagName,publishedAt \
    --jq '[.[] | select(.tagName | test("^(lite-v[0-9A-Za-z._+-]+|v3\\.[0-9]+\\.[0-9]+-.+)$"))] | sort_by(.publishedAt) | reverse | .[0].tagName')
fi

if ! printf '%s\n' "$tag" | grep -Eq '^(lite-v[0-9A-Za-z._+-]+|v3\.[0-9]+\.[0-9]+-.+)$'; then
  echo "no lite-v* or v3 prerelease to test (got '${tag}')" >&2
  exit 1
fi

echo "tag=$tag" >> "$GITHUB_OUTPUT"
echo "Testing $tag"
