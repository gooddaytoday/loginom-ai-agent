#!/usr/bin/env python3
"""Managed HTTP fixture for JavaScript Fetch acceptance (GitHub #69).

Specification: docs/node-development/nodes/programming-javascript/fetch-fs-http-fixture.md
Deployment:    scripts/node-acceptance/fixtures/README-http-fixture.md

Standard library only (Python 3.12). Three kinds of listeners:
  data   FIXTURE_DATA_PORT (18080)   routes /runs/{run_id}/... and /healthz
  admin  FIXTURE_ADMIN_PORT (18090)  /admin/..., every request needs
                                     Authorization: Bearer $FIXTURE_ADMIN_TOKEN
  tls    one port per run from FIXTURE_TLS_PORTS, allocated by the admin route
         POST /admin/runs/{run_id}/tls-listener; handshake only, never HTTP.
The self-signed certificate is generated in memory at start (pure Python RSA).
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import select
import signal
import socket
import ssl
import sys
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import ip_address
from urllib.parse import urlsplit

ALLOWED_HEADERS = ('content-type', 'accept', 'x-case-id', 'user-agent')
RUN_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z')
JSON_TYPE = 'application/json; charset=utf-8'
MAX_BODY = 16 * 1024 * 1024

ORDERS = (b'{"orders":[{"id":"A","qty":3,"price":"12.50"},'
          b'{"id":"B","qty":2,"price":"4.25"},{"id":"C","qty":0,"price":"9.99"}]}')
TEXT = 'Привет, Ёж\n42'.encode('utf-8')
BINARY = bytes.fromhex('00017f80ff')
MALFORMED = b'{"orders":'


def dumps(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def utc_now():
    now = datetime.now(timezone.utc)
    return now.strftime('%Y-%m-%dT%H:%M:%S.') + '%03dZ' % (now.microsecond // 1000)


def log(*parts):
    print(utc_now(), *parts, flush=True)


# --- self-signed certificate: minimal DER + RSA, no external packages -------

def _len(n):
    if n < 0x80:
        return bytes([n])
    raw = n.to_bytes((n.bit_length() + 7) // 8, 'big')
    return bytes([0x80 | len(raw)]) + raw


def _tlv(tag, content):
    return bytes([tag]) + _len(len(content)) + content


def _int(n):
    raw = n.to_bytes(n.bit_length() // 8 + 1, 'big')
    return _tlv(0x02, raw)


def _seq(*items):
    return _tlv(0x30, b''.join(items))


def _oid(dotted):
    arcs = [int(a) for a in dotted.split('.')]
    out = bytearray([40 * arcs[0] + arcs[1]])
    for arc in arcs[2:]:
        chunk = [arc & 0x7f]
        arc >>= 7
        while arc:
            chunk.append(0x80 | (arc & 0x7f))
            arc >>= 7
        out += bytes(reversed(chunk))
    return _tlv(0x06, bytes(out))


def _bits(content, unused=0):
    return _tlv(0x03, bytes([unused]) + content)


def _probable_prime(n):
    if n % 2 == 0:
        return n == 2
    for p in (3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73):
        if n % p == 0:
            return n == p
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(40):
        x = pow(secrets.randbelow(n - 3) + 2, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _prime(bits, e):
    while True:
        n = secrets.randbits(bits) | (3 << (bits - 2)) | 1
        if n % e != 1 and _probable_prime(n):
            return n


def generate_certificate(hosts, days=3650):
    """Return (cert_pem, key_pem) for a self-signed RSA-2048 certificate."""
    e = 65537
    while True:
        p, q = _prime(1024, e), _prime(1024, e)
        if p != q:
            break
    n, phi = p * q, (p - 1) * (q - 1)
    d = pow(e, -1, phi)
    key_der = _seq(_int(0), _int(n), _int(e), _int(d), _int(p), _int(q),
                   _int(d % (p - 1)), _int(d % (q - 1)), _int(pow(q, -1, p)))
    public = _seq(_int(n), _int(e))
    key_id = hashlib.sha1(public).digest()
    sha256_rsa = _seq(_oid('1.2.840.113549.1.1.11'), b'\x05\x00')
    name = _seq(_tlv(0x31, _seq(_oid('2.5.4.3'), _tlv(0x0c, hosts[0].encode()))))
    now = datetime.now(timezone.utc)
    validity = _seq(_tlv(0x17, (now - timedelta(days=1)).strftime('%y%m%d%H%M%SZ').encode()),
                    _tlv(0x17, (now + timedelta(days=days)).strftime('%y%m%d%H%M%SZ').encode()))
    alt = b''
    for host in hosts:
        try:
            alt += _tlv(0x87, ip_address(host).packed)
        except ValueError:
            alt += _tlv(0x82, host.encode('ascii'))

    def ext(oid, value, critical=False):
        return _seq(_oid(oid), b'\x01\x01\xff' if critical else b'', _tlv(0x04, value))
    extensions = _seq(
        ext('2.5.29.19', _seq(b'\x01\x01\xff'), True),          # basicConstraints CA:TRUE
        ext('2.5.29.15', _bits(b'\xa4', 2), True),               # keyUsage sig, keyEnc, certSign
        ext('2.5.29.37', _seq(_oid('1.3.6.1.5.5.7.3.1'))),       # extKeyUsage serverAuth
        ext('2.5.29.17', _seq(alt)),                             # subjectAltName
        ext('2.5.29.14', _tlv(0x04, key_id)),                    # subjectKeyIdentifier
        ext('2.5.29.35', _seq(_tlv(0x80, key_id))))              # authorityKeyIdentifier
    spki = _seq(_seq(_oid('1.2.840.113549.1.1.1'), b'\x05\x00'), _bits(public))
    tbs = _seq(_tlv(0xa0, _int(2)), _int(secrets.randbits(63) | 1), sha256_rsa, name,
               validity, name, spki, _tlv(0xa3, extensions))
    digest_info = bytes.fromhex('3031300d060960864801650304020105000420') + hashlib.sha256(tbs).digest()
    size = (n.bit_length() + 7) // 8
    padded = b'\x00\x01' + b'\xff' * (size - len(digest_info) - 3) + b'\x00' + digest_info
    signature = pow(int.from_bytes(padded, 'big'), d, n).to_bytes(size, 'big')
    cert_der = _seq(tbs, sha256_rsa, _bits(signature))

    def pem(label, der):
        body = base64.encodebytes(der).decode().replace('\n', '')
        lines = [body[i:i + 64] for i in range(0, len(body), 64)]
        return '-----BEGIN %s-----\n%s\n-----END %s-----\n' % (label, '\n'.join(lines), label)
    return pem('CERTIFICATE', cert_der), pem('RSA PRIVATE KEY', key_der)


def server_context(cert_pem, key_pem):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    with tempfile.TemporaryDirectory() as directory:
        cert, key = os.path.join(directory, 'cert.pem'), os.path.join(directory, 'key.pem')
        with open(cert, 'w') as handle:
            handle.write(cert_pem)
        with open(os.open(key, os.O_WRONLY | os.O_CREAT, 0o600), 'w') as handle:
            handle.write(key_pem)
        context.load_cert_chain(cert, key)
    return context


# --- per-run state -----------------------------------------------------------

class RunState:
    def __init__(self):
        self.ledger = []
        self.sequence = 0
        self.registrations = 0
        self.draft = None
        self.inflight = 0
        self.handshakes = []
        self.tls = None


class Store:
    def __init__(self):
        self.cond = threading.Condition()
        self.runs = {}

    def _run(self, run_id):
        return self.runs.setdefault(run_id, RunState())

    def begin(self, run_id):
        with self.cond:
            self._run(run_id).inflight += 1

    def end(self, run_id):
        with self.cond:
            self._run(run_id).inflight -= 1
            self.cond.notify_all()

    def commit(self, run_id, record):
        with self.cond:
            state = self._run(run_id)
            state.sequence += 1
            record = dict(run_id=run_id, sequence=state.sequence, **record)
            state.ledger.append(record)
        return record

    def register(self, run_id):
        with self.cond:
            state = self._run(run_id)
            state.registrations += 1
            return state.registrations

    def set_draft(self, run_id, body):
        with self.cond:
            self._run(run_id).draft = body

    def handshake(self, run_id, record):
        with self.cond:
            self._run(run_id).handshakes.append(record)

    def snapshot(self, run_id, field):
        with self.cond:
            state = self.runs.get(run_id)
            return [dict(r) for r in getattr(state, field)] if state else []

    def state(self, run_id):
        with self.cond:
            state = self.runs.get(run_id) or RunState()
            return {'run_id': run_id, 'sequence': state.sequence, 'registrations': state.registrations,
                    'draft_hex': None if state.draft is None else state.draft.hex(),
                    'inflight': state.inflight, 'tls_listener': state.tls.info() if state.tls else None}

    def reset(self, run_id, timeout):
        """Close the run's TLS listener, then drop all of its state once idle."""
        deadline = time.monotonic() + timeout
        idle = lambda: run_id not in self.runs or self.runs[run_id].inflight == 0
        with self.cond:
            if not self.cond.wait_for(idle, timeout):
                return False
            listener = self.runs[run_id].tls if run_id in self.runs else None
        if listener:
            listener.close()
        with self.cond:
            if not self.cond.wait_for(idle, max(0.0, deadline - time.monotonic())):
                return False
            self.runs.pop(run_id, None)
        return True


