"""Fail-closed session/protocol and same-browser geometry evidence.

Local runner receipts are trusted evidence producers pinned with the harness;
absence of activity never identifies an otherwise unknown session as precheck.
"""
import hashlib,json,posixpath
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from evidence import PREFIX
from user_result_evidence import normalize_user_evidence

def read(path):return json.loads(path.read_text())
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def require(value,reason):
    if not value:raise ValueError(reason)
def skill_bundle_revision(directory):
    entries=[]
    for path in sorted(directory.rglob('*'),key=lambda p:p.relative_to(directory).as_posix().encode()):
        require(not path.is_symlink(),'skill_symlink')
        is_dir=path.is_dir()
        require(is_dir or path.is_file(),'skill_special_file')
        entries.append(dict(is_dir=is_dir,path=path.relative_to(directory).as_posix(),sha256=None if is_dir else digest(path),size=None if is_dir else path.stat().st_size))
    return hashlib.sha256(json.dumps(entries,ensure_ascii=True,separators=(',',':')).encode()).hexdigest()

def metadata_pins(meta,path,request,pin):
    expected=dict(client='0.1.0-dev.20260910.3',runtimeRelease=None,agent='hermes',adapterRevision='0.1.0-rc.4-acceptance',mode='executor-replay',resultProfile='user-v1',
        sessionId=path.parent.name,loginomUrl=request['loginom_url'],clientRevision=request['runtime_source_pin']['client_revision'],
        actionManifestDigest=pin['manifest_sha256'],actionCatalogVersion=pin['catalog_version'],
        actionCatalogDigest=pin['readback_files']['actions.json'],selectorCatalogDigest=pin['readback_files']['selectors.json'],
        e2eCommit=pin['e2e_commit'],compatibilityProfile=pin['compatibility'],capabilityAbi=1,executorRevision='1.2.0',
        catalogLifecycleStatus='candidate',acceptanceVerified=False,acceptanceDigest=None,browserViewport=None,browserWindowMode='maximized')
    mapping={'node':'node','playwright':'playwright','sdk':'sdk','playwright_mcp':'playwrightMcp',
             'chromium_revision':'chromiumRevision','chromium_version':'chromiumVersion'}
    expected.update({dest:request['dependencies'][source] for source,dest in mapping.items()})
    require(all(k in meta and meta[k]==v for k,v in expected.items()),'metadata_pin_mismatch')
    require(Path(meta['profile']).resolve()==path.parent.resolve()/'browser-profile','foreign_browser_profile')
    require(Path(meta['artifacts']).resolve()==path.parent.resolve()/'artifacts','foreign_artifacts')
    tools=read(path.parent/'tools.json')
    require(hashlib.sha256(json.dumps(tools,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()==meta['toolCatalogSha256'],'tool_catalog_pin')
    manifest=meta['clientSourceManifest']
    require(len({m['path'] for m in manifest})==len(manifest),'duplicate_source_pin')
    require({posixpath.normpath('client/lib/'+m['path']):m['sha256'] for m in manifest}==request['runtime_source_pin']['inputs'],'source_manifest_mismatch')

def geometry_check(state,event,request):
    r=state['browser_geometry'];o=r['observed'];url=urlsplit(request['loginom_url'])
    expected=dict(version=1,source='prepare_same_browser_page',session_id=event['session_id'],
        operation_id=state['operation_id'],document_id=state['document_id'],workflow_ref=state['workflow_ref'],
        runtime_revision=event['runtime_revision'],manifest_sha256=event['manifest_sha256'],viewport=None)
    require(all(k in r and r[k]==v for k,v in expected.items()),'geometry_binding')
    require(o['document_id']==state['document_id'] and o['origin']==url.scheme+'://'+url.netloc+'/' and o['pathname']==url.path,'geometry_document')
    require(o['visibility']=='visible','geometry_not_visible')
    for k in ('inner_width','inner_height','outer_width','outer_height','available_width','available_height'):
        require(type(o[k]) in (int,float) and o[k]>0,'geometry_dimensions')
    # Native macOS Chromium leaves a small frame margin; permit at most 16 px.
    require(abs(o['outer_width']-o['available_width'])<=16 and abs(o['outer_height']-o['available_height'])<=16,'geometry_not_expanded')
    require(abs(o['screen_x']-o['available_left'])<=16 and abs(o['screen_y']-o['available_top'])<=16,'geometry_position')
    require(0<=o['outer_width']-o['inner_width']<=32 and 0<=o['outer_height']-o['inner_height']<=160,'geometry_emulated_or_small')
    observed=datetime.fromisoformat(r['observed_at'].replace('Z','+00:00'));recorded=datetime.fromisoformat(event['recorded_at'].replace('Z','+00:00'))
    require(0<=(recorded-observed).total_seconds()<=30,'geometry_stale')
    return dict(passed=True,session_id=r['session_id'],operation_id=r['operation_id'],observed=o)

def verify_session_evidence(directory,request,evidence,pin,skill_revision,require_geometry=True):
    checks={}
    try:
        projected,projection=normalize_user_evidence(evidence)
        require(projection['passed'],'public_projection')
        calls=projected['calls'];replies=projected['tools'];events=projected['events']
        require(bool(calls) and len({c['session_id'] for c in calls+replies})==1,'foreign_public_caller')
        preps=[t for t in replies if t.get('tool')==PREFIX+'dock_prepare' and t.get('result',{}).get('prepared') is True]
        require(bool(preps),'missing_public_prepare')
        ids={t['result']['sessionId'] for t in preps};require(len(ids)==1,'multiple_working_sessions');sid=next(iter(ids))
        require(events and all(e['session_id']==sid and e['runtime_revision']==request['runtime_source_pin']['client_revision']
            and e['manifest_sha256']==pin['manifest_sha256'] for e in events),'journal_session_or_pin_substitution')
        for t in preps:
            matches=[c for c in calls if c['tool_call_id']==t['tool_call_id'] and c['session_id']==t['session_id'] and c['tool']==t['tool']]
            require(len(matches)==1 and matches[0]['row']<t['row'],'prepare_public_pair')
            require(sum(e.get('event')=='workspace_prepared' and e.get('state')==t['result']['workspace'] for e in events)==1,'prepare_journal_binding')
        session_root=directory/'private/dock-state/sessions'
        entries=list(session_root.iterdir())
        require(all(p.is_dir() and not p.is_symlink() and (p/'session.json').is_file() for p in entries),'unknown_session_directory')
        paths=[p/'session.json' for p in entries]
        working=[p for p in paths if p.parent.name==sid];require(len(working)==1,'working_metadata_missing')
        path=working[0];meta=read(path);metadata_pins(meta,path,request,pin)
        require(meta['workspaceReady'] is True and meta['skillRevision']==skill_revision and meta['targetIdentity']==pin['compatibility'],'working_state_or_skill_pin')
        skill=Path(meta['skillPath']).resolve();require(skill==path.parent.resolve()/('skill-'+skill_revision)/'SKILL.md' and skill.is_file() and skill_bundle_revision(skill.parent)==skill_revision,'skill_file_pin')
        raw=[json.loads(line) for line in (path.parent/'execution-events.jsonl').read_text().splitlines() if line.strip()]
        require(raw==evidence['events'],'raw_journal_export_substitution')
        require(meta['workspacePreparation']['state']==preps[-1]['result']['workspace'] and meta['workflowRef']==preps[-1]['result']['workspace']['workflow_ref'],'metadata_prepare_substitution')
        checks['working_session']=dict(passed=True,session_id=sid)
        extras=[p for p in paths if p!=path]
        if extras:
            require(len(extras)==1,'unknown_extra_sessions')
            p=extras[0];m=read(p);metadata_pins(m,p,request,pin)
            precheck=read(directory/'tool-precheck.json');proof=precheck.get('provenance',{})
            require(precheck.get('available') is True and proof.get('version')==1 and proof.get('session_id')==p.parent.name,'unproven_extra_session')
            origin_path=p.parent/'mcp-origin.json';origin=read(origin_path)
            require(digest(origin_path)==proof['origin_sha256'] and digest(p)==proof['metadata_sha256'],'precheck_receipt_substitution')
            require(origin['source']=='official_stdio_transport' and origin['version']==1 and origin['session_id']==p.parent.name
                and origin['pid']==proof['pid'] and type(proof['pid']) is int and proof['pid']>0
                and origin['runtime_revision']==request['runtime_source_pin']['client_revision'] and origin['manifest_sha256']==pin['manifest_sha256']
                and origin['initialized_client']=='loginom-acceptance-tool-precheck/1' and origin['closed'] is True and origin['overflow'] is False,'precheck_origin')
            methods=origin['methods'];require(methods[:2]==['initialize','notifications/initialized'] and len(methods)>=3 and all(x=='tools/list' for x in methods[2:]),'precheck_has_other_actions')
            require(m['workspaceReady'] is False and m['skillRevision'] is None and m.get('workspacePreparation') is None
                and m.get('skillPath') is None and m.get('targetIdentity') is None and m.get('workflowRef') is None
                and not (p.parent/'execution-events.jsonl').exists(),'precheck_active')
            checks['precheck_origin']=dict(passed=True,session_id=p.parent.name,pid=proof['pid'])
        else:checks['precheck_origin']=dict(passed=True,extra_sessions=0)
        if require_geometry:
            ready=[e for e in events if e.get('event')=='workspace_prepared' and e['state'].get('status')=='READY']
            require(bool(ready),'missing_geometry_preparation')
            for i,e in enumerate(ready):checks['geometry_'+str(i)]=geometry_check(e['state'],e,request)
    except (KeyError,TypeError,ValueError,OSError,IndexError,AttributeError) as error:
        checks['evidence_rejected']=dict(passed=False,reason=str(error))
    return dict(passed=bool(checks) and all(c['passed'] for c in checks.values()),checks=checks)
