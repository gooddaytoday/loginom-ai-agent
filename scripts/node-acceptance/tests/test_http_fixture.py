"""Tests for scripts/node-acceptance/fixtures/http_fixture.py.

python3 -I -m unittest discover -s scripts/node-acceptance/tests -p test_http_fixture.py
"""
import hashlib
import http.client
import importlib.util
import itertools
import json
import os
import re
import socket
import ssl
import tempfile
import threading
import time
import unittest
import urllib.request
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / 'fixtures' / 'http_fixture.py'
SPEC = importlib.util.spec_from_file_location('http_fixture', PATH)
fx = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fx)
fx.log = lambda *parts: None  # keep unittest output readable

TOKEN = 'unit-test-admin-token-value'
JSON = 'application/json; charset=utf-8'
COUNTER = itertools.count(1)
CERTIFICATE = None


def wait_for(probe, timeout=5.0):
    deadline = time.monotonic() + timeout
    while True:
        value = probe()
        if value or time.monotonic() > deadline:
            return value
        time.sleep(0.02)


class FixtureTest(unittest.TestCase):
    tls_ports = [0, 0]

    @classmethod
    def setUpClass(cls):
        global CERTIFICATE
        CERTIFICATE = CERTIFICATE or fx.generate_certificate(['loginom-http-fixture', 'localhost', '127.0.0.1'])
        config = fx.config_from_env({'FIXTURE_ADMIN_TOKEN': TOKEN, 'FIXTURE_BIND': '127.0.0.1',
                                     'FIXTURE_DATA_PORT': '0', 'FIXTURE_ADMIN_PORT': '0',
                                     'FIXTURE_IO_TIMEOUT': '2', 'FIXTURE_RESET_TIMEOUT': '1',
                                     'FIXTURE_PUBLIC_HOST': 'localhost'})
        config['tls_ports'] = cls.tls_ports
        cls.fixture = fx.Fixture(config, CERTIFICATE).start()

    @classmethod
    def tearDownClass(cls):
        cls.fixture.stop()

    def setUp(self):
        self.run = 'run-%d.%s' % (next(COUNTER), self.id().rsplit('.', 1)[-1][:30])

    def request(self, method, suffix, body=None, headers=None, run=None, port=None):
        conn = http.client.HTTPConnection('127.0.0.1', port or self.fixture.data_port, timeout=10)
        path = suffix if suffix.startswith('/') and port else '/runs/%s%s' % (run or self.run, suffix)
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        payload = response.read()
        conn.close()
        return response, payload

    def admin(self, method, path, token=TOKEN):
        headers = {'Authorization': 'Bearer ' + token} if token is not None else {}
        conn = http.client.HTTPConnection('127.0.0.1', self.fixture.admin_port, timeout=10)
        conn.request(method, path, headers=headers)
        response = conn.getresponse()
        payload = response.read()
        conn.close()
        return response, payload

    def admin_json(self, method, path, status=200):
        response, payload = self.admin(method, path)
        self.assertEqual(response.status, status, payload)
        return json.loads(payload)

    def ledger(self, run=None):
        return self.admin_json('GET', '/admin/runs/%s/ledger' % (run or self.run))

    def state(self, run=None):
        return self.admin_json('GET', '/admin/runs/%s/state' % (run or self.run))

    def raw(self, data, close_after=0.0):
        sock = socket.create_connection(('127.0.0.1', self.fixture.data_port))
        sock.sendall(data)
        time.sleep(close_after)
        sock.close()


