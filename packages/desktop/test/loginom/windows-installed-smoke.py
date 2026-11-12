#!/usr/bin/env python3
"""Run the installed NSIS smoke on a disposable Windows SSH stand (Python stdlib)."""
import argparse
import base64
import pathlib
import subprocess
import sys
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", help="Linux file, Windows absolute path, or HTTPS URL")
    parser.add_argument("--host", default="winstand", help="SSH config alias")
    parser.add_argument("--channel", choices=("prod", "beta", "dev"), default="prod")
    parser.add_argument("--version", required=True, help="Expected installed/logged version")
    parser.add_argument("--sha256", help="Expected installer SHA256 (e.g. ci-summary.json)")
    parser.add_argument("--output", required=True, type=pathlib.Path, help="New local report directory")
    parser.add_argument("--timeout", type=int, default=120, help="Startup/exit deadline in seconds")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    remote = "C:/lab/loginom-smoke/" + uuid.uuid4().hex

    def powershell(source):
        encoded = base64.b64encode((
            "[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
            "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; " + source
        ).encode("utf-16le")).decode("ascii")
        return subprocess.run(["ssh", "-o", "BatchMode=yes", args.host,
                               "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + encoded], check=False)

    def literal(value):
        return "'" + str(value).replace("'", "''") + "'"

    if powershell("New-Item -ItemType Directory -Path " + literal(remote) + " | Out-Null").returncode:
        return 2
    script = pathlib.Path(__file__).with_suffix(".ps1")
    subprocess.run(["scp", "-O", str(script), args.host + ":" + remote + "/smoke.ps1"], check=True)
    subprocess.run(["scp", "-O", str(script.with_name("windows-sidecar-smoke.mjs")),
                    args.host + ":" + remote + "/windows-sidecar-smoke.mjs"], check=True)
    installer = args.installer
    if not installer.startswith("https://") and pathlib.Path(installer).is_file():
        subprocess.run(["scp", "-O", installer, args.host + ":" + remote + "/installer.exe"], check=True)
        installer = remote + "/installer.exe"
    command = ("& " + literal(remote + "/smoke.ps1") + " -Installer " + literal(installer)
               + " -RunRoot " + literal(remote) + " -Channel " + literal(args.channel)
               + " -ExpectedVersion " + literal(args.version) + " -TimeoutSeconds " + str(args.timeout)
               + " -CloseMethod Inspector")
    if args.sha256:
        command += " -ExpectedSha256 " + literal(args.sha256)
    result = powershell(command)
    # Always collect the result, including after a failed smoke. Evidence stays on the stand too.
    copy = subprocess.run(["scp", "-O", args.host + ":" + remote + "/report.json", str(args.output)])
    probe = subprocess.run(["scp", "-O", args.host + ":" + remote + "/sidecar.json", str(args.output)])
    logs = subprocess.run(["scp", "-O", args.host + ":" + remote + "/logs.zip", str(args.output)])
    print("Windows evidence: " + remote, flush=True)
    if copy.returncode == 0:
        print("Local report: " + str(args.output / "report.json"), flush=True)
    if copy.returncode != 0 or (result.returncode == 0 and (logs.returncode != 0 or probe.returncode != 0)):
        return 2
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