# --- TLS listener per run ----------------------------------------------------

class TlsListener:
    def __init__(self, fixture, run_id, slot, port):
        self.fixture, self.run_id, self.slot = fixture, run_id, slot
        self.listener_id = 'tls-' + run_id
        self.sock = socket.create_server((fixture.config['bind'], port))
        self.sock.settimeout(0.2)
        self.port = self.sock.getsockname()[1]
        self.closed = threading.Event()
        self.workers = []
        self.thread = threading.Thread(target=self._accept, daemon=True)
        self.thread.start()

    def info(self):
        host = self.fixture.config['public_host']
        return {'run_id': self.run_id, 'listener_id': self.listener_id, 'port': self.port,
                'tls_base_url': 'https://%s:%d/runs/%s' % (host, self.port, self.run_id)}

    def _accept(self):
        while not self.closed.is_set():
            try:
                conn, _ = self.sock.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            worker = threading.Thread(target=self._handshake, args=(conn,), daemon=True)
            self.workers.append(worker)
            worker.start()

    def _handshake(self, conn):
        conn.settimeout(self.fixture.config['io_timeout'])
        try:
            try:
                first = conn.recv(1, socket.MSG_PEEK)
            except OSError:
                first = b''
            if not first:  # TCP probe without ClientHello is not a handshake
                log('tls', self.listener_id, 'connection without ClientHello ignored')
                return
            failed, error = False, None
            try:
                conn = self.fixture.tls_context.wrap_socket(conn, server_side=True,
                                                            do_handshake_on_connect=False)
                conn.do_handshake()
            except ssl.SSLError as exc:
                failed, error = True, exc.reason or type(exc).__name__
            except OSError as exc:
                failed, error = True, type(exc).__name__
            record = {'run_id': self.run_id, 'listener_id': self.listener_id,
                      'failed': failed, 'at': utc_now(), 'error': error}
            self.fixture.store.handshake(self.run_id, record)
            log('tls', self.listener_id, 'failed' if failed else 'ok', error or '')
        finally:
            conn.close()  # no HTTP is ever served on this listener

    def close(self):
        self.closed.set()
        self.thread.join()
        self.sock.close()
        for worker in list(self.workers):
            worker.join()
        self.fixture.release_slot(self.slot)


