#!/usr/bin/env bash
one_match() {
  if [[ $# -ne 1 || ! -f "$1" ]]; then
    echo "expected one existing file, found $#: $*" >&2
    return 1
  fi
  printf '%s\n' "$1"
}
