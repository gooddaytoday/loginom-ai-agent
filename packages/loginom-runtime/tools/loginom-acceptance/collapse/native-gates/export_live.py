"""Export real operator MCP envelopes; never manufacture compact tool replies."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from evidence import PREFIX, unwrap
from node_public_acceptance_evidence import paired_public_calls


def export(directory,run_id):
    directory=Path(directory)
    session=json.loads((directory/'session.json').read_text())
    if session.get('operatorPublicProfile')!='user-v1':
        raise ValueError('original public user-v1 wire session required')
    calls=[];replies=[];pending={}
    for row,line in enumerate((directory/'public-api.jsonl').read_text().splitlines(),1):
        entry=json.loads(line);call_id='wire-'+str(entry['id'])
        if entry['phase']=='request':
            request=entry['request'];name=request['name']
            if not name.startswith('dock_'):continue
            if entry['id'] in pending:raise ValueError('duplicate wire request')
            call=dict(session_id=session['sessionId'],tool_call_id=call_id,row=row,
                      tool=PREFIX+name,arguments=request.get('arguments',{}))
            pending[entry['id']]=call;calls.append(call)
        elif entry['phase']=='response' and entry['id'] in pending:
            call=pending[entry['id']]
            raw=json.dumps(entry['reply'],ensure_ascii=False,separators=(',',':'))
            result=unwrap(raw)
            if call['tool'].startswith(PREFIX+'dock_node_') and result.get('result_version')!='user-v1' and result.get('isError') is not True:
                raise ValueError('non-public result cannot be projected into evidence')
            replies.append(dict(session_id=session['sessionId'],tool_call_id=call_id,row=row,
                tool=call['tool'],result=result,raw_content=raw))
    events=[json.loads(line) for line in (directory/'execution-events.jsonl').read_text().splitlines()]
    if not events or any(e['session_id']!=session['sessionId'] or e['runtime_revision']!=session['clientRevision'] for e in events):
        raise ValueError('mixed live event session/runtime')
    result=dict(run_id=run_id,origin='independent_codex_session',calls=calls,tools=replies,events=events,
                browser_session_id=session['sessionId'],runtime=session['clientRevision'],model_run=False)
    _,failures=paired_public_calls(result)
    if failures:raise ValueError('invalid original wire transcript '+str(failures))
    return result

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('--run-id',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    result=export(a.directory,a.run_id);Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'origin':result['origin'],'calls':len(result['calls']),'model_run':False}))
