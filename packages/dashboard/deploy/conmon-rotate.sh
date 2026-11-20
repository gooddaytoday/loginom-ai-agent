#!/bin/bash
# Managed by loginom-dashboard release installer
set -euo pipefail
name='' logger='' limit=''
args=("$@")
for ((i=0; i + 1 < ${#args[@]}; i++)); do
  case ${args[i]} in
    -n|--name) name=${args[i+1]};;
    -l|--log-path) logger=${args[i+1]};;
    --log-size-max) limit=${args[i+1]};;
  esac
done
if [[ $logger == k8s-file:* && $limit =~ ^[1-9][0-9]*$ ]]; then
  case $name in
    loginom-dashboard-web|loginom-dashboard-publisher|loginom-dashboard-builder)
      # Podman 5.6 passes the byte limit to conmon, but not its rotation options.
      set -- "$@" --log-rotate --log-max-files 2;;
  esac
fi
exec conmon "$@"
