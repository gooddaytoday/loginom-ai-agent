#!/usr/bin/env python3
"""Admit new work through Multica's existing durable comment dispatch."""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import uuid

from supplement import DeliveryError, request, save


def deliver(args):
    base = os.environ['MULTICA_SERVER_URL'].rstrip('/')
    url = urllib.parse.urlsplit(base)
    if url.scheme not in ('http', 'https') or not url.netloc or url.username or url.query or url.fragment:
        raise DeliveryError('Invalid server URL')
    issue, agent = str(uuid.UUID(args.issue)), str(uuid.UUID(args.agent))
    if not re.fullmatch('[0-9a-f]{40}', args.sha) or not re.fullmatch('[a-z0-9][a-z0-9-]{0,63}', args.scope):
        raise DeliveryError('Use a full source SHA and a stable action scope')
    if args.product_sha and (not args.artifact or not re.fullmatch('[0-9a-f]{40}', args.product_sha)):
        raise DeliveryError('Product SHA requires a registered artifact and a full SHA')
    content = Path(args.message).read_text()
    if not content.strip() or ('mention://' in content and not args.existing_comment):
        raise DeliveryError('Message must be nonempty and contain no mentions')
    headers = {'Authorization': 'Bearer ' + os.environ['MULTICA_TOKEN'], 'Content-Type': 'application/json'}
    if os.environ.get('MULTICA_WORKSPACE_ID'):
        headers['X-Workspace-ID'] = os.environ['MULTICA_WORKSPACE_ID']
    # Identity belongs to the action, not to its sender, run or retry receipt.
    key = hashlib.sha256(json.dumps([base, issue, agent, args.sha, args.scope]).encode()).hexdigest()
    marker = f'Handoff-ID: {key}'
    if args.artifact:
        from artifacts import pin_handoff
        descriptors = pin_handoff(sorted(set(args.artifact)), key, issue, agent, args.sha,
            args.receipt, owner=args.artifact_owner, state_root=args.artifact_state_root,
            workspace=os.environ.get('MULTICA_WORKSPACE_ID'), product_sha=args.product_sha)
        content += '\n\nArtifact-handoff: ' + json.dumps(descriptors, ensure_ascii=False, sort_keys=True)
        if args.product_sha:
            content += '\nProduct-SHA: ' + args.product_sha + '\nSource-SHA identifies the checker/action; runtime acceptance remains bound to Product-SHA.'
    text = f'[@Исполнитель](mention://agent/{agent})\n{marker}\nSource-SHA: {args.sha}\nAction: {args.scope}\n\n{content}'
    path = Path(args.receipt)
    if path.is_symlink():
        raise DeliveryError('Receipt must not be a symlink')
    fingerprint = hashlib.sha256(text.encode()).hexdigest()
    if path.exists():
        record = json.loads(path.read_text())
        if record['key'] != key or record['fingerprint'] != fingerprint:
            raise DeliveryError('Receipt belongs to another action')
    else:
        record = {'key': key, 'fingerprint': fingerprint, 'issue': issue, 'agent': agent, 'state': 'prepared'}
        with open(path, 'x', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
            json.dump(record, stream)
            stream.flush()
            os.fsync(stream.fileno())
    comments = request(base, headers, f'issues/{issue}/comments', require_complete=True)
    if args.existing_comment:
        existing = next((c for c in comments if c['id'] == str(uuid.UUID(args.existing_comment))), None)
        if not existing or existing['content'] != content or args.sha not in content or re.findall(r'mention://agent/([0-9a-f-]+)', content) != [agent] or 'mention://all/' in content or 'mention://squad/' in content:
            raise DeliveryError('Existing assignment does not match the source and recipient')
    else:
        existing = None
    matches = [c for c in comments if marker in c.get('content', '').splitlines()]
    if len(matches) > 1 or (matches and matches[0]['content'] != text):
        raise DeliveryError('Action identity conflicts; reconcile existing assignments')
    found = existing or (matches[0] if matches else None)
    if not found:
        if record['state'] != 'prepared':
            raise DeliveryError('Unknown POST outcome; never blindly repost')
        runs = request(base, headers, f'issues/{issue}/task-runs')
        sender = os.environ.get('MULTICA_TASK_ID', '')
        current = next((r for r in runs if r['id'] == sender), None)
        payload = {'content': text}
        parent = args.parent or (current.get('trigger_comment_id') if current else None)
        if parent:
            payload['parent_id'] = str(uuid.UUID(parent))
        preview = request(base, headers, f'issues/{issue}/comments/trigger-preview', payload)
        if preview.get('blocked') or preview.get('squads') or [a['id'] for a in preview.get('agents', [])] != [agent]:
            raise DeliveryError('Preview did not admit exactly the intended recipient')
        record['state'] = 'sending'
        save(path, record)
        result = request(base, headers, f'issues/{issue}/comments', payload)
        record.update(comment=result['id'], outcomes=result.get('trigger_outcomes', []))
        save(path, record)
        outcomes = record['outcomes']
        if len(outcomes) != 1 or outcomes[0].get('target_id') != agent or outcomes[0].get('target_type') != 'agent' or outcomes[0].get('status') not in ('queued', 'coalesced', 'deferred'):
            record['state'] = 'not_admitted'
            save(path, record)
            raise DeliveryError('Comment stored but dispatch not admitted; reconcile without repost')
        record['state'] = 'admitted'
        save(path, record)
        comments = request(base, headers, f'issues/{issue}/comments', require_complete=True)
        found = next((c for c in comments if c['id'] == record['comment'] and c.get('content') == text), None)
    if not found:
        raise DeliveryError('Read-back missing; preserve receipt')
    record['comment'] = found['id']
    runs = request(base, headers, f'issues/{issue}/task-runs')
    # Deferred/planned and queued/coalesced obligations survive the active run's finish.
    linked = [r for r in runs if r.get('agent_id') == agent and (
        r.get('trigger_comment_id') == found['id'] or any(found['id'] in (r.get(field) or [])
        for field in ('delivered_comment_ids', 'coalesced_comment_ids', 'planned_comment_ids')))]
    if not linked:
        save(path, record)
        raise DeliveryError('Dispatch projection not confirmed; recheck exact receipt, never repost')
    # Terminal failures need diagnosis, not an automatic duplicate assignment.
    live = [r for r in linked if r['status'] not in ('cancelled', 'failed')]
    if not live:
        record.update(state='needs_reconciliation', runs=[{'id': r['id'], 'status': r['status']} for r in linked])
        save(path, record)
        raise DeliveryError('Assigned work failed or was cancelled; reconcile its result')
    record.update(state='assigned', runs=[{'id': r['id'], 'status': r['status']} for r in live],
                  delivery='durable_assignment', acceptance='not_verified')
    save(path, record)
    print(json.dumps(record))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('issue', 'agent', 'sha', 'scope', 'message', 'receipt'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--parent', help='Exact sender trigger when task context is unavailable')
    parser.add_argument('--existing-comment', help='Read-only adoption of an existing exact assignment; do not POST')
    parser.add_argument('--artifact', action='append', help='Registered artifact ID; pin before dispatch, repeat for dependencies')
    parser.add_argument('--artifact-owner', help='Human operator only: explicit artifact owner UUID')
    parser.add_argument('--artifact-state-root', help='Optional private artifact catalog root')
    parser.add_argument('--product-sha', help='Explicit unchanged product SHA for checker/docs-only work; never transfer runtime PASS')
    args = parser.parse_args()
    try:
        deliver(args)
    except (OSError, ValueError, KeyError, http.client.HTTPException, urllib.error.URLError) as error:
        reason = str(error) if isinstance(error, DeliveryError) else type(error).__name__
        print(f'{reason}: handoff not confirmed; inspect receipt/comment/task result, never blindly repost.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
