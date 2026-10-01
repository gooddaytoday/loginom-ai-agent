#!/usr/bin/env bash
# Shared by the candidate build and its isolated I/O controls.
configure_build_environment() {
  local build_root="$1" name value fallback canonical
  [[ "$build_root" == /* ]] || { echo "build root must be absolute" >&2; return 1; }
  canonical="$(realpath -m -- "$build_root")" || return 1
  [[ "$canonical" != /tmp && "$canonical" != /tmp/* ]] || {
    echo "build root must be on disk outside quota-limited /tmp" >&2
    return 1
  }
  for name in TMPDIR BUN_INSTALL_CACHE_DIR npm_config_cache; do
    case "$name" in
      TMPDIR) fallback="$build_root/tmp" ;;
      BUN_INSTALL_CACHE_DIR) fallback="$build_root/cache/bun" ;;
      npm_config_cache) fallback="$build_root/cache/npm" ;;
    esac
    value="${!name:-$fallback}"
    [[ "$value" == /* ]] || { echo "$name must be absolute" >&2; return 1; }
    canonical="$(realpath -m -- "$value")" || return 1
    if [[ "$canonical" == /tmp || "$canonical" == /tmp/* ]]; then
      echo "$name points to quota-limited /tmp; using $fallback" >&2
      value="$fallback"
    fi
    mkdir -p -m 700 -- "$value" || return 1
    [[ -O "$value" && -w "$value" && -x "$value" ]] || {
      echo "$name must be writable and owned by the build user: $value" >&2
      return 1
    }
    printf -v "$name" '%s' "$value"
    export "$name"
  done
}