# --- HTTP handlers -----------------------------------------------------------

class BaseHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    kind = 'http'

    def version_string(self):
        return 'loginom-http-fixture'

    def setup(self):
        self.timeout = self.server.fixture.config['io_timeout']
        super().setup()

    def parse_request(self):
        self.t0 = time.monotonic()
        self.received_at = utc_now()
        return super().parse_request()

    def log_message(self, fmt, *args):
        log(self.kind, fmt % args)

    def respond(self, status, payload=b'', ctype=None, headers=(), head=False):
        self.send_response(status)
        if ctype:
            self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        if not head and payload:
            self.wfile.write(payload)

    def read_body(self):
        """Return (body, complete); complete is False on EOF, timeout or bad framing."""
        data = bytearray()
        try:
            if 'chunked' in self.headers.get('Transfer-Encoding', '').lower():
                while True:
                    line = self.rfile.readline(1024)
                    if not line.endswith(b'\n'):
                        return bytes(data), False
                    size = int(line.split(b';')[0].strip(), 16)
                    if size == 0:
                        while True:
                            trailer = self.rfile.readline(1024)
                            if not trailer.endswith(b'\n'):
                                return bytes(data), False
                            if trailer in (b'\r\n', b'\n'):
                                return bytes(data), True
                    if len(data) + size > MAX_BODY:
                        return bytes(data), False
                    chunk = self.rfile.read(size)
                    data += chunk
                    if len(chunk) < size or self.rfile.read(2) != b'\r\n':
                        return bytes(data), False
            length = int(self.headers.get('Content-Length') or 0)
            if length < 0 or length > MAX_BODY:
                return bytes(data), False
            while len(data) < length:
                chunk = self.rfile.read1(length - len(data))
                if not chunk:
                    return bytes(data), False
                data += chunk
            return bytes(data), True
        except (OSError, ValueError):
            return bytes(data), False

    def do_GET(self):
        self.handle_any()

    do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_GET


