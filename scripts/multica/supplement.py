#!/usr/bin/env python3
"""Deliver an update to one existing Multica run, never enqueue a successor."""
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


class DeliveryError(ValueError):
    """A deliberate diagnostic whose text contains no credentials or input values."""


def request(base, headers, route, payload=None, *, require_complete=False):
    req = urllib.request.Request(base + '/api/' + route,
        data=None if payload is None else json.dumps(payload).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        if require_complete and response.headers.get('X-Comments-Truncated'):
            raise DeliveryError('Comment history truncated; reconcile before dispatch')
        return json.load(response)


def save(path, value):
    temporary = path.with_name(path.name + '.tmp')
    with open(temporary, 'w', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def deliver(args):
    base = os.environ['MULTICA_SERVER_URL'].rstrip('/')
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme not in ('https', 'http') or not parsed.netloc or parsed.username or parsed.query or parsed.fragment:
        raise DeliveryError('Invalid server URL')
    # IDs are path components, never arbitrary API routes.
    issue, task = str(uuid.UUID(args.issue)), str(uuid.UUID(args.task))
    content = Path(args.message).read_text()
    if not content.strip():
        raise DeliveryError('Empty update')
    receipt = Path(args.receipt)
    if receipt.is_symlink():
        raise DeliveryError('Receipt must not be a symlink')
    fingerprint = hashlib.sha256(json.dumps([base, issue, task, content]).encode()).hexdigest()
    if receipt.exists():
        record = json.loads(receipt.read_text())
        if record['fingerprint'] != fingerprint:
            raise DeliveryError('Receipt belongs to a different update; do not overwrite it')
    else:
        record = {'fingerprint': fingerprint, 'request_id': str(uuid.uuid4()), 'issue': issue, 'task': task, 'state': 'prepared'}
        # Claim the receipt before sending: retries keep the same server deduplication key.
        with open(receipt, 'x', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
            json.dump(record, stream)
            stream.flush()
            os.fsync(stream.fileno())
    headers = {'Authorization': 'Bearer ' + os.environ['MULTICA_TOKEN'], 'Content-Type': 'application/json'}
    workspace = os.environ.get('MULTICA_WORKSPACE_ID')
    if workspace:
        headers['X-Workspace-ID'] = workspace
    # A task token can derive its workspace. Do not read a broader operator credential.
    if record['state'] != 'verified':
        # Retrying this exact endpoint/key is safe after a lost response, even if the
        # original run has since ended. The server reconciles the original request.
        result = request(base, headers, f'issues/{issue}/tasks/{task}/supplements',
            {'content': content, 'client_request_id': record['request_id']})
        if result.get('supplement_task_id') != task or not result.get('id'):
            raise DeliveryError('Server did not confirm the intended run; inspect receipt before retry')
        record.update(state='accepted', comment=result['id'], delivery_status=result.get('supplement_status'))
        save(receipt, record)
    comments = request(base, headers, f'issues/{issue}/comments')
    comment = next((x for x in comments if x['id'] == record['comment']), None)
    if not comment or comment.get('content') != content:
        raise DeliveryError('Comment read-back failed; preserve receipt and inspect delivery')
    record['state'] = 'verified'
    save(receipt, record)
    print(json.dumps(record))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--issue', required=True)
    parser.add_argument('--task', required=True)
    parser.add_argument('--message', required=True, help='UTF-8 file; plain text, no role mentions needed')
    parser.add_argument('--receipt', required=True, help='Private receipt; reuse for exact retries')
    args = parser.parse_args()
    try:
        deliver(args)
    except urllib.error.HTTPError as error:
        print(f'HTTP {error.code}: update not confirmed. Preserve receipt; no fallback comment or new run.', file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, StopIteration, http.client.HTTPException) as error:
        # Never print response bodies, credentials, or environment values.
        reason = str(error) if isinstance(error, DeliveryError) else type(error).__name__
        print(f'{reason}: update not confirmed; preserve receipt and inspect inputs/delivery.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