class DataRoutes(FixtureTest):
    def assertResponse(self, response, payload, status, ctype, body):
        self.assertEqual(response.status, status)
        self.assertEqual(response.getheader('Content-Type'), ctype)
        self.assertEqual(response.getheader('Cache-Control'), 'no-store')
        self.assertEqual(response.getheader('Content-Length'), str(len(body)))
        self.assertEqual(payload, body)

    def test_get_routes_return_exact_bytes(self):
        cases = [
            ('/orders', 200, JSON, b'{"orders":[{"id":"A","qty":3,"price":"12.50"},{"id":"B","qty":2,'
                                   b'"price":"4.25"},{"id":"C","qty":0,"price":"9.99"}]}'),
            ('/text', 200, 'text/plain; charset=utf-8', 'Привет, Ёж\n42'.encode()),
            ('/binary', 200, 'application/octet-stream', bytes([0x00, 0x01, 0x7f, 0x80, 0xff])),
            ('/missing', 404, JSON, b'{"error":"missing"}'),
            ('/failure', 500, JSON, b'{"error":"fixture_failure"}'),
            ('/malformed', 200, 'application/json', b'{"orders":'),
        ]
        for suffix, status, ctype, body in cases:
            with self.subTest(suffix):
                self.assertResponse(*self.request('GET', suffix), status, ctype, body)
        self.assertFalse(fx.TEXT.endswith(b'\n'))
        self.assertEqual([(r['method'], r['path'], r['response_status']) for r in self.ledger()],
                         [('GET', '/runs/%s%s' % (self.run, c[0]), c[1]) for c in cases])

    def test_head_has_get_status_and_headers_without_body(self):
        for suffix in ['/text', '/orders', '/missing', '/redirect/301']:
            with self.subTest(suffix):
                got, _ = self.request('GET', suffix)
                head, payload = self.request('HEAD', suffix)
                self.assertEqual(payload, b'')
                self.assertEqual(head.status, got.status)
                for name in ['Content-Type', 'Content-Length', 'Cache-Control', 'Location']:
                    self.assertEqual(head.getheader(name), got.getheader(name))
        self.assertIn(('HEAD', 200), [(r['method'], r['response_status']) for r in self.ledger()])

    def test_get_redirects_point_to_orders_of_same_run(self):
        for code in ['301', '302', '307']:
            with self.subTest(code):
                response, payload = self.request('GET', '/redirect/' + code)
                self.assertEqual(response.status, int(code))
                self.assertEqual(response.getheader('Location'), '/runs/%s/orders' % self.run)
                self.assertEqual(response.getheader('Content-Length'), '0')
                self.assertEqual(payload, b'')

    def test_followed_redirect_records_every_hop(self):
        url = 'http://127.0.0.1:%d/runs/%s/redirect/302' % (self.fixture.data_port, self.run)
        with urllib.request.urlopen(url, timeout=10) as response:
            self.assertEqual(response.read(), fx.ORDERS)
        self.assertEqual([(r['sequence'], r['path'], r['response_status']) for r in self.ledger()],
                         [(1, '/runs/%s/redirect/302' % self.run, 302), (2, '/runs/%s/orders' % self.run, 200)])

    def test_post_redirects_point_to_echo_and_307_keeps_method_and_body(self):
        for code in ['301', '302', '307']:
            with self.subTest(code):
                response, payload = self.request('POST', '/redirect/' + code, b'{}',
                                                 {'Content-Type': 'application/json'})
                self.assertEqual((response.status, payload), (int(code), b''))
                self.assertEqual(response.getheader('Location'), '/runs/%s/echo' % self.run)
        response, payload = self.request('POST', '/echo', b'{}', {'Content-Type': 'application/json'})
        self.assertEqual(json.loads(payload)['method'], 'POST')
        hops = [(r['method'], r['path'][len('/runs/' + self.run):], r['body_bytes']) for r in self.ledger()]
        self.assertEqual(hops, [('POST', '/redirect/301', 2), ('POST', '/redirect/302', 2),
                                ('POST', '/redirect/307', 2), ('POST', '/echo', 2)])

    def test_echo_returns_method_body_hex_and_only_allowlisted_headers(self):
        response, payload = self.request('POST', '/echo', b'{}', {
            'Content-Type': 'application/json', 'X-Case-Id': 'echo-1', 'Authorization': 'Bearer nope',
            'Cookie': 'a=b', 'X-Other': 'x'})
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, b'{"method":"POST","body_hex":"7b7d","headers":'
                                  b'{"content-type":"application/json","x-case-id":"echo-1"}}')
        body = json.loads(payload)
        self.assertEqual((body['method'], body['body_hex']), ('POST', '7b7d'))
        self.assertEqual(body['headers'], {'content-type': 'application/json', 'x-case-id': 'echo-1'})
        response, payload = self.request('GET', '/echo')
        self.assertEqual(json.loads(payload)['method'], 'GET')
        self.assertEqual(self.request('PUT', '/echo', b'{}')[0].status, 405)

    def test_chunked_request_body_is_decoded(self):
        self.raw(b'POST /runs/%s/receipts HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n'
                 b'3\r\n{"i\r\n6\r\nd":"A"\r\n1\r\n}\r\n0\r\n\r\n' % self.run.encode(), 0.3)
        record = wait_for(lambda: self.ledger())[0]
        self.assertEqual((record['body_bytes'], record['response_status']), (10, 201))
        self.assertEqual(record['body_sha256'], hashlib.sha256(b'{"id":"A"}').hexdigest())

    def test_receipts_and_reports_share_the_run_registration_counter(self):
        seen = []
        for suffix, body in [('/receipts', b'{"id":"A","amount":"37.50"}'), ('/reports', b'id,total\nA,37.50\n'),
                             ('/receipts', b'{"id":"A","amount":"37.50"}')]:
            response, payload = self.request('POST', suffix, body)
            self.assertEqual((response.status, response.getheader('Content-Type')), (201, JSON))
            seen.append(payload)
        self.assertEqual(seen, [b'{"accepted":true,"sequence":%d}' % i for i in (1, 2, 3)])
        self.assertEqual(self.request('GET', '/receipts')[0].status, 405)
        self.assertEqual(self.state()['registrations'], 3)

    def test_draft_put_patch_delete_change_only_this_run(self):
        other = self.run + '-other'
        self.request('PUT', '/draft', b'{"value":"other"}', run=other)
        expect = [('PUT', b'{"value":"draft"}', b'{"stored":true}'),
                  ('PATCH', b'{"value":"final"}', b'{"stored":true}'),
                  ('DELETE', None, b'{"deleted":true}')]
        drafts = []
        for method, body, answer in expect:
            response, payload = self.request(method, '/draft', body)
            self.assertEqual((response.status, payload), (200, answer))
            drafts.append(self.state()['draft_hex'])
        self.assertEqual(drafts, [b'{"value":"draft"}'.hex(), b'{"value":"final"}'.hex(), None])
        self.assertEqual(self.state(other)['draft_hex'], b'{"value":"other"}'.hex())
        response, _ = self.request('POST', '/draft', b'{}')
        self.assertEqual((response.status, response.getheader('Allow')), (405, 'PUT, PATCH, DELETE'))

    def test_slow_delays_headers_on_monotonic_clock(self):
        start = time.monotonic()
        response, payload = self.request('GET', '/slow?ms=400')
        self.assertGreaterEqual(time.monotonic() - start, 0.4)
        self.assertEqual((response.status, payload), (200, b'{"ready":true}'))
        record = self.ledger()[0]
        self.assertEqual((record['query'], record['client_closed']), ('ms=400', False))
        self.assertGreaterEqual(record['elapsed_ms'], 400)
        self.assertEqual(self.request('GET', '/slow?ms=x')[0].status, 400)
        self.assertEqual(self.request('GET', '/slow?ms=999999')[0].status, 400)

    def test_slow_records_client_close_before_response(self):
        self.raw(b'GET /runs/%s/slow?ms=3000 HTTP/1.1\r\nHost: x\r\nX-Case-Id: abort\r\n\r\n' % self.run.encode(), 0.2)
        record = wait_for(self.ledger, 2.5)[0]
        self.assertEqual((record['response_status'], record['client_closed']), (None, True))
        self.assertEqual(record['headers'], {'x-case-id': 'abort'})
        self.assertLess(record['elapsed_ms'], 2500)

    def test_unknown_suffix_and_wrong_method_are_logged(self):
        self.assertEqual(self.request('GET', '/nope')[0].status, 404)
        response, _ = self.request('DELETE', '/orders')
        self.assertEqual((response.status, response.getheader('Allow')), (405, 'GET, HEAD'))
        self.assertEqual([r['response_status'] for r in self.ledger()], [404, 405])


