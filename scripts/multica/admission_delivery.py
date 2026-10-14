"""Linux-only live original-decision delivery to one fixed private bootstrap.

The inherited pipe is discovery, not authority. No SDK/native grant is produced.
Only the original Popen's kernel peer can finish this one-use exchange.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import select
import socket
import struct
import subprocess
import sys
import tempfile
import time
import weakref

from supplement import DeliveryError

_LOCATOR = 'LOGINOM_PRIVATE_ADMISSION_FD'
_FORMAT = 'multica-private-child-v1'
_deliveries = weakref.WeakKeyDictionary()


def _bytes(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def _pairs(rows):
    result = {}
    for key, value in rows:
        if key in result:
            raise DeliveryError('Duplicate private delivery field')
        result[key] = value
    return result


def _process(pid):
    # /proc starttime prevents PID reuse; ppid identifies the actual direct child.
    raw = Path('/proc', str(pid), 'stat').read_text()
    fields = raw[raw.rfind(')') + 2:].split()
    return int(fields[1]), int(fields[19]), os.stat('/proc/' + str(pid)).st_uid


class _Delivery:
    def __init__(self, decision):
        module = sys.modules.get(type(decision).__module__)
        if (sys.platform != 'linux' or not hasattr(socket, 'SO_PEERCRED') or
                module is None or Path(module.__file__).resolve() != Path(__file__).with_name('admit.py').resolve() or
                type(decision) is not getattr(module, '_Decision', None)):
            raise DeliveryError('Original private admission decision unavailable')
        if decision._claim in _deliveries or decision._consumed:
            raise DeliveryError('Original private delivery already allocated')
        decision.before_spawn()
        self.decision, self.claim = decision, decision._claim
        self.argv = decision._argv
        self.spec = decision._spec
        self.spec_path, self.spec_bytes = decision._spec_path, decision._spec_bytes
        self.argv_bytes = _bytes(self.argv)
        self.claim_bytes = self.claim.bytes
        self.origin = _bytes(self.claim.record['execution_origin'])
        self.monotonic_deadline = decision._monotonic_deadline
        self.pid = os.getpid()
        self.child = None
        self.identity = None
        self.accepted = False
        self.failure = None
        self.secondaries = []
        self.peer = None
        self.closed = False
        self.bound = False
        self.settling = False
        self.returncode = None
        self.directory = None
        self.listener = None
        self.read_fd = self.write_fd = None
        _deliveries[self.claim] = weakref.ref(self)  # Tombstone: failure never remints.
        try:
            self._guard()
            self.directory = tempfile.TemporaryDirectory(prefix='mcd-')
            os.chmod(self.directory.name, 0o700)
            if Path(self.directory.name).resolve().is_relative_to(Path(decision._spec['cwd']).resolve()):
                raise DeliveryError('Private delivery endpoint is inside business inputs')
            self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.listener.bind(self.directory.name + '/s')
            os.chmod(self.directory.name + '/s', 0o600)
            self.listener.listen(1)
            self.key = os.urandom(32)
            self.read_fd, self.write_fd = os.pipe2(os.O_CLOEXEC)
            bootstrap = _bytes({'format': _FORMAT, 'endpoint': self.directory.name + '/s', 'key': self.key.hex()}) + b'\n'
            if os.write(self.write_fd, bootstrap) != len(bootstrap):
                raise DeliveryError('Private bootstrap write incomplete')
            os.close(self.write_fd)
            self.write_fd = None
            self._guard()
        except BaseException as error:
            try:
                self._dispose()
            except BaseException as secondary:
                error._admission_delivery_disposal_failure = secondary
            raise

    def __copy__(self):
        raise DeliveryError('Original private delivery cannot be copied')

    __deepcopy__ = lambda self, memo: self.__copy__()

    def _guard(self, child=False):
        if self.closed or os.getpid() != self.pid or self.decision._claim is not self.claim:
            raise DeliveryError('Original private delivery owner changed')
        if (self.claim.bytes != self.claim_bytes or self.decision._argv is not self.argv or
                self.decision._spec is not self.spec or self.decision._spec_path is not self.spec_path or
                self.decision._spec_bytes != self.spec_bytes or
                _bytes(self.argv) != self.argv_bytes or self.decision._monotonic_deadline != self.monotonic_deadline or
                _bytes(self.claim.record['execution_origin']) != self.origin):
            raise DeliveryError('Original private delivery binding changed')
        self.decision.before_spawn()  # Original claim, validated inputs, both clocks.
        if child:
            if (self.child is None or tuple(self.child.args) != tuple(self.argv) or
                    self.child.pid != self.identity[0] or self.child.poll() is not None or
                    _process(self.child.pid) != self.identity[1]):
                raise DeliveryError('Original private child changed or exited')

    @property
    def pass_fds(self):
        self._guard()
        if self.bound:
            raise DeliveryError('Original child already bound')
        return (self.read_fd,)

    def locator_env(self, env):
        self._guard()
        if self.bound or _LOCATOR in env:
            raise DeliveryError('Private bootstrap locator conflict')
        return dict(env, **{_LOCATOR: str(self.read_fd)})

    def bind_child(self, child):
        # Retain the actual process before any fallible check so failure can drain it.
        if os.getpid() != self.pid or self.bound or type(child) is not subprocess.Popen:
            raise DeliveryError('Original child binding is single-use')
        self.bound = True
        self.child = child
        try:
            self._guard()
            if not self.decision._consumed or tuple(child.args) != tuple(self.argv):
                raise DeliveryError('Original consumed argv unavailable')
            identity = _process(child.pid)
            if identity[0] != self.pid or identity[2] != os.getuid():
                raise DeliveryError('Original direct child unavailable')
            self.identity = child.pid, identity
            self._guard(child=True)
        finally:
            if self.read_fd is not None:
                os.close(self.read_fd)
                self.read_fd = None

    def _remember(self, error):
        if self.failure is None:
            self.failure = error
        else:
            self.secondaries.append(error)  # Equal identity/value is still an event.

    def _ready(self, channel):
        while True:
            self._guard(child=True)
            ready, _, _ = select.select([channel], [], [], min(0.05, max(0, (self.monotonic_deadline - time.monotonic_ns()) / 1e9)))
            self._guard(child=True)
            if ready:
                return

    def _receive(self):
        data = bytearray()
        while not data.endswith(b'\n'):
            self._ready(self.peer)
            chunk = self.peer.recv(1)
            if not chunk:
                raise DeliveryError('Original private child response lost')
            data.extend(chunk)
            if len(data) > 65536:
                raise DeliveryError('Private child frame too large')
        self._guard(child=True)
        return json.loads(data, object_pairs_hook=_pairs)

    def _send(self, frame):
        self._guard(child=True)
        self.peer.settimeout(max(0.001, (self.monotonic_deadline - time.monotonic_ns()) / 1e9))
        self.peer.sendall(_bytes(frame) + b'\n')
        self._guard(child=True)

    def _mac(self, stage, transcript):
        return hmac.new(self.key, stage.encode() + b'\0' + _bytes(transcript), hashlib.sha256).hexdigest()

    def _exchange(self):
        self._ready(self.listener)
        self.peer, _ = self.listener.accept()
        self._guard(child=True)
        pid, uid, _ = struct.unpack('3i', self.peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        if pid != self.child.pid or uid != os.getuid() or _process(pid) != self.identity[1]:
            raise DeliveryError('Foreign private child peer')
        hello = self._receive()
        if set(hello) != {'format', 'nonce'} or hello['format'] != _FORMAT or not isinstance(hello['nonce'], str) or len(hello['nonce']) != 64 or any(c not in '0123456789abcdef' for c in hello['nonce']):
            raise DeliveryError('Private child hello unavailable')
        transcript = {'format': _FORMAT, 'client_nonce': hello['nonce'], 'parent_nonce': os.urandom(32).hex(),
                      'origin_json': self.origin.decode('ascii'),
                      'deadline_unix_ns': str(json.loads(self.origin)['deadline_unix_ns']),
                      'argv_sha256': hashlib.sha256(self.argv_bytes).hexdigest()}
        self._send({'transcript': transcript, 'mac': self._mac('challenge', transcript)})
        response = self._receive()
        if set(response) != {'mac'} or not isinstance(response['mac'], str) or not hmac.compare_digest(response['mac'], self._mac('response', transcript)):
            raise DeliveryError('Original child challenge refused')
        self._send({'stage': 'grant', 'mac': self._mac('grant', transcript)})
        ack = self._receive()
        if set(ack) != {'mac'} or not isinstance(ack['mac'], str) or not hmac.compare_digest(ack['mac'], self._mac('ack', transcript)):
            raise DeliveryError('Original child ACK unavailable')
        self._guard(child=True)
        self._send({'stage': 'accepted', 'mac': self._mac('accepted', transcript)})
        self.accepted = True  # Delivery only; never native/SDK cleanup authority.

    def settle_child(self, child):
        if os.getpid() != self.pid or child is not self.child or self.settling:
            raise DeliveryError('Original child settlement is single-use')
        self.settling = True
        try:
            self._exchange()
            # ACK has settled the bootstrap exchange. EOF is only channel
            # disposal: it cannot prove process exit or mint another admission.
            # Continue guarding/draining the same process. Extra bytes are replay.
            eof = False
            while child.poll() is None:
                self._guard()
                if child.poll() is None and _process(child.pid) != self.identity[1]:
                    raise DeliveryError('Original private child changed')
                ready, _, _ = select.select([] if eof else [self.peer], [], [], 0.05)
                if ready:
                    data = self.peer.recv(1)
                    if data:
                        raise DeliveryError('Original child channel replay')
                    eof = True
            self._guard()
            self.returncode = child.wait()
        except BaseException as error:
            self._remember(error)
            self._shutdown()
            # Fixed bootstrap must exit normally on refusal/EOF. Never kill/retry.
            self._drain()
        if self.failure is not None:
            self.failure._admission_delivery_failures = tuple(self.secondaries)
            raise self.failure
        return self.returncode

    def _shutdown(self):
        for name in ('peer', 'listener'):
            channel = getattr(self, name)
            if channel is not None:
                try:
                    channel.close()
                except OSError as error:
                    self._remember(error)
                setattr(self, name, None)

    def _drain(self):
        # Even an interrupted wait is not exit proof. Keep the original process
        # and custody until ordinary wait completes; never kill or spawn again.
        while self.returncode is None:
            try:
                self.returncode = self.child.wait()
            except BaseException as error:
                self._remember(error)

    def _dispose(self):
        self._shutdown()
        for name in ('read_fd', 'write_fd'):
            fd = getattr(self, name)
            if fd is not None:
                os.close(fd)
                setattr(self, name, None)
        if self.directory is not None:
            self.directory.cleanup()
        self.key = b''
        self.closed = True

    def __enter__(self):
        try:
            self._guard()
        except BaseException as error:
            try:
                self._dispose()
            except BaseException as secondary:
                error._admission_delivery_disposal_failure = secondary
            raise
        return self

    def __exit__(self, kind, error, trace):
        # A bind/handshake exception cannot orphan the process or hide first cause.
        if os.getpid() != self.pid:
            raise DeliveryError('Original private delivery creator process changed')
        failure_before_exit = self.failure
        if error is not None and self.failure is None:
            self._remember(error)
        try:
            if self.child is not None and self.returncode is None:
                self._shutdown()
                self._drain()
        finally:
            try:
                self._dispose()
            except BaseException as secondary:
                if self.failure is None:
                    raise
                self._remember(secondary)
                self.failure._admission_delivery_disposal_failure = secondary
        if self.failure is not None:
            self.failure._admission_delivery_failures = tuple(self.secondaries)
            if error is None and failure_before_exit is None:
                raise self.failure
        return False


def private_child_delivery(decision):
    return _Delivery(decision)