class DataHandler(BaseHandler):
    kind = 'data'

    def handle_any(self):
        url = urlsplit(self.path)
        head = self.command == 'HEAD'
        match = re.match(r'/runs/([^/]+)(/.*)?\Z', url.path)
        if not match or not RUN_ID.match(match[1]):
            self.read_body()
            if url.path == '/healthz' and self.command in ('GET', 'HEAD'):
                return self.respond(200, b'{"ok":true}', JSON_TYPE, head=head)
            self.close_connection = True
            return self.respond(404, b'{"error":"not_found"}', JSON_TYPE, head=head)
        run_id, suffix = match[1], match[2] or ''
        store = self.server.fixture.store
        store.begin(run_id)
        try:
            self._serve(store, run_id, suffix, url, head)
        finally:
            store.end(run_id)

    def _serve(self, store, run_id, suffix, url, head):
        body, complete = self.read_body()
        record = {
            'method': self.command, 'path': url.path, 'query': url.query,
            'headers': {k: ', '.join(self.headers.get_all(k)) for k in ALLOWED_HEADERS if k in self.headers},
            'body_sha256': hashlib.sha256(body).hexdigest(), 'body_bytes': len(body),
            'received_at': self.received_at}

        def commit(status, closed):
            elapsed = int(round((time.monotonic() - self.t0) * 1000))
            store.commit(run_id, dict(record, elapsed_ms=elapsed, response_status=status, client_closed=closed))

        if not complete:
            self.close_connection = True
            return commit(None, True)
        status, payload, ctype, headers, delay_ms = self.route(store, run_id, suffix, url, body, record)
        if delay_ms and self.wait_or_closed(delay_ms):
            self.close_connection = True
            return commit(None, True)
        commit(status, False)
        try:
            self.respond(status, payload, ctype, headers, head)
        except OSError:
            self.close_connection = True

    def wait_or_closed(self, delay_ms):
        """Sleep on a monotonic clock; return True as soon as the client closes."""
        deadline = time.monotonic() + delay_ms / 1000.0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            readable, _, _ = select.select([self.connection], [], [], min(remaining, 0.05))
            if readable:
                try:
                    if self.connection.recv(1, socket.MSG_PEEK) == b'':
                        return True
                except OSError:
                    return True
                time.sleep(max(0.0, deadline - time.monotonic()))  # pipelined bytes: just wait
                return False

    def route(self, store, run_id, suffix, url, body, record):
        """Return (status, payload, content type, extra headers, delay ms); applies effects."""
        method = 'GET' if self.command == 'HEAD' else self.command
        base = '/runs/' + run_id

        def ok(payload, ctype=JSON_TYPE, status=200):
            return status, payload, ctype, (), 0

        def allow(*methods):
            if method in methods:
                return None
            names = list(methods) + (['HEAD'] if 'GET' in methods else [])
            return 405, b'{"error":"method_not_allowed"}', JSON_TYPE, (('Allow', ', '.join(names)),), 0

        static = {'/orders': (200, ORDERS, JSON_TYPE), '/text': (200, TEXT, 'text/plain; charset=utf-8'),
                  '/binary': (200, BINARY, 'application/octet-stream'),
                  '/missing': (404, b'{"error":"missing"}', JSON_TYPE),
                  '/failure': (500, b'{"error":"fixture_failure"}', JSON_TYPE),
                  '/malformed': (200, MALFORMED, 'application/json')}
        if suffix in static:
            status, payload, ctype = static[suffix]
            return allow('GET') or ok(payload, ctype, status)
        redirect = re.match(r'/redirect/(301|302|307)\Z', suffix)
        if redirect:
            refused = allow('GET', 'POST')
            if refused:
                return refused
            target = base + ('/orders' if method == 'GET' else '/echo')
            return int(redirect[1]), b'', None, (('Location', target),), 0
        if suffix == '/slow':
            refused = allow('GET')
            if refused:
                return refused
            raw = re.fullmatch(r'ms=(\d{1,6})', url.query or 'ms=3000')
            if not raw or int(raw[1]) > self.server.fixture.config['max_slow_ms']:
                return 400, b'{"error":"bad_ms"}', JSON_TYPE, (), 0
            return 200, b'{"ready":true}', JSON_TYPE, (), int(raw[1])
        if suffix in ('/receipts', '/reports'):
            return allow('POST') or ok(dumps({'accepted': True, 'sequence': store.register(run_id)}),
                                       status=201)
        if suffix == '/draft':
            refused = allow('PUT', 'PATCH', 'DELETE')
            if refused:
                return refused
            store.set_draft(run_id, None if method == 'DELETE' else body)
            return ok(b'{"deleted":true}' if method == 'DELETE' else b'{"stored":true}')
        if suffix == '/echo':
            return allow('GET', 'POST') or ok(dumps({'method': self.command, 'body_hex': body.hex(),
                                                     'headers': record['headers']}))
        return ok(b'{"error":"not_found"}', status=404)


