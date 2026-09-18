"""Remove reasoning from completed, isolated Xiaomi run archives without reading it."""
from contextlib import closing
import json
import sqlite3
from scenario_profile import PROFILES
from pathlib import Path


def cleanup_completed_run(run):
    run = Path(run)
    request = json.loads((run/'request.json').read_text())
    evidence = json.loads((run/'evidence.json').read_text())
    if (request.get('provider'), request.get('model')) not in PROFILES or evidence.get('export_complete') is not True:
        raise ValueError('Only an exported isolated approved comparison run may be cleaned')
    if evidence.get('process', {}).get('returncode') is None:
        raise ValueError('Completed process required')
    if request.get('run_id') != run.name or evidence.get('run_id') != run.name:
        raise ValueError('Run archive identity differs')
    database = run/'private/hermes-home/state.db'
    if database.is_symlink() or not database.is_file() or not database.resolve().is_relative_to(run.resolve()):
        raise ValueError('Original private run database required')
    with closing(sqlite3.connect(database)) as connection:
        columns = {r[1] for r in connection.execute('PRAGMA table_info(messages)')}
        names = [n for n in ('reasoning', 'reasoning_content', 'reasoning_details', 'codex_reasoning_items', 'codex_message_items') if n in columns]
        # The admitted Xiaomi version uses separate columns. Refuse an unknown
        # packed representation rather than reading or guessing its contents.
        if 'api_content' in columns and connection.execute("SELECT count(*) FROM messages WHERE api_content IS NOT NULL AND api_content NOT IN ('','[]','null')").fetchone()[0]:
            raise ValueError('Packed API history requires a separate privacy review')
        connection.execute('PRAGMA secure_delete=ON')
        counts = {n: connection.execute('SELECT count(*) FROM messages WHERE '+n+' IS NOT NULL').fetchone()[0] for n in names}
        if names:
            connection.execute('UPDATE messages SET '+','.join(n+'=NULL' for n in names))
        connection.commit()
        if connection.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()[0]:
            raise ValueError('Private database still has an active reader')
        connection.execute('VACUUM')
        if connection.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()[0]:
            raise ValueError('Private database cleanup could not checkpoint')
        if any(connection.execute('SELECT count(*) FROM messages WHERE '+n+' IS NOT NULL').fetchone()[0] for n in names):
            raise ValueError('Reasoning cleanup verification failed')
    result = dict(status='PASS', run_id=request['run_id'], scope='completed_private_sqlite_reasoning_columns', cleared_nonnull_rows=counts,
                  user_text_and_tool_evidence_preserved=True, reasoning_read=False)
    (run/'private-cleanup.json').write_text(json.dumps(result, indent=2)+'\n')
    return result
