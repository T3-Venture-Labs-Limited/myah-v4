#!/usr/bin/env bash

set -euo pipefail

min_free_space_gb="${MIN_FREE_SPACE_GB:-}"
dry_run="${DRY_RUN:-false}"
available_kib_override="${AVAILABLE_KIB_FOR_TEST:-}"

if [[ -n "${min_free_space_gb}" && ! "${min_free_space_gb}" =~ ^[0-9]+$ ]]; then
  echo "MIN_FREE_SPACE_GB must be a non-negative integer" >&2
  exit 1
fi

if [[ -n "${available_kib_override}" && "${dry_run}" != "true" ]]; then
  echo "AVAILABLE_KIB_FOR_TEST requires DRY_RUN=true" >&2
  exit 1
fi

if [[ -n "${available_kib_override}" ]]; then
  if [[ ! "${available_kib_override}" =~ ^[0-9]+$ ]]; then
    echo "AVAILABLE_KIB_FOR_TEST must be a non-negative integer" >&2
    exit 1
  fi
  available_kib="${available_kib_override}"
else
  available_kib="$(df -Pk / | awk 'NR == 2 { print $4 }')"
fi

echo "Available space on /: ${available_kib} KiB"

available_kib_number=$((10#${available_kib}))
cleanup_required=true
if [[ -n "${min_free_space_gb}" ]]; then
  min_free_space_kib=$((10#${min_free_space_gb} * 1024 * 1024))
  if (( available_kib_number >= min_free_space_kib )); then
    cleanup_required=false
  fi
fi

cleanup_started_at=${SECONDS}
if [[ "${cleanup_required}" == "false" ]]; then
  echo "cleanup skipped"
else
  echo "cleanup required"
  paths=(
    /usr/share/dotnet
    /usr/local/lib/android
    /opt/ghc
    /opt/hostedtoolcache/CodeQL
  )
  for path in "${paths[@]}"; do
    if [[ "${dry_run}" == "true" ]]; then
      echo "would remove: ${path}"
    else
      sudo rm -rf "${path}"
    fi
  done
fi

echo "cleanup elapsed seconds: $((SECONDS - cleanup_started_at))"
df -h /