class AdminHandler(BaseHandler):
    kind = 'admin'

    def handle_any(self):
        fixture = self.server.fixture
        self.read_body()
        given = self.headers.get('Authorization', '').encode()
        if not hmac.compare_digest(given, ('Bearer ' + fixture.config['admin_token']).encode()):
            return self.respond(401, b'{"error":"unauthorized"}', JSON_TYPE,
                                (('WWW-Authenticate', 'Bearer'),))
        path, method = urlsplit(self.path).path, self.command
        if path == '/admin/health' and method == 'GET':
            return self.respond(200, dumps({'ok': True, 'tls_slots_free': fixture.free_slots()}), JSON_TYPE)
        if path == '/admin/tls-certificate' and method == 'GET':
            return self.respond(200, fixture.cert_pem.encode(), 'application/x-pem-file')
        match = re.match(r'/admin/runs/([^/]+)(/[a-z-]+)?\Z', path)
        if not match or not RUN_ID.match(match[1]):
            return self.respond(404, b'{"error":"not_found"}', JSON_TYPE)
        run_id, action = match[1], match[2] or ''
        store = fixture.store
        if (action, method) == ('/ledger', 'GET'):
            return self.respond(200, dumps(store.snapshot(run_id, 'ledger')), JSON_TYPE)
        if (action, method) == ('/tls-handshakes', 'GET'):
            return self.respond(200, dumps(store.snapshot(run_id, 'handshakes')), JSON_TYPE)
        if (action, method) == ('/state', 'GET'):
            return self.respond(200, dumps(store.state(run_id)), JSON_TYPE)
        if (action, method) == ('/tls-listener', 'POST'):
            status, info = fixture.open_tls(run_id)
            return self.respond(status, dumps(info), JSON_TYPE)
        if (action, method) == ('', 'DELETE'):
            if store.reset(run_id, fixture.config['reset_timeout']):
                return self.respond(200, b'{"reset":true}', JSON_TYPE)
            return self.respond(409, b'{"error":"run_busy"}', JSON_TYPE)
        return self.respond(404, b'{"error":"not_found"}', JSON_TYPE)


