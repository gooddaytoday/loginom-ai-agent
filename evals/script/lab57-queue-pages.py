"""Concrete authenticated CLI pagination. No capped history can stand in for full queues."""
import subprocess,json,re,datetime,hashlib,pathlib
status_contract=json.loads((pathlib.Path(__file__).parent.parent/'src/lab57-task-statuses.json').read_bytes())
PENDING=status_contract['pending']
TERMINAL=status_contract['terminal']
STATES=set(PENDING+TERMINAL)
def parse_page(stdout,stderr):
    rows=json.loads(stdout)
    assert isinstance(rows,list) and all(isinstance(t,dict) and isinstance(t.get('id'),str) and isinstance(t.get('status'),str) for t in rows),'Queue page malformed'
    assert all(t['status'] in STATES for t in rows),'Queue task status unsupported; STOP before partition'
    assert len({t['id'] for t in rows})==len(rows),'Queue page duplicate'
    if not stderr.strip():return rows,None
    match=re.fullmatch(r'More runs available; use --before "([^"\n]+)" to fetch the next page\.',stderr.strip())
    assert match,'Queue CLI warning unknown; completeness unconfirmed'
    cursor=match[1];parts=cursor.split('|')
    assert len(parts)==2 and re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',parts[1]),'Queue cursor malformed'
    assert datetime.datetime.fromisoformat(parts[0].replace('Z','+00:00')).tzinfo,'Queue cursor time missing'
    return rows,cursor

def task_pages(agent):
    pages=[];cursor=None;cursors=set();ids=set()
    for _ in range(100):
        args=['/usr/local/bin/multica','agent','tasks',agent,'--limit','200','--output','json']+(['--before',cursor] if cursor else [])
        result=subprocess.run(args,capture_output=True,text=True,timeout=120,check=True)
        before=cursor
        rows,cursor=parse_page(result.stdout,result.stderr)
        assert len(rows)<=200 and (rows or cursor is None),'Queue page incomplete'
        assert not ids&{t['id'] for t in rows},'Queue cursor overlap/race'
        ids.update(t['id'] for t in rows)
        safe=[{k:t.get(k) for k in ['id','status','agent_id','runtime_id']} for t in rows]
        pages.append({'before':before,'next':cursor,'rows':safe,'rowsSha256':digest(safe),
            'stdoutSha256':hashlib.sha256(result.stdout.encode()).hexdigest(),'stderrSha256':hashlib.sha256(result.stderr.encode()).hexdigest()})
        if cursor is None:return pages
        assert cursor not in cursors,'Queue cursor cycle';cursors.add(cursor)
    raise RuntimeError('Queue inventory exceeded bounded pages; STOP')

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

def all_tasks(agent):
    return [t for p in task_pages(agent) for t in p['rows']]

MAS='24aa980b-b8c3-43e2-b087-bad8f79c9517'
ORIGINAL='a5fa993f-2903-4997-a832-955ffbb1203c'
BEN='99804e93-d241-45f2-872d-8a1e16ec7f3d'
AMENDMENT='e2925de35befd22407908e938e693bfcfaef62b73f9681af890ff7b8ad9bc4e3'

def collect_queues(agents,followup,mode="ben-task"):
    assert mode in ['ben-task','codex-coordinator'],'Unknown controller mode'
    assert (isinstance(followup,str) and re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',followup) and followup!='01a1375d-ce4a-7c35-a3a3-94cf64a8b589') if mode=='ben-task' else followup is None,'Controller binding required'
    assert isinstance(agents,list) and len(agents)>=8,'Queue roster incomplete'
    roster=[{k:a.get(k) for k in ['id','runtime_id']} for a in agents]
    assert len({a['id'] for a in roster})==len(roster),'Queue roster duplicate'
    inventory={'roster':roster,'agents':[{'id':a['id'],'pages':task_pages(a['id'])} for a in roster]}
    excluded=[];blocked=[];controller=[];ids=set();records=0;pages=0
    for agent,scan in zip(roster,inventory['agents']):
        pages+=len(scan['pages'])
        for page in scan['pages']:
            for t in page['rows']:
                assert t['id'] not in ids,'Queue duplicate across agents/race'
                ids.add(t['id']);records+=1
                if t['status'] in TERMINAL:continue
                row={'task':t['id'],'agent':t['agent_id'],'status':t['status'],'taskRuntime':t['runtime_id'],
                     'agentRuntime':agent['runtime_id'],'rosterAgent':agent['id']}
                bound=t['agent_id']==agent['id']
                if mode=='ben-task' and t['id']==followup and bound and agent['id']==BEN and t['status']=='running' and t['runtime_id']==ORIGINAL and agent['runtime_id']==ORIGINAL:
                    row['reason']='EXACT_BEN_CONTROLLER';controller.append(row);continue
                if not (mode=='codex-coordinator' and agent['id']==BEN) and t['id'] not in [followup,'01a1375d-ce4a-7c35-a3a3-94cf64a8b589'] and bound and t['runtime_id']==MAS and agent['runtime_id']==MAS:
                    row.update(reason='OWNER_ATTESTED_EXACT_MAS',ownerAmendmentSha256=AMENDMENT);excluded.append(row);continue
                row['reason']='UNEXEMPTED_OR_UNBOUND_PENDING';blocked.append(row)
    assert len(controller)==(1 if mode=='ben-task' else 0),'Controller inventory mismatch'
    ledger={'version':1,'ownerAmendmentSha256':AMENDMENT,'inventorySha256':digest(inventory),'rosterCount':len(roster),
            'pageCount':pages,'recordCount':records,'pendingCount':len(excluded)+len(blocked)+len(controller),
            'excluded':excluded,'blocked':blocked,'controller':controller}
    return {'queueInventory':inventory,'queueLedger':ledger,'pendingWorkers':blocked,'queuesChecked':len(roster)}
