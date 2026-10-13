#!/usr/bin/env python3
"""Conditionally replace only an issue description; never dispatch work."""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

from supplement import DeliveryError, request, save


def update(args):
    base = os.environ['MULTICA_SERVER_URL'].rstrip('/')
    url = urllib.parse.urlsplit(base)
    if url.scheme not in ('http', 'https') or not url.netloc or url.username or url.query or url.fragment:
        raise DeliveryError('Invalid server URL')
    if os.environ.get('MULTICA_TASK_ID') and not os.environ['MULTICA_TOKEN'].startswith('mat_'):
        raise DeliveryError('Task context requires its own task token')
    issue = str(uuid.UUID(args.issue))
    content = Path(args.checkpoint).read_text(encoding='utf-8')
    if args.revision < 1 or not content.strip() or len(content.splitlines()) > 20 or any(len(line) > 500 for line in content.splitlines()):
        raise DeliveryError('Use a positive revision and 1-20 short checkpoint lines (500 characters max)')
    headers = {'Authorization': 'Bearer ' + os.environ['MULTICA_TOKEN'], 'Content-Type': 'application/json'}
    if os.environ.get('MULTICA_WORKSPACE_ID'):
        headers['X-Workspace-ID'] = os.environ['MULTICA_WORKSPACE_ID']
    route = f'issues/{issue}'
    path = Path(args.receipt)
    if path.is_symlink():
        raise DeliveryError('Receipt must not be a symlink')
    key = hashlib.sha256(json.dumps([base, issue, args.revision, content]).encode()).hexdigest()
    if path.exists():
        record = json.loads(path.read_text())
        if record['key'] != key:
            raise DeliveryError('Receipt belongs to another checkpoint')
    else:
        record = {'key': key, 'issue': issue, 'revision': args.revision, 'state': 'prepared'}
        with open(path, 'x', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
            json.dump(record, stream)
            stream.flush()
            os.fsync(stream.fileno())
    current = request(base, headers, route)
    if current.get('description') == content:
        record.update(state='verified', observed_revision=current['revision'])
        save(path, record)
        return record
    if record['state'] != 'prepared':
        raise DeliveryError('Previous write not confirmed; reread and reconcile, never blindly repeat')
    if current['revision'] != args.revision:
        record['state'] = 'conflict'
        save(path, record)
        raise DeliveryError('Revision conflict; reread and reconcile the new checkpoint')
    record['state'] = 'sending'
    save(path, record)
    req = urllib.request.Request(base + '/api/' + route,
        data=json.dumps({'description': content, 'expected_revision': args.revision}).encode(),
        headers=headers, method='PUT')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            response.read()
    except urllib.error.HTTPError as error:
        if error.code in (401, 403, 409):
            record['state'] = 'conflict' if error.code == 409 else 'denied'
            save(path, record)
            raise DeliveryError('Revision conflict; reread and reconcile' if error.code == 409 else 'Permission denied; keep draft, never substitute owner token') from None
        # An error response may follow a committed write. Reconcile below.
    except (OSError, http.client.HTTPException):
        pass
    current = request(base, headers, route)
    if current.get('description') != content:
        raise DeliveryError('Write outcome unconfirmed or superseded; preserve draft and receipt, no retry')
    record.update(state='verified', observed_revision=current['revision'])
    save(path, record)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--issue', required=True)
    parser.add_argument('--revision', required=True, type=int)
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--receipt', required=True)
    try:
        print(json.dumps(update(parser.parse_args())))
    except (OSError, ValueError, KeyError, http.client.HTTPException) as error:
        print(str(error) if isinstance(error, DeliveryError) else type(error).__name__, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
