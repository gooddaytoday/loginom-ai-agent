"""Independent binding of the minimal native account line to real preparation."""
import json,hashlib,re

def verify_account(r):
    p=json.loads((r/'account-probe.json').read_text());a=json.loads((r/'account-probe-prepared.json').read_text());assert all(p[k]==v for k,v in a.items())
    s=r/'private/dock-state/sessions'/p['session_id'];session=json.loads((s/'session.json').read_text());events=[json.loads(x) for x in (s/'execution-events.jsonl').read_text().splitlines()]
    prepared=[e for e in events if e.get('event')=='workspace_prepared'];assert len(prepared)==1;state=prepared[0]['state'];b=p['binding']
    assert session['sessionId']==p['session_id']==b['session_id']==state['session_id']
    assert p['result_profile']==session['resultProfile']=='user-v1'
    assert p['profile']==session['targetIdentity']==prepared[0]['target']==state['target']==dict(profile_id='loginom-7.4.2-macos-chromium-ru',loginom_build='7.4.2',platform='macos',browser='chromium')
    assert b['document_id']==state['document_id'] and b['workflow_id']==state['workflow_ref']['workflow_id'] and b['tab_tid']==state['workflow_ref']['tab_tid'] and b['operation_id']==state['operation_id']
    assert p['mono_start']<=p['mono_end']<p['deadline_ms']<=p['mono_start']+30000
    assert re.fullmatch('[a-f0-9]{64}',p['code_sha256'])
    raw=p['raw'];assert not raw.get('isError');texts=[x['text'] for x in raw['content'] if x['type']=='text'];assert len(texts)==1
    text=texts[0];match=re.search(r'^### Result\n([\s\S]*?)(?:\n### |$)',text);value=json.loads(match.group(1) if match else text);assert value==p['value']
    assert value['status']=='SUCCEEDED' and value['account']=='test-2' and value['opened'] is True and value['closed'] is True and 0<=value['elapsed_ms']<=30000
    observations=value['observations'];assert len(observations)>=3 and observations[0]['menu_count']==observations[-1]['menu_count']==0
    account=[o for o in observations if o['account'] is not None];assert len(account)==1 and account[0]['account']=='test-2' and account[0]['line_visible'] is True and account[0]['menu_count']==1
    from urllib.parse import urlsplit
    for o in observations:
        u=urlsplit(o['url']);assert u.scheme+'://'+u.netloc==o['origin']==b['origin']=='http://logi-test-plan.bg.local'
        assert all(o[k]==b[k] for k in ['document_id','session_id','workflow_id','tab_tid']) and o['build']=='7.4.2' and o['prepared_verified'] is True and o['active_tab'] is True and o['avatar_count']==1
    return {'passed':True,'scope':'visible_native_account_line_same_prepared_document','account':'test-2','elapsed_ms':value['elapsed_ms']}