# --- process -----------------------------------------------------------------

def parse_ports(text):
    ports = []
    for part in text.split(','):
        low, _, high = part.strip().partition('-')
        ports.extend(range(int(low), int(high or low) + 1))
    return ports


def config_from_env(env):
    token = env.get('FIXTURE_ADMIN_TOKEN', '')
    if len(token) < 16:
        raise SystemExit('FIXTURE_ADMIN_TOKEN must be set (at least 16 characters)')
    return {'bind': env.get('FIXTURE_BIND', '0.0.0.0'),
            'data_port': int(env.get('FIXTURE_DATA_PORT', '18080')),
            'admin_port': int(env.get('FIXTURE_ADMIN_PORT', '18090')),
            'tls_ports': parse_ports(env.get('FIXTURE_TLS_PORTS', '18443-18462')),
            'public_host': env.get('FIXTURE_PUBLIC_HOST', 'loginom-http-fixture'),
            'admin_token': token,
            'io_timeout': float(env.get('FIXTURE_IO_TIMEOUT', '30')),
            'reset_timeout': float(env.get('FIXTURE_RESET_TIMEOUT', '10')),
            'max_slow_ms': int(env.get('FIXTURE_MAX_SLOW_MS', '60000'))}


class Fixture:
    def __init__(self, config, certificate=None):
        self.config = config
        self.store = Store()
        hosts = [config['public_host'], 'localhost', '127.0.0.1']
        self.cert_pem, key_pem = certificate or generate_certificate(hosts)
        self.tls_context = server_context(self.cert_pem, key_pem)
        self.slots = [None] * len(config['tls_ports'])
        self.slot_lock = threading.Lock()
        self.servers = []

    def start(self):
        for port, handler in ((self.config['data_port'], DataHandler), (self.config['admin_port'], AdminHandler)):
            server = ThreadingHTTPServer((self.config['bind'], port), handler)
            server.daemon_threads = True
            server.fixture = self
            threading.Thread(target=server.serve_forever, daemon=True).start()
            self.servers.append(server)
        self.data_port, self.admin_port = (s.server_address[1] for s in self.servers)
        return self

    def stop(self):
        for server in self.servers:
            server.shutdown()
            server.server_close()
        for listener in [s for s in self.slots if s]:
            listener.close()

    def free_slots(self):
        with self.slot_lock:
            return self.slots.count(None)

    def release_slot(self, slot):
        with self.slot_lock:
            self.slots[slot] = None
        with self.store.cond:
            for state in self.store.runs.values():
                if state.tls and state.tls.slot == slot:
                    state.tls = None

    def open_tls(self, run_id):
        """Allocate (idempotently) the run's own TLS listener."""
        with self.store.cond:
            state = self.store._run(run_id)
            if state.tls:
                return 200, state.tls.info()
            with self.slot_lock:
                for slot, port in enumerate(self.config['tls_ports']):
                    if self.slots[slot] is not None:
                        continue
                    try:
                        listener = TlsListener(self, run_id, slot, port)
                    except OSError:
                        continue
                    self.slots[slot] = state.tls = listener
                    return 201, listener.info()
        return 503, {'error': 'no_tls_port'}


def main():
    config = config_from_env(os.environ)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    fixture = Fixture(config).start()
    log('READY data=%d admin=%d tls=%d-%d host=%s' % (
        fixture.data_port, fixture.admin_port, min(config['tls_ports']), max(config['tls_ports']),
        config['public_host']))
    stop.wait()
    fixture.stop()


if __name__ == '__main__':
    sys.exit(main())
