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
    if destination.is_relative_to(source):
        raise ValueError('The test copy must be outside the source build')
    shutil.copytree(source, destination, symlinks=True)
    destination.chmod(0o700)
    resources = destination / 'resources/loginom'
    manifest_path = resources / 'resource-manifest.json'
    cli_path = destination / 'cli-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    browser = resources / manifest['browser']
    if browser.name != 'chrome':
        raise ValueError('Chromium renderer executable required')
    if any(not path.resolve(strict=True).is_relative_to(destination)
           for path in (browser, browser.parent, manifest_path, cli_path)):
        raise ValueError('Chromium and both manifests must be inside the test copy')
    launcher = browser.with_name('lab2047-browser')
    with launcher.open('x') as script:
        script.write(
            '#!/bin/sh\n'
            'for arg do\n'
            '  case "$arg" in\n'
            '    --remote-debugging-address|--remote-debugging-address=*|--remote-debugging-port|--remote-debugging-port=*)\n'
            '      echo "The test browser requires its own loopback CDP endpoint" >&2\n'
            '      exit 2 ;;\n'
            '  esac\n'
            'done\n'
            'exec "${0%/*}/chrome" --remote-debugging-address=127.0.0.1 --remote-debugging-port=0 "$@"\n'
        )
    launcher.chmod(0o700)
    manifest['browser'] = launcher.relative_to(resources).as_posix()
    digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
    manifest['files'].append(dict(path=manifest['browser'], sha256=digest(launcher)))
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

    cli = json.loads(cli_path.read_text())
    entry = next(item for item in cli['files'] if item['path'] == manifest_path.relative_to(destination).as_posix())
    entry['sha256'] = digest(manifest_path)
    cli['files'].append(dict(path=launcher.relative_to(destination).as_posix(), sha256=digest(launcher), mode=0o700))
    cli_path.write_text(json.dumps(cli, indent=2) + '\n')


if __name__ == '__main__':
    instrument(*(Path(value).resolve() for value in sys.argv[1:]))
