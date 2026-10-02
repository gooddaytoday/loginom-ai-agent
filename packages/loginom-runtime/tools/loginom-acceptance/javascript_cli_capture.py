"""Bounded private-pipe redaction and original-handle deadline collection.

No raw stdout/stderr dump, DB export, browser action, process-group kill or retry.
Native/model/whole acceptance remains the responsibility of the outer auditor.
"""
import copy
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import time
from javascript_cli_candidate import file_sha256
from javascript_cli_controller import JavascriptProcessController,absolute_directory
from javascript_cli_processes import linux_process
from javascript_cli_evidence import terminal_tool,value_digest


def known_cli_secrets(profile):
    """Read only this Linux CLI profile's credential fields, never export them."""
    profile=absolute_directory(profile)
    paths=[profile/'data/auth.json',profile/'loginom/connection/connection.json']
    values=[]
    for path in paths:
        if (not path.is_file() or path.resolve()!=path or path.is_symlink()
                or path.stat().st_uid!=os.getuid() or path.stat().st_mode & 0o077):
            raise ValueError('cli_capture_own_private_credentials_required')
        value=json.loads(path.read_text())
        if path==paths[0]:
            if not isinstance(value,dict):raise ValueError('cli_capture_auth_shape')
            for provider in value.values():
                if not isinstance(provider,dict):raise ValueError('cli_capture_auth_shape')
                values.extend(provider.get(name) for name in ('access','refresh','key','accountId'))
        if path==paths[1]:
            if not isinstance(value,dict):raise ValueError('cli_capture_linux_cli_credentials_required')
            secret=value.get('secrets')
            if (not isinstance(secret,dict) or secret.get('format')!='loginom-cli-secrets-v1'
                    or secret.get('protection')!='plaintext' or not isinstance(secret.get('payload'),str)):
                raise ValueError('cli_capture_linux_cli_credentials_required')
            secret=json.loads(secret['payload'])
            if not isinstance(secret,dict) or any(not isinstance(secret.get(k),str) for k in ('apiKey','password')):
                raise ValueError('cli_capture_linux_cli_credentials_required')
            values.extend(secret[k] for k in ('apiKey','password'))
    return sorted({value for value in values if isinstance(value,str) and value})


