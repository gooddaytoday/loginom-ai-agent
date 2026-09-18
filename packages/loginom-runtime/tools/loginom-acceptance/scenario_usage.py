"""Recover numeric usage counters without reading prompts, prose, or reasoning."""
import sqlite3
from contextlib import closing

COUNTERS = ('api_call_count','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','reasoning_tokens')


def session_usage(home, session_ids, *, provider, model):
    ids = sorted(set(session_ids))
    unavailable = dict(status='UNAVAILABLE', source='hermes_session_sqlite', usage=None)
    if not ids or not all(isinstance(i,str) and i for i in ids):
        return dict(unavailable, reason='No exact tool-session identities')
    path = home / 'state.db'
    if not path.is_file():
        return dict(unavailable, reason='Session database absent')
    with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True)) as db:
        columns = {r[1] for r in db.execute('PRAGMA table_info(sessions)')}
        mandatory = {'id','model','billing_provider','api_call_count','input_tokens','output_tokens','ended_at'}
        if not mandatory <= columns:
            return dict(unavailable, reason='Session counter schema unavailable')
        selected = ['id','model','billing_provider','ended_at'] + [k for k in COUNTERS if k in columns]
        # Every selected column is a literal identifier from this allowlist.
        # Never SELECT *: the same table also holds system prompts and metadata.
        query = 'SELECT '+','.join(selected)+' FROM sessions WHERE id IN ('+','.join('?' for _ in ids)+')'
        rows = [dict(zip(selected,r)) for r in db.execute(query,ids)]
    if {r['id'] for r in rows} != set(ids):
        return dict(unavailable, reason='Requested session missing')
    if any(r['model'] != model or r['billing_provider'] != provider for r in rows):
        return dict(unavailable, reason='Session provider/model differs from requested profile')
    def count(key):
        values = [r.get(key) for r in rows]
        return sum(values) if all(type(v) is int and v >= 0 for v in values) else None
    usage = {k:count(k) for k in COUNTERS}
    usage['api_calls'] = usage.pop('api_call_count')
    usage.update(provider=provider, model=model, total_tokens=None)
    return dict(status='RECOVERED', source='hermes_session_sqlite', session_ids=ids, usage=usage,
                sessions_finalized=all(r['ended_at'] is not None for r in rows),
                scope='Reported cumulative session counters; an interrupted/in-flight call may be absent.',
                limitation='Cache/reasoning counters are separate; no total or monetary cost is inferred.')


def recover_completed_run(run):
    """Append a usage sidecar; never replace the original run evidence."""
    import json
    from evidence import export_history, clean
    evidence = json.loads((run/'evidence.json').read_text())
    if evidence.get('export_complete') is not True or type(evidence.get('process',{}).get('returncode')) is not int:
        raise ValueError('Only exported, completed processes may be backfilled')
    request = json.loads((run/'request.json').read_text())
    calls, _ = export_history(run/'private/hermes-home', [])
    recovered = session_usage(run/'private/hermes-home',[c['session_id'] for c in calls],
                              provider=request['provider'],model=request['model'])
    usage = recovered.pop('usage')
    value = dict(run_id=run.name,recovery=recovered,process=dict(usage=usage))
    with (run/'usage-recovery.json').open('x') as stream:
        json.dump(clean(value,[]),stream,ensure_ascii=False,indent=2)
    return value


if __name__ == '__main__':
    import argparse
    import json
    from pathlib import Path
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--run',required=True,type=Path)
    args=parser.parse_args();value=recover_completed_run(args.run)
    print(json.dumps(dict(run_id=value['run_id'],status=value['recovery']['status'])))
