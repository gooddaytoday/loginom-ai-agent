#!/usr/bin/env python3
"""Password-authenticated, foreground reverse SSH route from the VPN machine.

The server endpoint is a private Unix socket, never a public TCP port. Credentials
come only from the explicitly selected Dock environment file, not personal SSH
identities. Stop this process after importing; existing indexed content stays usable.
"""

import argparse
import os
import shlex
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    args = parser.parse_args()
    config = {}
    for line in args.env_file.read_text().splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        words = shlex.split(value, comments=True)
        config[key.strip()] = words[0] if words else ""
    for key in ("LOGINOM_DOCK_SSH_HOST", "LOGINOM_DOCK_SSH_USER", "LOGINOM_DOCK_SSH_PASSWORD"):
        if not config.get(key):
            parser.error(f"Missing {key} in the Dock environment file")
    if shutil.which("sshpass") is None:
        parser.error("sshpass is required for the configured password-based SSH access")
    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    env = dict(os.environ, SSHPASS=config["LOGINOM_DOCK_SSH_PASSWORD"])
    ssh = [
        "sshpass",
        "-e",
        "ssh",
        "-p",
        config.get("LOGINOM_DOCK_SSH_PORT", "22"),
        "-o",
        "PreferredAuthentications=password",
        "-o",
        "PubkeyAuthentication=no",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        f"UserKnownHostsFile={args.state_dir.resolve() / 'known_hosts'}",
        "-o",
        "ConnectTimeout=30",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=3",
        "-o",
        "ExitOnForwardFailure=yes",
        "-N",
        "-R",
        "/opt/loginom-dock/tunnel/gitlab.sock:git.basegroup.ru:80",
        f"{config['LOGINOM_DOCK_SSH_USER']}@{config['LOGINOM_DOCK_SSH_HOST']}",
    ]
    print("Opening private Dock GitLab tunnel; no TCP port will be published", flush=True)
    os.execvpe(ssh[0], ssh, env)


if __name__ == "__main__":
    main()
