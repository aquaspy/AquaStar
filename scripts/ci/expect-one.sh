#!/usr/bin/env bash
set -euo pipefail

dir=${1:?directory}
pattern=${2:?pattern}

shopt -s nullglob extglob
# Empty IFS keeps a space inside PATTERN from splitting before the glob runs.
IFS=
# shellcheck disable=SC2206
matches=($dir/$pattern)
unset IFS
count=${#matches[@]}
if [[ $count -eq 1 && ! -f ${matches[0]} ]]; then
  count=0
fi
if [[ $count -ne 1 ]]; then
  printf 'expected exactly one %s in %s, found %s\n' "$pattern" "$dir" "$count" >&2
  exit 1
fi
printf '%s\n' "${matches[0]}"
