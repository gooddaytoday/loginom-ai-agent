"""Acceptance-only entry point; never refresh or import credentials.

Installed before Hermes imports its CLI and credential pool. Does not change
the user's Hermes installation, HOME, or Codex configuration.
"""
import json
import os
from pathlib import Path
import sys
import tempfile

POLICY = 'existing-hermes-no-refresh-or-import-v1'


def install(auth, codex=None, on_change=None):
    names = ('_import_codex_cli_tokens', '_recover_codex_tokens_from_cli',
             'refresh_codex_oauth_pure')
    targets = [(auth, names)] if codex is None else [
        (auth, ('_import_codex_cli_tokens', 'refresh_codex_oauth_pure')),
        (codex, names)]
    if not all(callable(getattr(module, name, None)) for module, required in targets for name in required):
        raise RuntimeError('Unsupported Hermes authentication implementation')
    state = {'policy': POLICY, 'installed': True, 'blocked_attempts': 0}

    def denied(*args, **kwargs):
        state['blocked_attempts'] += 1
        if on_change:
            on_change(state)
        raise auth.AuthError('Acceptance requires reauthentication of the existing Hermes connection',
                             provider='openai-codex', code='acceptance_auth_change_forbidden',
                             relogin_required=True)

    for module, required in targets:
        for name in names:
            if callable(getattr(module, name, None)):
                setattr(module, name, denied)
    return state


def record(path, state, *, initial=False):
    # Hermes may finish with os._exit, bypassing finally/atexit. Persist the
    # installation before CLI startup and each refusal before raising it.
    if initial:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            json.dump(state, output)
        return
    fd, temporary = tempfile.mkstemp(prefix='.auth-guard-', dir=Path(path).parent)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(state, output)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)


def main():
    source, receipt, *argv = sys.argv[1:]
    sys.path.insert(0, str(Path(source).resolve()))
    from hermes_cli import auth
    state = install(auth, sys.modules.get('hermes_cli.auth_codex'), lambda value: record(receipt, value))
    record(receipt, state, initial=True)
    sys.argv = [str(Path(source) / 'hermes'), *argv]
    from hermes_cli.main import main as hermes_main
    hermes_main()


if __name__ == '__main__':
    main()