class Ledger(FixtureTest):
    def test_record_shape_digest_and_header_allowlist(self):
        body = b'{"id":"A","amount":"37.50"}'
        self.request('POST', '/receipts?case=1', body, {
            'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Case-Id': 'submit-A',
            'User-Agent': 'unit', 'Authorization': 'Bearer secret', 'Cookie': 'sid=1',
            'Proxy-Authorization': 'Basic x', 'X-Other': 'y'})
        record, = self.ledger()
        self.assertEqual(list(record), ['run_id', 'sequence', 'method', 'path', 'query', 'headers', 'body_sha256',
                                        'body_bytes', 'received_at', 'elapsed_ms', 'response_status', 'client_closed'])
        self.assertEqual(record['headers'], {'content-type': 'application/json', 'accept': 'application/json',
                                             'x-case-id': 'submit-A', 'user-agent': 'unit'})
        self.assertEqual((record['run_id'], record['sequence'], record['path'], record['query']),
                         (self.run, 1, '/runs/%s/receipts' % self.run, 'case=1'))
        self.assertEqual((record['body_sha256'], record['body_bytes']), (hashlib.sha256(body).hexdigest(), 27))
        self.assertRegex(record['received_at'], r'\A\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\Z')
        self.assertIsInstance(record['elapsed_ms'], int)
        self.assertEqual((record['response_status'], record['client_closed']), (201, False))
        self.assertNotIn('secret', json.dumps(self.ledger()))

    def test_truncated_body_is_recorded_with_received_bytes_without_effect(self):
        self.raw(b'POST /runs/%s/receipts HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\n0123456789'
                 % self.run.encode(), 0.2)
        record, = wait_for(self.ledger)
        self.assertEqual((record['body_bytes'], record['body_sha256']), (10, hashlib.sha256(b'0123456789').hexdigest()))
        self.assertEqual((record['response_status'], record['client_closed']), (None, True))
        self.assertEqual(self.state()['registrations'], 0)

    def test_sequence_is_atomic_under_concurrency(self):
        threads = [threading.Thread(target=self.request, args=('POST', '/receipts', b'{}')) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(sorted(r['sequence'] for r in self.ledger()), list(range(1, 21)))
        self.assertEqual(self.state()['registrations'], 20)

    def test_two_runs_are_isolated(self):
        other = self.run + '-b'
        self.request('POST', '/receipts', b'{}')
        self.request('PUT', '/draft', b'{"value":"a"}')
        response, payload = self.request('POST', '/receipts', b'{}', run=other)
        self.assertEqual(payload, b'{"accepted":true,"sequence":1}')
        self.assertEqual([r['path'] for r in self.ledger()], ['/runs/%s/receipts' % self.run, '/runs/%s/draft' % self.run])
        self.assertEqual([(r['sequence'], r['path']) for r in self.ledger(other)], [(1, '/runs/%s/receipts' % other)])
        self.assertIsNone(self.state(other)['draft_hex'])

    def test_requests_outside_runs_are_not_logged(self):
        for path in ['/healthz', '/admin/runs/%s/ledger' % self.run, '/runs/bad%2Fid/orders', '/orders']:
            self.request('GET', path, port=self.fixture.data_port)
        self.assertEqual(self.request('GET', '/healthz', port=self.fixture.data_port)[1], b'{"ok":true}')
        self.assertEqual(self.request('GET', '/admin/runs/%s/ledger' % self.run, port=self.fixture.data_port)[0].status, 404)
        self.assertEqual(self.ledger(), [])


class Admin(FixtureTest):
    def test_every_admin_route_requires_bearer_token(self):
        routes = [('GET', '/admin/health'), ('GET', '/admin/tls-certificate'), ('GET', '/admin/runs/r/ledger'),
                  ('GET', '/admin/runs/r/tls-handshakes'), ('GET', '/admin/runs/r/state'),
                  ('POST', '/admin/runs/r/tls-listener'), ('DELETE', '/admin/runs/r'), ('GET', '/runs/r/orders')]
        for method, path in routes:
            for token in [None, 'wrong', TOKEN + 'x']:
                with self.subTest(path=path, token=token):
                    response, payload = self.admin(method, path, token)
                    self.assertEqual((response.status, payload), (401, b'{"error":"unauthorized"}'))
        self.assertEqual(self.admin('GET', '/runs/r/orders')[0].status, 404)
        self.assertTrue(self.admin_json('GET', '/admin/health')['ok'])
        self.assertEqual(self.free_tls(), 2)

    def free_tls(self):
        return self.admin_json('GET', '/admin/health')['tls_slots_free']

    def test_reset_clears_only_this_run_and_restarts_counters(self):
        other = self.run + '-keep'
        self.request('POST', '/receipts', b'{}')
        self.request('PUT', '/draft', b'{}')
        self.request('POST', '/receipts', b'{}', run=other)
        self.assertEqual(self.admin_json('DELETE', '/admin/runs/' + self.run), {'reset': True})
        self.assertEqual(self.ledger(), [])
        self.assertEqual((self.state()['registrations'], self.state()['draft_hex']), (0, None))
        self.assertEqual(len(self.ledger(other)), 1)
        self.assertEqual(self.request('POST', '/receipts', b'{}')[1], b'{"accepted":true,"sequence":1}')

    def test_reset_waits_for_inflight_handlers(self):
        worker = threading.Thread(target=self.request, args=('GET', '/slow?ms=2000'))
        worker.start()
        wait_for(lambda: self.state()['inflight'])
        response, payload = self.admin('DELETE', '/admin/runs/' + self.run)
        self.assertEqual((response.status, payload), (409, b'{"error":"run_busy"}'))
        worker.join()
        self.assertEqual(len(self.ledger()), 1)
        self.assertEqual(self.admin_json('DELETE', '/admin/runs/' + self.run), {'reset': True})
        self.assertEqual(self.ledger(), [])

    def test_config_requires_admin_token(self):
        for env in [{}, {'FIXTURE_ADMIN_TOKEN': 'short'}]:
            with self.assertRaises(SystemExit):
                fx.config_from_env(env)
        self.assertEqual(fx.parse_ports('18443-18445,18500'), [18443, 18444, 18445, 18500])


class Tls(FixtureTest):
    def setUp(self):
        super().setUp()
        self.addCleanup(self.admin, 'DELETE', '/admin/runs/' + self.run)
    def open_listener(self, run=None, status=201):
        return self.admin_json('POST', '/admin/runs/%s/tls-listener' % (run or self.run), status)

    def handshakes(self, run=None):
        return self.admin_json('GET', '/admin/runs/%s/tls-handshakes' % (run or self.run))

    def connect(self, port, context):
        with socket.create_connection(('127.0.0.1', port), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname='localhost') as tls:
                return tls.version()

    def test_listener_per_run_logs_failed_and_trusted_handshakes(self):
        info = self.open_listener()
        port = info['port']
        self.assertEqual(info, {'run_id': self.run, 'listener_id': 'tls-' + self.run, 'port': port,
                                'tls_base_url': 'https://localhost:%d/runs/%s' % (port, self.run)})
        self.assertEqual(self.open_listener(status=200), info)
        socket.create_connection(('127.0.0.1', port)).close()  # TCP probe: not a handshake
        with self.assertRaises(ssl.SSLCertVerificationError):
            self.connect(port, ssl.create_default_context())
        failed, = wait_for(self.handshakes)
        self.assertEqual({k: failed[k] for k in ['run_id', 'listener_id', 'failed']},
                         {'run_id': self.run, 'listener_id': 'tls-' + self.run, 'failed': True})
        self.assertRegex(failed['at'], r'\A\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\Z')
        self.assertTrue(failed['error'])
        _, pem = self.admin('GET', '/admin/tls-certificate')
        with tempfile.TemporaryDirectory() as directory:
            cafile = os.path.join(directory, 'ca.pem')
            Path(cafile).write_bytes(pem)
            self.connect(port, ssl.create_default_context(cafile=cafile))
        records = wait_for(lambda: len(self.handshakes()) == 2 and self.handshakes())
        self.assertEqual([r['failed'] for r in records], [True, False])
        self.assertEqual(self.ledger(), [])

    def test_two_runs_get_separate_listeners_and_pool_is_bounded(self):
        a, b = self.run + '-a', self.run + '-b'
        port_a, port_b = self.open_listener(a)['port'], self.open_listener(b)['port']
        self.assertNotEqual(port_a, port_b)
        self.assertEqual(self.open_listener(self.run + '-c', 503), {'error': 'no_tls_port'})
        with self.assertRaises(ssl.SSLError):
            self.connect(port_a, ssl.create_default_context())
        self.assertEqual(len(wait_for(lambda: self.handshakes(a))), 1)
        self.assertEqual(self.handshakes(b), [])
        for run in (a, b):
            self.admin_json('DELETE', '/admin/runs/' + run)

    def test_reset_closes_listener_and_clears_handshakes(self):
        port = self.open_listener()['port']
        with self.assertRaises(ssl.SSLError):
            self.connect(port, ssl.create_default_context())
        wait_for(self.handshakes)
        self.assertEqual(self.admin_json('DELETE', '/admin/runs/' + self.run), {'reset': True})
        self.assertEqual(self.handshakes(), [])
        self.assertIsNone(self.state()['tls_listener'])
        with self.assertRaises(OSError):
            socket.create_connection(('127.0.0.1', port), timeout=2).close()
        self.assertEqual(self.open_listener()['run_id'], self.run)
        self.admin_json('DELETE', '/admin/runs/' + self.run)


if __name__ == '__main__':
    unittest.main()
