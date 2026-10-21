#!/usr/bin/env bash
set -euo pipefail

tag="${INPUT_TAG:-}"
if [ "${EVENT_NAME:-}" = "workflow_run" ]; then
  tag="${RUN_BRANCH:-}"
fi

if [ -z "$tag" ]; then
  tag=$(gh release list --repo "$GITHUB_REPOSITORY" --limit 100 --json tagName,publishedAt \
    --jq '[.[] | select(.tagName | test("^neo-v[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.]+)?$"))] | sort_by(.publishedAt) | reverse | .[0].tagName')
fi

if [ "${EVENT_NAME:-}" = "push" ] && { [ -z "$tag" ] || [ "$tag" = "null" ]; }; then
  echo "No published NEO release; artifact smoke is skipped."
  echo "tag=" >> "$GITHUB_OUTPUT"
  exit 0
fi

if ! printf '%s\n' "$tag" | grep -Eq '^neo-v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
  echo "no neo-v release to test (got '${tag}')" >&2
  exit 1
fi

echo "tag=$tag" >> "$GITHUB_OUTPUT"
echo "Testing $tag"