class RedactedCliCapture:
    def __init__(self,directory,*,node,worker,redactor,known_values,mode='cli',expected_report=None):
        if (mode not in ('cli','cold') or (mode=='cli' and expected_report is not None)
                or (mode=='cold' and (not isinstance(expected_report,str)
                    or not Path(expected_report).is_absolute() or Path(expected_report).resolve()!=Path(expected_report)
                    or Path(expected_report).name!='report.json'))):
            raise ValueError('cli_capture_stream_mode')
        self.mode,self.expected_report=mode,expected_report
        self.output_file='events.jsonl' if mode=='cli' else 'cold-summary.jsonl'
        self.directory=absolute_directory(directory)
        if self.directory.stat().st_uid!=os.getuid() or self.directory.stat().st_mode & 0o077:
            raise ValueError('cli_capture_private_directory_required')
        self.directory_identity=(self.directory.stat().st_dev,self.directory.stat().st_ino)
        self.pins=copy.deepcopy(dict(node=node,worker=worker,redactor=redactor))
        for pin in (node,worker,redactor):
            path=Path(pin['path'])
            if not path.is_absolute() or path.resolve()!=path or not path.is_file() or file_sha256(path)!=pin['sha256']:
                raise ValueError('cli_capture_pinned_source_required')
        self.worker=subprocess.Popen([node['path'],worker['path']],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,start_new_session=True)
        os.set_blocking(self.worker.stdin.fileno(),False)
        os.set_blocking(self.worker.stdout.fileno(),False)
        self.pending=bytearray()
        self.buffers={name:bytearray() for name in ('stdout','stderr')}
        self.discard={name:False for name in self.buffers}
        self.counts=dict(event=0,error=0,omitted=0)
        self.failures=set()
        self.result=None
        self.transport_failed=False
        self.streams={}
        self.file_identities={}
        try:
            reply=self.exchange(dict(kind='initialize',module=redactor,known_values=known_values,mode=mode))
            if reply!={'kind':'ready','version':1}:raise ValueError('cli_capture_worker_ready_required')
            for name in (self.output_file,'stderr.txt','capture-omissions.jsonl'):
                descriptor=os.open(self.directory/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
                self.streams[name]=os.fdopen(descriptor,'w',encoding='utf-8')
                stat=os.fstat(self.streams[name].fileno())
                self.file_identities[name]=(stat.st_dev,stat.st_ino)
        except Exception:
            self.failures.add('cli_capture_initialization_unconfirmed')
            self.close_worker()
            for stream in self.streams.values():stream.close()
            raise ValueError('cli_capture_initialization_unconfirmed') from None

    def exchange(self,value):
        payload=(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode('utf-8')
        if len(payload)>8*1024*1024:raise ValueError('cli_capture_private_wire_limit')
        deadline=time.monotonic()+5
        sent=0
        with selectors.DefaultSelector() as selector:
            selector.register(self.worker.stdin,selectors.EVENT_WRITE)
            selector.register(self.worker.stdout,selectors.EVENT_READ)
            while True:
                remaining=deadline-time.monotonic()
                if remaining<=0:raise ValueError('cli_capture_worker_reply_timeout')
                for key,events in selector.select(remaining):
                    if key.fileobj is self.worker.stdin:
                        sent+=os.write(key.fd,payload[sent:])
                        if sent==len(payload):selector.unregister(self.worker.stdin)
                    if key.fileobj is self.worker.stdout:
                        chunk=os.read(key.fd,65536)
                        if not chunk:raise ValueError('cli_capture_worker_reply_missing')
                        self.pending.extend(chunk)
                        if len(self.pending)>8*1024*1024:raise ValueError('cli_capture_worker_reply_limit')
                        end=self.pending.find(b'\n')
                        if end>=0:
                            line=bytes(self.pending[:end]);del self.pending[:end+1]
                            if sent!=len(payload) or self.pending:raise ValueError('cli_capture_worker_unsolicited_reply')
                            reply=json.loads(line)
                            if not isinstance(reply,dict):raise ValueError('cli_capture_worker_reply_shape')
                            return reply

    def omit(self,source,reason,*,expected=False):
        self.streams['capture-omissions.jsonl'].write(json.dumps(dict(source=source,reason=reason,
            expected=expected,observed_at_ms=time.time_ns()//1000000))+'\n')
        self.streams['capture-omissions.jsonl'].flush()
        if not expected:self.failures.add('cli_capture_unconfirmed_line')

    def line(self,source,value):
        if self.result is not None:raise ValueError('cli_capture_already_terminal')
        if self.transport_failed:
            self.omit(source,'redaction_transport_unconfirmed');return
        try:
            text=value.decode('utf-8').removesuffix('\r')
        except UnicodeError:
            self.omit(source,'invalid_utf8');return
        original=None
        if self.mode=='cli' and source=='stdout':
            try:
                event=json.loads(text)
                if isinstance(event,dict) and '_capture_terminal' in event:
                    raise ValueError('reserved_capture_binding')
                if isinstance(event,dict) and event.get('type')=='tool_use':
                    original=value_digest(terminal_tool(event['part']))
            except (KeyError,TypeError,ValueError):
                self.omit(source,'invalid_terminal_or_reserved_binding');return
        try:reply=self.exchange(dict(kind=source,line=text))
        except (OSError,ValueError,UnicodeError):
            self.transport_failed=True
            self.failures.add('cli_capture_redaction_transport_unconfirmed')
            self.omit(source,'redaction_transport_unconfirmed');return
        kind=reply.get('kind')
        if kind=='event' and source=='stdout' and isinstance(reply.get('value'),dict):
            if self.mode=='cold' and (self.counts[kind]!=0 or reply['value'].get('report')!=self.expected_report):
                self.omit(source,'cold_duplicate_or_foreign_report');return
            if self.mode=='cli' and reply['value'].get('type')=='tool_use':
                if original is None:
                    self.omit(source,'terminal_binding_missing');return
                # Only digests cross the private pipe boundary. The original
                # response (including credentials) is never written to disk.
                reply['value']['_capture_terminal']=dict(version=1,original_sha256=original,
                    redacted_event_sha256=value_digest(reply['value']))
            self.counts[kind]+=1
            self.streams[self.output_file].write(json.dumps(reply['value'],ensure_ascii=False,allow_nan=False)+'\n')
            self.streams[self.output_file].flush();return
        if kind=='error' and source=='stderr' and isinstance(reply.get('line'),str):
            self.counts[kind]+=1
            self.streams['stderr.txt'].write(reply['line']+'\n');self.streams['stderr.txt'].flush();return
        if kind=='omitted' and reply.get('reason') in ('stdout_invalid_json','stdout_unknown_event',
                'non_public_stdout','non_public_stderr','redaction_failed','cold_unknown_summary') and type(reply.get('expected')) is bool:
            self.counts[kind]+=1
            self.omit(source,reply['reason'],expected=reply['expected']);return
        self.failures.add('cli_capture_worker_untrusted_reply')
        self.omit(source,'worker_untrusted_reply')

    def push(self,source,chunk):
        if self.result is not None:raise ValueError('cli_capture_already_terminal')
        if source not in self.buffers or not isinstance(chunk,bytes):raise ValueError('cli_capture_stream_chunk')
        boundaries=chunk.count(b'\n')
        for index,piece in enumerate(chunk.split(b'\n')):
            if not self.discard[source]:
                if len(self.buffers[source])+len(piece)>1048576:
                    self.buffers[source].clear();self.discard[source]=True
                    self.omit(source,'line_limit_exceeded')
                else:self.buffers[source].extend(piece)
            if index<boundaries:
                if not self.discard[source]:self.line(source,bytes(self.buffers[source]))
                self.buffers[source].clear();self.discard[source]=False

    def end(self,source):
        if self.result is not None:raise ValueError('cli_capture_already_terminal')
        if source not in self.buffers:raise ValueError('cli_capture_stream_chunk')
        if self.buffers[source] and not self.discard[source]:self.line(source,bytes(self.buffers[source]))
        self.buffers[source].clear();self.discard[source]=False

    def close_worker(self):
        if self.worker.stdin is not None:self.worker.stdin.close()
        try:self.worker.wait(timeout=5)
        except subprocess.TimeoutExpired:
            # Only the private redactor, which cannot own Loginom/browser work.
            self.worker.kill();self.worker.wait(timeout=5)
            self.failures.add('cli_capture_worker_forced_exit')
        if self.worker.stdout is not None:self.worker.stdout.close()

    def finish(self):
        if self.result is not None:return copy.deepcopy(self.result)
        for source in self.buffers:self.end(source)
        if self.mode=='cold' and self.counts['event']!=1:self.failures.add('cold_capture_exact_summary_required')
        try:
            if self.transport_failed:raise ValueError('cli_capture_worker_transport_failed')
            reply=self.exchange(dict(kind='close'))
            if reply!=dict(kind='closed',version=1,counts=self.counts,private_key_block_closed=True):
                self.failures.add('cli_capture_worker_close_ack_unconfirmed')
        except (OSError,ValueError,UnicodeError):self.failures.add('cli_capture_worker_close_ack_unconfirmed')
        self.close_worker()
        if self.worker.returncode!=0:self.failures.add('cli_capture_worker_unclean_exit')
        for stream in self.streams.values():stream.close()
        files=[]
        try:
            stat=self.directory.stat()
            if (self.directory.resolve()!=self.directory or stat.st_uid!=os.getuid() or stat.st_mode & 0o077
                    or (stat.st_dev,stat.st_ino)!=self.directory_identity):
                raise ValueError('cli_capture_final_directory_identity')
            for name in self.streams:
                path=self.directory/name
                stat=path.stat()
                if (path.resolve()!=path or not path.is_file() or path.is_symlink()
                        or stat.st_uid!=os.getuid() or stat.st_mode & 0o077
                        or (stat.st_dev,stat.st_ino)!=self.file_identities[name]):
                    raise ValueError('cli_capture_final_file_identity')
                files.append(dict(name=name,bytes=stat.st_size,sha256=file_sha256(path)))
            if any(Path(pin['path']).resolve()!=Path(pin['path'])
                    or file_sha256(Path(pin['path']))!=pin['sha256'] for pin in self.pins.values()):
                raise ValueError('cli_capture_changed_sources')
        except (OSError,ValueError):self.failures.add('cli_capture_final_integrity_unconfirmed')
        self.result=dict(version=1,passed=not self.failures,failures=sorted(self.failures),counts=copy.deepcopy(self.counts),
            worker_returncode=self.worker.returncode,files=files,sources=copy.deepcopy(self.pins),
            scope='bounded_filtered_redacted_stream_capture',mode=self.mode,
            native_journal_authenticated=False,model_delivery_verified=False,cli_acceptance_verified=False)
        return copy.deepcopy(self.result)


def collect_cli_process(controller,capture,*,cleanup_wait_ms=90000):
    if (not isinstance(controller,JavascriptProcessController) or not isinstance(capture,RedactedCliCapture)
            or controller.kind!='cli' or capture.mode!='cli'):
        raise ValueError('cli_capture_original_collect_contract')
    return collect_original_process(controller,capture,cleanup_wait_ms=cleanup_wait_ms)


def collect_cold_process(controller,capture,*,cleanup_wait_ms=90000):
    if (not isinstance(controller,JavascriptProcessController) or not isinstance(capture,RedactedCliCapture)
            or controller.kind!='cold' or capture.mode!='cold'):
        raise ValueError('cold_capture_original_collect_contract')
    return collect_original_process(controller,capture,cleanup_wait_ms=cleanup_wait_ms)


def collect_original_process(controller,capture,*,cleanup_wait_ms):
    """Drain original streams; deadline SIGINT, then bounded own-root recovery."""
    if (not isinstance(controller,JavascriptProcessController) or not isinstance(capture,RedactedCliCapture)
            or controller.kind!=capture.mode or type(cleanup_wait_ms) is not int or not 0<cleanup_wait_ms<=90000
            or controller.result is not None or capture.result is not None
            or any(stream is None for stream in (controller.process.stdout,controller.process.stderr))):
        raise ValueError('cli_capture_original_collect_contract')
    identity=linux_process(controller.process.pid)
    if identity is not None and any(identity[k]!=controller.owner.root[k] for k in ('pid','start_ticks','uid')):
        raise ValueError('cli_capture_original_process_identity')
    descriptor=None
    if controller.process.poll() is None:
        try:descriptor=os.pidfd_open(controller.process.pid)
        except ProcessLookupError:
            if controller.process.poll() is None:raise ValueError('cli_capture_original_process_identity') from None
    failed=set()
    control=[]
    expired=False
    forced=False
    until=None
    drain_until=None
    deadline_due=time.monotonic()+max(0,(controller.deadline_at-time.time_ns()//1000000)/1000)
    with selectors.DefaultSelector() as selector:
        try:
            for source,stream in (('stdout',controller.process.stdout),('stderr',controller.process.stderr)):
                os.set_blocking(stream.fileno(),False)
                selector.register(stream,selectors.EVENT_READ,source)
            while selector.get_map() or controller.process.poll() is None:
                now=time.time_ns()//1000000
                if (now>=controller.deadline_at or time.monotonic()>=deadline_due) and not expired:
                    expired=True;until=time.monotonic()+cleanup_wait_ms/1000
                    failed.add('cli_capture_original_deadline_expired')
                    if descriptor is not None and controller.process.poll() is None:
                        outcome='delivered'
                        try:signal.pidfd_send_signal(descriptor,signal.SIGINT)
                        except ProcessLookupError:outcome='already_exited'
                        except OSError:
                            outcome='unconfirmed';failed.add('cli_capture_original_signal_unconfirmed')
                        control.append(dict(signal='SIGINT',reason='original_deadline',at_ms=now,
                            pid=controller.process.pid,outcome=outcome))
                if expired and until is not None and time.monotonic()>=until:
                    if not forced and controller.process.poll() is None:
                        forced=True
                        outcome='unconfirmed'
                        if descriptor is not None:
                            outcome='delivered'
                            try:signal.pidfd_send_signal(descriptor,signal.SIGTERM)
                            except ProcessLookupError:outcome='already_exited'
                            except OSError:failed.add('cli_capture_original_signal_unconfirmed')
                        control.append(dict(signal='SIGTERM',reason='cleanup_grace_expired',at_ms=now,
                            pid=controller.process.pid,outcome=outcome))
                        failed.add('cli_capture_forced_root_termination');until=time.monotonic()+5
                    else:
                        failed.add('cli_capture_original_stream_or_process_unsettled');break
                try:controller.sample()
                except (OSError,ValueError,KeyError,IndexError,UnicodeError):failed.add('cli_capture_process_observation_unconfirmed')
                for key,events in selector.select(.1):
                    try:chunk=os.read(key.fd,65536)
                    except BlockingIOError:continue
                    if chunk:capture.push(key.data,chunk)
                    if not chunk:
                        capture.end(key.data);selector.unregister(key.fileobj);key.fileobj.close()
                # A surviving child can retain pipes after a clean root exit.
                if controller.process.poll() is not None and selector.get_map():
                    if drain_until is None:drain_until=time.monotonic()+5
                    if time.monotonic()>=drain_until:
                        failed.add('cli_capture_original_stream_or_process_unsettled');break
        except (OSError,ValueError,KeyError,IndexError,UnicodeError):
            failed.add('cli_capture_original_collection_unconfirmed')
        finally:
            for key in list(selector.get_map().values()):
                selector.unregister(key.fileobj);key.fileobj.close()
            if descriptor is not None:os.close(descriptor)
    streams=capture.finish()
    failed.update(streams['failures'])
    # A later clean finish or cold factory cannot forget this original failure.
    controller.failures.update(failed)
    process=controller.finish()
    failed.update(process['failures'])
    return dict(version=1,passed=not failed,failures=sorted(failed),process=process,capture=streams,control=control,
        original_deadline_expired=expired,forced_root_termination=forced,
        scope='original_handle_bounded_deadline_and_redacted_streams',native_cleanup_verified=False,
        model_delivery_verified=False,cold_persistence_verified=False,cli_acceptance_verified=False)
