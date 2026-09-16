"""Read-only origin binding from preparation and native browser observations.

A requested URL or a target profile without browser observations is not evidence.
The UI document epoch and the prepared graph document have different identifiers;
prepared_node_context is the observed bridge between those identities.
"""
from urllib.parse import urlsplit

PROFILE = dict(profile_id='loginom-7.4.2-macos-chromium-ru', loginom_build='7.4.2', platform='macos', browser='chromium')
ORIGIN = 'http://logi-test-plan.bg.local'

def canonical_origin(value):
    assert isinstance(value, str), 'Missing observed origin'
    u = urlsplit(value)
    assert u.scheme in ('http', 'https') and u.netloc and not u.username and not u.password
    assert u.path in ('', '/') and not u.query and not u.fragment, 'Origin is not an origin URL'
    return u.scheme + '://' + u.netloc

def observed_origin(events, operation, node, runtime=None, session=None):
    own = [(i,e) for i,e in enumerate(events) if e.get('operation_id') == operation]
    assert own, 'Missing operation evidence'
    sid = own[0][1]['session_id']; revision = own[0][1]['runtime_revision']
    assert session is None or sid == session
    assert runtime is None or revision == runtime
    def profile(e):
        assert e['session_id'] == sid and e['runtime_revision'] == revision, 'Foreign session/runtime'
        assert {k:e['target'].get(k) for k in PROFILE} == PROFILE, 'Foreign/incomplete target profile'
        if 'origin' in e['target']: assert canonical_origin(e['target']['origin']) == ORIGIN, 'Conflicting target origin'
    terminal = [i for i,e in own if e.get('phase') == 'completed']; assert len(terminal) == 1
    start, finish = own[0][0], terminal[0]
    assert start < finish and all(i <= finish for i,e in own), 'Operation events outside terminal interval'
    preparations = [(i,e) for i,e in enumerate(events) if e.get('event') == 'workspace_prepared' and e.get('session_id') == sid]
    assert not any(start <= i <= finish for i,e in preparations), 'Preparation changed during operation'
    prior = [(i,e) for i,e in preparations if i < start]
    assert prior, 'Missing prior session preparation'
    # A later preparation supersedes the old context even when it is invalid or
    # belongs to another workflow. Never search backwards for a convenient match.
    pi, prepared = prior[-1]; profile(prepared); state = prepared['state']
    identity = state.get('operation_id')
    assert sum(e.get('state') == state for i,e in prior) == 1, 'Ambiguous active preparation'
    if identity is not None:
        assert isinstance(identity,str) and identity and sum(e.get('state',{}).get('operation_id') == identity for i,e in prior) == 1, 'Ambiguous preparation identity'
    manifest = prepared.get('manifest_sha256')
    assert manifest is None or isinstance(manifest,str) and len(manifest) == 64, 'Invalid preparation catalog'
    assert all(e.get('manifest_sha256') == manifest for i,e in own), 'Foreign operation catalog'
    assert pi < own[0][0] and state['status'] == 'READY' and state['authenticated'] is True
    assert state['target_verified'] is True, 'Unverified preparation target'
    if state['ownership_verified'] is not True:
        from text_export_reopen_owner import verify_reopened_owner
        assert verify_reopened_owner(events,pi,operation,node)['verified'] is True
    assert state['session_id'] == sid and state['document_id'] == node['document_id'] and state['workflow_ref']['workflow_id'] == node['workflow_id'], 'Foreign prepared document'
    assert state['target'] == prepared['target'], 'Preparation profile conflict'
    wf = {k:state['workflow_ref'][k] for k in ('tab_tid','prefix')}
    observations = []; bound = []
    for i,e in own:
        profile(e)
        o = e.get('outcome',{}).get('output',{})
        if not isinstance(o,dict): continue
        if e.get('phase') == 'node_observation_completed':
            assert 'origin' in o, 'Missing native origin observation'
        if 'origin' not in o: continue
        assert pi < i < terminal[0], 'Stale/out-of-order browser observation'
        origin = canonical_origin(o['origin']); assert origin == ORIGIN, 'Foreign observed origin'
        assert o.get('authenticated') is True and o.get('loginom_build') == PROFILE['loginom_build']
        epoch = o.get('dom_epoch',{}).get('document'); assert isinstance(epoch,str) and epoch, 'Missing UI document epoch'
        observations.append((origin,epoch))
        context = o.get('prepared_node_context')
        if context is not None:
            assert context.get('verified') is True and all(context.get(k) == v for k,v in node.items()), 'Foreign observed node document'
            assert {k:o['workflow_ref'].get(k) for k in wf} == wf, 'Foreign observed workflow owner'
            if e.get('phase') == 'node_observation_completed': bound.append((origin,epoch))
    assert bound and observations and len(set(observations)) == 1 and set(bound) == set(observations), 'Missing/conflicting document origin evidence'
    return bound[0][0]
