"""Read only coherent PRIVATE copies with normal WAL/SHM; never SQL-open original profiles."""
import pathlib,json,sqlite3,hashlib,tempfile,shutil,sys,os
root=pathlib.Path(sys.argv[1]).resolve();summary=json.loads(pathlib.Path(sys.argv[2]).read_bytes())
sessions={a['session_id'] for t in summary['tasks'] for a in t['attempts']};assert len(sessions)==6
assert str(root).startswith('/home/user/.local/share/loginom-evals-runtime/operations/stand.lease/lab57-closed/') or os.environ.get('EVAL_CLI_MODE')=='fake' and str(root).startswith('/tmp/')
rows={};seen={s:0 for s in sessions}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for db in list(root.rglob('loginom-ai-agent.db')):
    assert not db.is_symlink()
    files=[p for p in [db,pathlib.Path(str(db)+'-wal'),pathlib.Path(str(db)+'-shm')] if p.exists()]
    before={str(p):sha(p) for p in files}
    with tempfile.TemporaryDirectory(prefix='row-audit-',dir=root) as tmp:
        for p in files:shutil.copyfile(p,pathlib.Path(tmp)/p.name)
        conn=sqlite3.connect((pathlib.Path(tmp)/db.name).as_uri()+'?mode=ro',uri=True)
        try:
            for session in sessions:
                result=conn.execute('SELECT id,data FROM message WHERE session_id=? ORDER BY time_created',(session,)).fetchall()
                if result:seen[session]+=1
                for identifier,raw in result:
                    data=json.loads(raw)
                    if data.get('role')!='assistant':continue
                    assert (data.get('providerID'),data.get('modelID'),data.get('variant'))==('openai','gpt-6-luna','high')
                    assert identifier not in rows,'Duplicate original assistant row'
                    rows[identifier]={'session':session,'sha256':hashlib.sha256(raw.encode()).hexdigest(),'provider':'openai','model':'gpt-6-luna','variant':'high'}
        finally:conn.close()
    assert before=={str(p):sha(p) for p in files},'Private coherent snapshot changed by audit'
assert len(rows)==77 and all(count==1 for count in seen.values()),'Original77 rows/six session membership unconfirmed'
print(json.dumps({'assistantRows':len(rows),'model':'openai/gpt-6-luna/high','rows':rows,'normalWalShm':True,'immutableUsed':False,'originalSqlOpened':False},sort_keys=True))
