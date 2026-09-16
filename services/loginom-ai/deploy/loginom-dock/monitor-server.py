#!/usr/bin/env python3
"""Record bounded health facts; never persist provider messages or credentials."""
import json
import os
import shutil
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def main():
    os.umask(0o077)
    root = Path('/opt/loginom-dock')
    config = json.loads((root / 'config/client.json').read_text())
    started = time.monotonic()
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'api_ok': False}
    try:
        request = urllib.request.Request(
            'http://127.0.0.1:1933/api/v1/observer/system',
            headers={'Authorization': 'Bearer ' + config['api_key']},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)['result']
        report['api_ok'] = True
        report['server_healthy'] = result.get('is_healthy') is True
        report['components'] = {
            name: {'healthy': value.get('is_healthy') is True,
                   'has_errors': value.get('has_errors') is True}
            for name, value in result.get('components', {}).items()
            if name in {'queue', 'models', 'vikingdb', 'lock', 'retrieval', 'filesystem'}
        }
    except Exception:
        report['error'] = 'Dock health check did not complete'
    report['api_latency_ms'] = round((time.monotonic() - started) * 1000)
    space = shutil.disk_usage(root)
    report['disk_free_bytes'] = space.free
    report['disk_free_percent'] = round(space.free * 100 / space.total, 1)
    try:
        latest = Path((root / 'latest-backup').read_text().strip())
        if not latest.is_relative_to(root / 'backups'):
            raise ValueError('Unexpected backup path')
        report['backup_age_seconds'] = round(time.time() - (latest / 'SHA256SUMS').stat().st_mtime)
    except Exception:
        report['backup_age_seconds'] = None
    report['healthy'] = (report['api_ok'] and report.get('server_healthy', False)
                         and space.free >= 10 * 1024**3
                         and report['backup_age_seconds'] is not None
                         and report['backup_age_seconds'] < 48 * 3600)
    directory = root / 'monitoring'
    directory.mkdir(mode=0o700, exist_ok=True)
    pending = directory / 'health.pending.json'
    pending.write_text(json.dumps(report, indent=2) + '\n')
    pending.replace(directory / 'health.json')
    print(json.dumps(report))
    return 0 if report['healthy'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
