"""Linux acceptance admission and bounded desktop inheritance; no live calls."""
import os
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import run


class LinuxEnvironmentTest(unittest.TestCase):
    desktop = dict(DISPLAY=':99', XAUTHORITY='/test/auth', WAYLAND_DISPLAY='wayland-1',
                   XDG_RUNTIME_DIR='/test/runtime', XDG_SESSION_TYPE='wayland',
                   XDG_CURRENT_DESKTOP='ubuntu:GNOME')

    def test_linux_inherits_desktop_without_secrets_and_keeps_isolation(self):
        with patch.dict(os.environ, {**self.desktop, 'API_KEY': 'private', 'NODE_OPTIONS': 'untrusted',
                                    'HERMES_HOME': '/other/home', 'HERMES_CWD': '/other/cwd'}, clear=True), \
                patch.object(run.sys, 'platform', 'linux'):
            result = run.environment({}, Path('/isolated/home'), Path('/isolated/cwd'))
        for key, value in self.desktop.items():
            self.assertEqual(result[key], value)
        self.assertNotIn('API_KEY', result)
        self.assertNotIn('NODE_OPTIONS', result)
        self.assertEqual(result['HERMES_HOME'], '/isolated/home')
        self.assertEqual(result['HERMES_CWD'], '/isolated/cwd')

    def test_missing_empty_function_settings_are_not_forwarded(self):
        for value in (None, '', '() { unsafe; }'):
            env = {} if value is None else dict.fromkeys(self.desktop, value)
            with patch.dict(os.environ, env, clear=True), patch.object(run.sys, 'platform', 'linux'):
                result = run.environment({}, Path('/home'), Path('/run'))
            for key in self.desktop:
                self.assertNotIn(key, result)

    def test_mac_environment_retains_original_whitelist(self):
        with patch.dict(os.environ, self.desktop, clear=True), patch.object(run.sys, 'platform', 'darwin'):
            result = run.environment({}, Path('/home'), Path('/run'))
        self.assertEqual(result['DISPLAY'], ':99')
        for key in self.desktop.keys() - {'DISPLAY'}:
            self.assertNotIn(key, result)

    def test_child_uses_existing_proxy_and_no_proxy_exclusion(self):
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.server.server_port, self.path))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'OK')
            def log_message(self, *args):
                pass
        proxy = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        origin = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        for server in (proxy, origin):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            address = f'http://127.0.0.1:{proxy.server_port}'
            settings = {key: address for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
                                                  'http_proxy', 'https_proxy', 'all_proxy')}
            settings.update(NO_PROXY='127.0.0.1', no_proxy='127.0.0.1')
            with patch.dict(os.environ, settings, clear=True):
                env = run.environment({}, Path('/isolated/home'), Path('/isolated/run'))
            self.assertEqual({key: env.get(key) for key in settings}, settings)
            urls = ['http://proxy-proof.invalid/proxied', f'http://127.0.0.1:{origin.server_port}/direct']
            code = 'import json,sys,urllib.request; [urllib.request.urlopen(u,timeout=5).read() for u in json.loads(sys.argv[1])]'
            subprocess.run([sys.executable, '-c', code, json.dumps(urls)], env=env,
                           check=True, capture_output=True, timeout=15)
            self.assertEqual(requests, [(proxy.server_port, urls[0]), (origin.server_port, '/direct')])
        finally:
            for server in (proxy, origin):
                server.shutdown()
                server.server_close()

    def test_linux_run_still_requires_explicit_identity_storage_and_catalog(self):
        good = dict(goal='basic-graph', run=True, timeout=1200, max_turns=60,
                    model_profile='chatgpt-sol', loginom_user='operator-selected', storage_directory='/selected',
                    manifest_uri=run.MANIFEST_ROOT+'test-candidate/manifest.json', manifest_sha256='a'*64)
        with patch.object(run.sys, 'platform', 'linux'):
            run.validate_inputs(SimpleNamespace(**good))
            for change in (dict(loginom_user=None), dict(storage_directory=None),
                           dict(manifest_uri=None), dict(manifest_sha256=None),
                           dict(model_profile='unapproved')):
                with self.assertRaises(ValueError):
                    run.validate_inputs(SimpleNamespace(**{**good, **change}))
        with patch.object(run.sys, 'platform', 'win32'), self.assertRaises(ValueError):
            run.validate_inputs(SimpleNamespace(**good))


if __name__ == '__main__':
    unittest.main()
