"""Concrete authenticated CLI pagination. No capped history can stand in for full queues."""
import subprocess,json,re,datetime
def parse_page(stdout,stderr):
    rows=json.loads(stdout)
    assert isinstance(rows,list) and all(isinstance(t,dict) and isinstance(t.get('id'),str) and isinstance(t.get('status'),str) for t in rows),'Queue page malformed'
    assert len({t['id'] for t in rows})==len(rows),'Queue page duplicate'
    if not stderr.strip():return rows,None
    match=re.fullmatch(r'More runs available; use --before "([^"\n]+)" to fetch the next page\.',stderr.strip())
    assert match,'Queue CLI warning unknown; completeness unconfirmed'
    cursor=match[1];parts=cursor.split('|')
    assert len(parts)==2 and re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',parts[1]),'Queue cursor malformed'
    assert datetime.datetime.fromisoformat(parts[0].replace('Z','+00:00')).tzinfo,'Queue cursor time missing'
    return rows,cursor

def all_tasks(agent):
    tasks=[];cursor=None;cursors=set();ids=set()
    for _ in range(100):
        args=['/usr/local/bin/multica','agent','tasks',agent,'--limit','200','--output','json']+(['--before',cursor] if cursor else [])
        result=subprocess.run(args,capture_output=True,text=True,timeout=120,check=True)
        rows,cursor=parse_page(result.stdout,result.stderr)
        assert not ids&{t['id'] for t in rows},'Queue cursor overlap/race'
        ids.update(t['id'] for t in rows);tasks.extend(rows)
        if cursor is None:return tasks
        assert cursor not in cursors,'Queue cursor cycle';cursors.add(cursor)
    raise RuntimeError('Queue inventory exceeded bounded pages; STOP')
