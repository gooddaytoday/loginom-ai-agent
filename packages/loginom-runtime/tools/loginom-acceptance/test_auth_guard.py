"""Offline authentication isolation regressions; no real credentials/network."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

import audit
import hermes_auth_guard as guard
from test_acceptance import fixture

class GuardTest(unittest.TestCase):
    def test_import_recovery_and_refresh_are_blocked_without_calling_original(self):
        class AuthError(Exception):
            def __init__(self, message, **kwargs): super().__init__(message)
        originals = {name:Mock(side_effect=AssertionError('must not reach credentials/network')) for name in (
            '_import_codex_cli_tokens','_recover_codex_tokens_from_cli','refresh_codex_oauth_pure')}
        auth = SimpleNamespace(AuthError=AuthError, **originals)
        state = guard.install(auth)
        for name in originals:
            with self.assertRaises(AuthError):getattr(auth,name)('synthetic')
            originals[name].assert_not_called()
        self.assertEqual(state['blocked_attempts'],3)

    def test_incompatible_hermes_fails_before_install(self):
        original=Mock()
        auth=SimpleNamespace(_import_codex_cli_tokens=original)
        with self.assertRaises(RuntimeError):guard.install(auth)
        self.assertIs(auth._import_codex_cli_tokens,original)

    def test_split_module_guards_internal_recovery_and_public_aliases(self):
        class AuthError(Exception):
            def __init__(self, message, **kwargs):super().__init__(message)
        original=Mock(side_effect=AssertionError('unprotected authentication'))
        auth=SimpleNamespace(AuthError=AuthError,_import_codex_cli_tokens=original,
                             refresh_codex_oauth_pure=original)
        codex=SimpleNamespace(_import_codex_cli_tokens=original,
                              _recover_codex_tokens_from_cli=original,refresh_codex_oauth_pure=original)
        state=guard.install(auth,codex)
        for module,name in [(auth,'_import_codex_cli_tokens'),(auth,'refresh_codex_oauth_pure'),
                            (codex,'_import_codex_cli_tokens'),(codex,'_recover_codex_tokens_from_cli'),
                            (codex,'refresh_codex_oauth_pure')]:
            with self.assertRaises(AuthError):getattr(module,name)()
        original.assert_not_called()
        self.assertEqual(state['blocked_attempts'],5)

    def test_audit_requires_unmodified_connection_and_no_fallback_attempt(self):
        request,evidence,_=fixture()
        self.assertTrue(audit.approved_model(request,evidence))
        for field,value in [('auth_guard',{}),('auth_connection_unchanged',False),
            ('auth_guard',{'policy':guard.POLICY,'installed':True,'blocked_attempts':1})]:
            bad=copy.deepcopy(evidence);bad[field]=value
            self.assertFalse(audit.approved_model(request,bad))
        del request['auth_policy']
        self.assertFalse(audit.approved_model(request,evidence))

    def test_guard_is_active_before_cli_import_and_records_terminal_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);package=root/'hermes_cli';package.mkdir()
            (package/'__init__.py').write_text('')
            (package/'auth.py').write_text("class AuthError(Exception):\n    def __init__(self, message, **kwargs): super().__init__(message)\ndef unexpected(*args, **kwargs): raise AssertionError('original was called')\n_import_codex_cli_tokens = _recover_codex_tokens_from_cli = refresh_codex_oauth_pure = unexpected\n")
            (package/'main.py').write_text("from . import auth\ndef main():\n    try: auth._recover_codex_tokens_from_cli('expired')\n    except auth.AuthError: raise SystemExit(7)\n")
            receipt=root/'receipt.json'
            result=subprocess.run([sys.executable,str(Path(guard.__file__)),str(root),str(receipt)],capture_output=True,text=True)
            self.assertEqual(result.returncode,7,result.stderr)
            self.assertEqual(json.loads(receipt.read_text()),{'policy':guard.POLICY,'installed':True,'blocked_attempts':1})
            for blocked in (False,True):
                receipt=root/('abrupt-'+str(blocked)+'.json')
                body = "from . import auth\nimport os\ndef main():\n"
                if blocked:
                    body += "    try: auth._recover_codex_tokens_from_cli('expired')\n    except auth.AuthError: pass\n"
                body += "    os._exit(0)\n"
                (package/'main.py').write_text(body)
                result=subprocess.run([sys.executable,'-B',str(Path(guard.__file__)),str(root),str(receipt)],capture_output=True,text=True,
                                      env={**__import__('os').environ,'PYTHONPYCACHEPREFIX':str(root/('cache-'+str(blocked)))})
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertEqual(json.loads(receipt.read_text()),{'policy':guard.POLICY,'installed':True,'blocked_attempts':int(blocked)})

if __name__ == '__main__':unittest.main()
