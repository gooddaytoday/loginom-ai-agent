#!/usr/bin/env python3
"""Persist an agent update without triggering a run or borrowing human privileges."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid
import urllib.error

from supplement import request, save


def deliver(args):
    issue, task = str(uuid.UUID(args.issue)), str(uuid.UUID(args.task))
    base = os.environ['MULTICA_SERVER_URL'].rstrip('/')
    headers = {'Authorization': 'Bearer ' + os.environ['MULTICA_TOKEN'], 'Content-Type': 'application/json'}
    if os.environ.get('MULTICA_WORKSPACE_ID'):
        headers['X-Workspace-ID'] = os.environ['MULTICA_WORKSPACE_ID']
    content = Path(args.message).read_text()
    if not content.strip() or 'mention://agent/' in content or 'mention://squad/' in content:
        raise ValueError('Update must be nonempty and must not contain dispatch mentions')
    path = Path(args.receipt)
    if path.is_symlink():
        raise ValueError('Receipt must not be a symlink')
    sender = os.environ.get('MULTICA_TASK_ID', '')
    fingerprint = hashlib.sha256(json.dumps([base, issue, task, content, sender, args.parent]).encode()).hexdigest()
    if path.exists():
        record = json.loads(path.read_text())
        if record['fingerprint'] != fingerprint:
            raise ValueError('Receipt belongs to another update')
    else:
        record = {'fingerprint': fingerprint, 'request_id': str(uuid.uuid4()), 'issue': issue, 'task': task, 'state': 'prepared'}
        with open(path, 'x', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
            json.dump(record, stream)
            stream.flush()
            os.fsync(stream.fileno())
    text = f'[@all](mention://all/all)\nУточнение существующего назначения/run {task}. Delivery-ID: {record["request_id"]}\n\n{content}'
    comments = request(base, headers, f'issues/{issue}/comments')
    found = next((c for c in comments if c.get('content') == text), None)
    if found is None:
        if record['state'] != 'prepared':
            raise ValueError('Delivery outcome unknown; inspect existing comments, never blindly repost')
        runs = request(base, headers, f'issues/{issue}/task-runs')
        target = next((r for r in runs if r['id'] == task), None)
        if not target or target['status'] not in ('running', 'queued'):
            raise ValueError('Target ended; reconcile its result before a new assignment')
        payload = {'content': text}
        current = next((r for r in runs if r['id'] == sender), None)
        parent = args.parent or (current.get('trigger_comment_id') if current else None)
        if parent:
            payload['parent_id'] = str(uuid.UUID(parent))
        preview = request(base, headers, f'issues/{issue}/comments/trigger-preview', payload)
        if preview.get('agents') or preview.get('squads') or preview.get('blocked'):
            raise ValueError('Information unexpectedly triggers work')
        record['state'] = 'sending'
        save(path, record)
        result = request(base, headers, f'issues/{issue}/comments', payload)
        record['comment'] = result['id']
        save(path, record)
        comments = request(base, headers, f'issues/{issue}/comments')
        found = next((c for c in comments if c['id'] == record['comment'] and c.get('content') == text), None)
    if found is None:
        raise ValueError('Read-back missing; preserve receipt')
    record.update(state='recorded', comment=found['id'], delivery='pull_at_safe_boundary')
    save(path, record)
    print(json.dumps(record))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('issue', 'task', 'message', 'receipt'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--parent', help='Exact sender trigger comment when MULTICA_TASK_ID is unavailable')
    args = parser.parse_args()
    try:
        deliver(args)
    except urllib.error.HTTPError as error:
        # Do not expose response bodies or credentials; the status is diagnostic.
        print(f'HTTP {error.code}: delivery not confirmed; inspect receipt/comments and reply parent, never repost blindly.', file=sys.stderr)
        return 1
    except Exception as error:
        print(f'{type(error).__name__}: delivery not confirmed; preserve receipt, inspect state, do not repost blindly.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
