#!/usr/bin/env python3
"""Copy the trial build and add a loopback-only attachment point to its browser."""
import hashlib
import json
from pathlib import Path
import shutil
import sys


def instrument(source, destination):
    if destination.exists():
        raise FileExistsError(destination)
    shutil.copytree(source, destination, symlinks=True)
    destination.chmod(0o700)
    resources = destination / 'resources/loginom'
    manifest_path = resources / 'resource-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    browser = resources / manifest['browser']
    if browser.name != 'chrome':
        raise ValueError('Chromium renderer executable required')
    launcher = browser.with_name('lab2047-browser')
    launcher.write_text(
        '#!/bin/sh\n'
        'exec "${0%/*}/chrome" --remote-debugging-address=127.0.0.1 --remote-debugging-port=0 "$@"\n'
    )
    launcher.chmod(0o700)
    manifest['browser'] = launcher.relative_to(resources).as_posix()
    digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
    manifest['files'].append(dict(path=manifest['browser'], sha256=digest(launcher)))
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

    cli_path = destination / 'cli-manifest.json'
    cli = json.loads(cli_path.read_text())
    entry = next(item for item in cli['files'] if item['path'] == manifest_path.relative_to(destination).as_posix())
    entry['sha256'] = digest(manifest_path)
    cli['files'].append(dict(path=launcher.relative_to(destination).as_posix(), sha256=digest(launcher), mode=0o700))
    cli_path.write_text(json.dumps(cli, indent=2) + '\n')


if __name__ == '__main__':
    instrument(*(Path(value).resolve() for value in sys.argv[1:]))
