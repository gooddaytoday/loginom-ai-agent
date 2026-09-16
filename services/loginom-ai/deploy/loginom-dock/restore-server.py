#!/usr/bin/env python3
"""Restore a complete Dock backup into a new, isolated stack for rehearsal.

The original containers, volumes, ports and credentials are never modified.
Promotion to public ports is a separate operator action after verification.
"""
import argparse
import json
import os
import re
import subprocess
import tarfile
import time
import urllib.request
from pathlib import Path


def run(*args, capture=False, cwd=None):
    result = subprocess.run(args, check=True, text=True, cwd=cwd,
                            stdout=subprocess.PIPE if capture else subprocess.DEVNULL)
    return result.stdout.strip() if capture else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--port', type=int, default=19433)
    parser.add_argument('--https-port', type=int, default=19443)
    args = parser.parse_args()
    os.umask(0o077)
    if os.geteuid() != 0 or not re.fullmatch(r'dock-restore-[a-z0-9-]+', args.name):
        raise SystemExit('Use root and a unique dock-restore-* name')
    backup = args.backup.resolve()
    root = args.root.resolve()
    if root.exists() or not 1024 <= args.port <= 65535 or not 1024 <= args.https_port <= 65535:
        raise SystemExit('Restore directory must be new; use unprivileged loopback ports')
    run('sha256sum', '-c', 'SHA256SUMS', cwd=backup)
    image_lines = (backup / 'image-checksums').read_text().splitlines()
    if not image_lines or any(not re.fullmatch(r'[a-f0-9]{64}  \.\./images/[a-f0-9]{64}\.tar\.gz', line) for line in image_lines):
        raise SystemExit('Invalid backup image manifest')
    run('sha256sum', '-c', 'image-checksums', cwd=backup)
    images = {}
    for line in (backup / 'container-images').read_text().splitlines():
        container, image = line.split()
        if not re.fullmatch(r'loginom-dock-(openviking|caddy|ollama|gitlab-gateway|gitlab-lfs-proxy)-1', container) or not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
            raise SystemExit('Invalid container image identity')
        images[container.removeprefix('loginom-dock-').removesuffix('-1')] = image
    if set(images) != {'openviking', 'caddy', 'ollama', 'gitlab-gateway', 'gitlab-lfs-proxy'}:
        raise SystemExit('Incomplete service image manifest')
    for image in set(images.values()):
        archive = backup.parent / 'images' / (image.removeprefix('sha256:') + '.tar.gz')
        run('docker', 'image', 'load', '-i', str(archive))
        if run('docker', 'image', 'inspect', image, '--format', '{{.Id}}', capture=True) != image:
            raise SystemExit('Restored image identity differs')
    root.mkdir(mode=0o700, parents=True)

    def extract(archive, destination):
        destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        with tarfile.open(backup / archive, 'r:gz') as tar:
            tar.extractall(destination, filter='data')

    for archive in ('config.tar.gz', 'deployment.tar.gz', 'assets.tar.gz'):
        extract(archive, root)
    extract('source.tar.gz', root / 'src')
    (root / 'tunnel').mkdir(mode=0o700)
    volumes = {}
    for name in ('dock_data', 'caddy_data', 'caddy_config', 'ollama_data', 'gitlab_tls'):
        volume = args.name + '_' + name
        existing = subprocess.run(['docker', 'volume', 'inspect', volume], capture_output=True)
        if existing.returncode == 0:
            raise SystemExit('Restore volume already exists; select a new name')
        run('docker', 'volume', 'create', '--label', 'loginom-dock.restore=' + args.name, volume)
        mount = Path(run('docker', 'volume', 'inspect', volume, '--format', '{{.Mountpoint}}', capture=True))
        extract('data.tar.gz' if name == 'dock_data' else name + '.tar.gz', mount)
        volumes[name] = volume
    network = args.name + '_default'
    private = args.name + '_gitlab'
    run('docker', 'network', 'create', '--label', 'loginom-dock.restore=' + args.name, network)
    run('docker', 'network', 'create', '--internal', '--label', 'loginom-dock.restore=' + args.name, private)
    containers = []

    def create(service, options, net=network, alias=None):
        name = args.name + '-' + service
        run('docker', 'create', '--name', name, '--label', 'loginom-dock.restore=' + args.name,
            '--network', net, '--network-alias', alias or service, *options, images[service])
        containers.append(name)
        return name

    create('ollama', ['-v', volumes['ollama_data'] + ':/root/.ollama',
                     '-e', 'OLLAMA_NUM_PARALLEL=1', '-e', 'OLLAMA_MAX_LOADED_MODELS=1'])
    create('gitlab-gateway', ['-v', str(root / 'config/Caddyfile.gitlab') + ':/etc/caddy/Caddyfile:ro',
                            '-v', str(root / 'tunnel') + ':/run/dock-tunnel:ro', '-v', volumes['gitlab_tls'] + ':/data'],
           net=private, alias='git.basegroup.ru')
    # The image's default entrypoint is overridden exactly as in production Compose.
    name = args.name + '-gitlab-lfs-proxy'
    run('docker', 'create', '--name', name, '--label', 'loginom-dock.restore=' + args.name,
        '--network', private, '--network-alias', 'gitlab-lfs-proxy', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--entrypoint', 'python',
        '-v', str(root / 'deploy-stage2/gitlab-lfs-proxy.py') + ':/opt/loginom-dock/gitlab-lfs-proxy.py:ro',
        '-v', str(root / 'tunnel') + ':/run/dock-tunnel:ro', images['gitlab-lfs-proxy'],
        '-I', '/opt/loginom-dock/gitlab-lfs-proxy.py')
    containers.append(name)
    options = ['-p', f'127.0.0.1:{args.port}:1933', '-e', 'OPENVIKING_WITH_BOT=0',
               '-e', 'OPENVIKING_SERVER_PORT=1933', '-v', volumes['dock_data'] + ':/app/.openviking',
               '-v', str(root / 'config/ov.conf') + ':/app/.openviking/ov.conf:ro',
               '-v', str(root / 'assets') + ':/opt/loginom-dock/assets',
               '-v', str(root / 'config/ovcli.settings.conf') + ':/app/.openviking/ovcli.settings.conf:ro']
    for name in ('ca-bundle.crt', 'gitconfig', 'ovcli.conf', 'assets-credentials.json'):
        options += ['-v', str(root / 'config' / name) + ':/etc/loginom-dock/' + name + ':ro']
    for key, value in {'SSL_CERT_FILE': 'ca-bundle.crt', 'REQUESTS_CA_BUNDLE': 'ca-bundle.crt',
                       'GIT_SSL_CAINFO': 'ca-bundle.crt', 'GIT_CONFIG_SYSTEM': 'gitconfig',
                       'OPENVIKING_CLI_CONFIG_FILE': 'ovcli.conf',
                       'OPENVIKING_ASSETS_CREDENTIALS_FILE': 'assets-credentials.json'}.items():
        options += ['-e', key + '=/etc/loginom-dock/' + value]
    app = create('openviking', options)
    run('docker', 'network', 'connect', private, app)
    # Only the non-secret domain is consumed from the saved deployment config.
    domain = next(line.split('=', 1)[1] for line in (root / 'config/deploy.env').read_text().splitlines()
                  if line.startswith('LOGINOM_DOCK_DOMAIN='))
    if not re.fullmatch(r'[a-z0-9.-]+', domain):
        raise SystemExit('Unexpected saved Dock domain')
    create('caddy', ['-p', f'127.0.0.1:{args.https_port}:443', '-e', 'LOGINOM_DOCK_DOMAIN=' + domain,
                     '-v', str(root / 'src/deploy/loginom-dock/Caddyfile.server') + ':/etc/caddy/Caddyfile:ro',
                     '-v', volumes['caddy_data'] + ':/data', '-v', volumes['caddy_config'] + ':/config'])
    (root / 'restore-state.json').write_text(json.dumps({'backup': str(backup), 'containers': containers,
        'volumes': volumes, 'networks': [network, private], 'port': args.port, 'https_port': args.https_port,
        'domain': domain, 'images': images}, indent=2) + '\n')
    try:
        run('docker', 'start', *containers)
        for _ in range(60):
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{args.port}/ready', timeout=5) as response:
                    if response.status == 200: break
            except Exception: pass
            time.sleep(2)
        else: raise RuntimeError('Restored Dock did not become ready')
        print(json.dumps({'restored': True, 'services': len(containers), 'volumes': len(volumes),
                          'public_ports': False, 'root': str(root)}))
    except Exception:
        subprocess.run(['docker', 'stop', *containers], stdout=subprocess.DEVNULL)
        raise SystemExit('Restore startup failed; preserved isolated files for diagnosis') from None


if __name__ == '__main__':
    main()
