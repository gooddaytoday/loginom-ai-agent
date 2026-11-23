#!/usr/bin/env python3
"""Run the installed NSIS smoke of Desktop v2 on a disposable Windows SSH stand (Python stdlib).

The smoke installs as the account it logs on with. For an ordinary account without a key, --password-file names a
0600 file whose content is the password; it goes to ssh through SSH_ASKPASS and is never printed."""
import argparse
import base64
import os
import pathlib
import stat
import subprocess
import sys
import tempfile
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", help="Linux file or Windows absolute path")
    parser.add_argument("--host", default="winstand", help="SSH config alias")
    parser.add_argument("--login", help="Windows account to log on as (default: the alias's user)")
    parser.add_argument("--password-file", type=pathlib.Path, help="0600 file with that account's password")
    parser.add_argument("--remote-root", default="C:/lab/loginom-smoke", help="Writable stand directory for the run")
    parser.add_argument("--channel", choices=("prod", "beta", "dev"), default="prod")
    parser.add_argument("--version", required=True, help="Expected installed/logged version")
    parser.add_argument("--sha256", help="Expected installer SHA256 (e.g. ci-summary.json)")
    parser.add_argument("--output", required=True, type=pathlib.Path, help="New local report directory")
    parser.add_argument("--timeout", type=int, default=300, help="Startup deadline in seconds")
    parser.add_argument("--runs", type=int, default=3, help="LIFE-01 launches, each closed by the window")
    parser.add_argument("--close-method", choices=("Window", "Renderer"), default="Window")
    parser.add_argument("--mutation", default="None", help="A named mutation of the disposable installation")
    parser.add_argument("--connection", action="store_true", help="The profile holds a 0.4 Loginom connection")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    remote = args.remote_root.rstrip("/") + "/" + uuid.uuid4().hex
    askpass = None
    ssh = ["-o", "ServerAliveInterval=30"]
    environment = dict(os.environ)
    if args.password_file:
        if stat.S_IMODE(args.password_file.stat().st_mode) & 0o077:
            parser.error("--password-file must not be readable by others")
        handle, askpass = tempfile.mkstemp(prefix="smoke-askpass-")
        os.write(handle, ("#!/bin/sh\ncat '" + str(args.password_file.resolve()).replace("'", "'\\''") + "'\n").encode())
        os.close(handle)
        os.chmod(askpass, 0o700)
        environment.update(SSH_ASKPASS=askpass, SSH_ASKPASS_REQUIRE="force", DISPLAY="none")
        ssh += ["-o", "BatchMode=no", "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1",
                "-o", "PreferredAuthentications=password,keyboard-interactive"]
    else:
        ssh += ["-o", "BatchMode=yes"]
    if args.login:
        # Quoted: a local account name may contain spaces.
        ssh += ["-o", 'User="' + args.login + '"']

    def powershell(source):
        encoded = base64.b64encode((
            "[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
            "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; " + source
        ).encode("utf-16le")).decode("ascii")
        return subprocess.run(["ssh", *ssh, args.host,
                               "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + encoded],
                              check=False, env=environment)

    def copy(source, target, check=True):
        return subprocess.run(["scp", "-O", "-q", *ssh, source, target], check=check, env=environment)

    def literal(value):
        return "'" + str(value).replace("'", "''") + "'"

    try:
        if powershell("New-Item -ItemType Directory -Path " + literal(remote) + " | Out-Null").returncode:
            return 2
        script = pathlib.Path(__file__).with_suffix(".ps1")
        copy(str(script), args.host + ":" + remote + "/windows-installed-smoke.ps1")
        copy(str(script.with_name("windows-sidecar-smoke.mjs")), args.host + ":" + remote + "/windows-sidecar-smoke.mjs")
        installer = args.installer
        if pathlib.Path(installer).is_file():
            copy(installer, args.host + ":" + remote + "/installer.exe")
            installer = remote + "/installer.exe"
        command = ("& " + literal(remote + "/windows-installed-smoke.ps1") + " -Installer " + literal(installer)
                   + " -RunRoot " + literal(remote + "/run") + " -Channel " + literal(args.channel)
                   + " -ExpectedVersion " + literal(args.version) + " -TimeoutSeconds " + str(args.timeout)
                   + " -Runs " + str(args.runs) + " -CloseMethod " + literal(args.close_method)
                   + " -Mutation " + literal(args.mutation) + (" -Connection" if args.connection else ""))
        if args.sha256:
            command += " -ExpectedSha256 " + literal(args.sha256)
        result = powershell(command)
        # Always collect the result, including after a failed smoke. Evidence stays on the stand too.
        report = copy(args.host + ":" + remote + "/run/report.json", str(args.output), check=False)
        logs = copy(args.host + ":" + remote + "/run/logs.zip", str(args.output), check=False)
        print("Windows evidence: " + remote, flush=True)
        if report.returncode == 0:
            print("Local report: " + str(args.output / "report.json"), flush=True)
        if report.returncode != 0 or (result.returncode == 0 and logs.returncode != 0):
            return 2
        return result.returncode
    finally:
        if askpass:
            os.unlink(askpass)


if __name__ == "__main__":
    sys.exit(main())
