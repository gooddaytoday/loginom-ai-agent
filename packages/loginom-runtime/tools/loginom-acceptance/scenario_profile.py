"""Verify persisted effective executor settings without reading conversation content."""
import json
import sqlite3
from contextlib import closing


PROFILES = {('xiaomi','mimo-v2.5'), ('openrouter','inclusionai/ling-3.0-flash-fin'),
            ('openrouter','deepseek/deepseek-v4.1-flash')}


def validate_profile(provider, model):
    if (provider, model) not in PROFILES:
        raise ValueError('Explicit supported comparison profile required; no fallback')


def openrouter_connection(home):
    import shlex
    values=[]
    for line in (home/'.env').read_text().splitlines():
        line=line.strip().removeprefix('export ').lstrip()
        name, sep, value=line.partition('=')
        if sep and name.strip()=='OPENROUTER_API_KEY':
            parts=shlex.split(value,comments=True,posix=True)
            if len(parts)!=1 or not parts[0] or any(c.isspace() for c in parts[0]):
                raise ValueError('Existing Hermes OpenRouter key is malformed')
            values.append(parts[0])
    if len(values)!=1:
        raise ValueError('Exactly one existing Hermes OpenRouter key required')
    return {'OPENROUTER_API_KEY':values[0]}


def effective_profile(home, *, provider='xiaomi', model='mimo-v2.5'):
    validate_profile(provider,model)
    path = home / 'state.db'
    if not path.is_file():
        return dict(status='UNVERIFIED', reason='Session database absent', sessions=[])
    with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True)) as db:
        fields = {r[1] for r in db.execute('PRAGMA table_info(sessions)')}
        if not {'id','model','billing_provider','model_config'} <= fields:
            return dict(status='UNVERIFIED', reason='Effective profile fields absent', sessions=[])
        # Select only the non-secret configuration subtree, never prompts or
        # messages. The request flag is not evidence of an effective setting.
        rows = db.execute("SELECT id,model,billing_provider,json_extract(model_config,'$.reasoning_config') FROM sessions").fetchall()
    sessions = []
    for i,m,p,r in rows:
        config=json.loads(r) if r else None
        sessions.append(dict(session_id=i,model=m,provider=p,
            reasoning_enabled=config.get('enabled') if isinstance(config,dict) else None,
            reasoning_effort=config.get('effort') if isinstance(config,dict) else None))
    verified = bool(sessions) and all(s['model']==model and s['provider']==provider
        and s['reasoning_enabled'] is True and s['reasoning_effort']=='medium' for s in sessions)
    return dict(status='VERIFIED' if verified else 'UNVERIFIED', sessions=sessions,
        scope='Hermes persisted effective agent configuration; not proof of provider-side effort semantics')


def hermes_command(executable, prompt_path, max_turns, *, provider='xiaomi', model='mimo-v2.5'):
    validate_profile(provider,model)
    # Installed Hermes -z constructs AIAgent without reasoning_config or the
    # configured max_iterations. Ordinary quiet chat propagates both settings.
    return [str(executable),'chat','--provider',provider,'--model',model,
            '--reasoning','medium','--max-turns',str(max_turns),'--toolsets','loginom-dock',
            '--skills','loginom','--quiet','--query-file',str(prompt_path)]
