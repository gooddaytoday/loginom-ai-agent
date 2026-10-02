"""Original Linux launch handles for normal standalone and path-only cold work.

The collector drains stdout/stderr through the existing redactor before writing
evidence and controls only this original CLI root through its PID-fd on expiry.
Launch/process receipts are not a whole JavaScript acceptance PASS.
"""
import copy
import json
import os
from pathlib import Path
import subprocess
import time
from javascript_cli_candidate import file_sha256,verify_cli_candidate
from javascript_cli_cleanup import native_time,verify_cli_package_cleanup
from javascript_cli_evidence import read_cli_session,value_digest,verify_cli_delivery
from javascript_cli_processes import LinuxProcessOwner,linux_process,linux_executable


def absolute_directory(value):
    path = Path(value)
    if not path.is_absolute() or path.resolve() != path or not path.is_dir():
        raise ValueError('cli_controller_canonical_directory_required')
    return path


def cold_launch_inputs(config,profile,evidence,account):
    """The operator creates evidence and requires an adjacent assignment."""
    config,profile,evidence=Path(config),absolute_directory(profile),Path(evidence)
    assignment=config.with_name('assignment.json')
    for path in (config,assignment):
        if (not path.is_absolute() or path.resolve()!=path or not path.is_file() or path.is_symlink()
                or path.stat().st_uid!=os.getuid() or path.stat().st_mode & 0o077):
            raise ValueError('cli_controller_cold_private_configuration')
    if (not evidence.is_absolute() or evidence.resolve()!=evidence or evidence.exists() or evidence.is_symlink()
            or not evidence.parent.is_dir() or evidence.parent.resolve()!=evidence.parent
            or evidence.parent.stat().st_uid!=os.getuid() or evidence.parent.stat().st_mode & 0o077
            or profile.stat().st_uid!=os.getuid() or profile.stat().st_mode & 0o077 or list(profile.iterdir())
            or profile.is_relative_to(evidence) or evidence.is_relative_to(profile)):
        raise ValueError('cli_controller_cold_new_evidence_and_profile')
    private=json.loads(config.read_text())
    assigned=json.loads(assignment.read_text())
    if (account!='jsteach' or private.get('url')!='http://logi-test-plan.bg.local/app/'
            or private.get('username')!=account or not isinstance(private.get('password'),str)
            or assigned.get('campaign_id')!='javascript-20260926-ubuntu'
            or assigned.get('profile')!=str(profile)):
        raise ValueError('cli_controller_cold_target_account_assignment')
    return {name:dict(path=str(path),sha256=file_sha256(path)) for name,path in
        (('config',config),('assignment',assignment))}


def verify_cold_package_path(entry,node,path,environment):
    """Exercise the frozen reader's own admission without any browser launch."""
    result=subprocess.run([node['path'],str(entry),'--check-package',path],env=environment,
        stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=30)
    if result.returncode!=0 or result.stdout!=b'javascript_cold_package_path_admitted\n':
        raise ValueError('cli_controller_cold_package_path_preflight')


class JavascriptProcessController:
    def __init__(self,process,profile,*,executable,browser,kind,node=None,source_entries=()):
        if kind not in ('cli','cold'):raise ValueError('cli_controller_kind')
        self.owner = LinuxProcessOwner(process,profile,browser=browser)
        self.kind,self.process = kind,process
        self.submitted_at = time.time_ns()//1000000
        self.deadline_at = self.submitted_at+(1800000 if kind == 'cli' else 600000)
        self.executable = copy.deepcopy(executable)
        self.node = copy.deepcopy(node)
        if source_entries and node is None:raise ValueError('cli_controller_source_node_pin_required')
        self.entries = {name:str(Path(path).resolve(strict=True)) for name,path in source_entries}
        self.bindings = {}
        self.executables = {}
        self.failures = set()
        self.result = None
        self.candidate = None
        self.reader_freeze = None
        self.native_watch = None
        self.cold_inputs = None
        self.failed_cold_launch = None
        self.lease = None
        self.capture = None
        self.collection = None
        self.launch = {}
        self.verify_executable(process.pid,executable)
        self.sample()

    def verify_executable(self,pid,pin):
        try:self.executables[pid] = linux_executable(pid,pin,self.executables.get(pid))
        except ValueError:raise ValueError('cli_controller_original_executable_pin') from None

    def sample(self):
        if self.result is not None:raise ValueError('cli_controller_already_terminal')
        try:return self._sample()
        except (OSError,ValueError,KeyError,IndexError,UnicodeError):
            self.failures.add('cli_controller_runtime_observation_unconfirmed')
            raise

    def _sample(self):
        if self.lease is not None:self.lease.revalidate()
        members = self.owner.observe()
        for row in members:
            try:
                arguments = Path('/proc',str(row['pid']),'cmdline').read_bytes().decode('utf-8').split('\0')
                names = [name for name,path in self.entries.items() if path in arguments]
                if not names:continue
                self.verify_executable(row['pid'],self.node)
                current = linux_process(row['pid'])
                if current is None or current['start_ticks'] != row['start_ticks']:continue
                cwd=str(Path('/proc',str(row['pid']),'cwd').resolve(strict=True))
                for name in names:self.bindings[(name,row['pid'],row['start_ticks'])] = dict(role=name,cwd=cwd,**row)
            except (FileNotFoundError,ProcessLookupError):continue
        if self.native_watch is not None:self.native_watch.sample()
        return copy.deepcopy(members)

    def finish(self):
        if self.result is not None:return copy.deepcopy(self.result)
        try:self.sample()
        except (OSError,ValueError,KeyError,IndexError,UnicodeError):
            self.failures.add('cli_controller_final_observation_unconfirmed')
        process = self.owner.finish()
        self.failures.update(process['failures'])
        if self.process.poll() is None:self.failures.add('cli_controller_original_handle_not_terminal')
        if self.candidate is not None:
            integrity = verify_cli_candidate(*self.candidate)
            if not integrity['passed']:self.failures.add('cli_controller_candidate_changed_after_launch')
            observed = {row['role'] for row in self.bindings.values()}
            if self.kind == 'cli' and not {'node_host','managed_runtime'} <= observed:
                self.failures.add('cli_controller_required_runtime_process_not_observed')
            if self.kind == 'cold' and 'cold_reader' not in observed:
                self.failures.add('cli_controller_cold_reader_process_not_observed')
        if self.reader_freeze is not None:
            from javascript_cli_reader_freeze import verify_cold_reader
            if self.candidate is None or not verify_cold_reader(self.reader_freeze,*self.candidate)['passed']:
                self.failures.add('cli_controller_cold_reader_freeze_changed_after_launch')
        if self.cold_inputs is not None:
            for pin in self.cold_inputs.values():
                try:
                    path=Path(pin['path'])
                    if (path.resolve()!=path or not path.is_file() or path.is_symlink()
                            or path.stat().st_uid!=os.getuid() or path.stat().st_mode & 0o077
                            or file_sha256(path)!=pin['sha256']):
                        self.failures.add('cli_controller_cold_inputs_changed_after_launch')
                except OSError:self.failures.add('cli_controller_cold_inputs_changed_after_launch')
        self.result = dict(version=1,passed=not self.failures,failures=sorted(self.failures),kind=self.kind,
            scope='original_launch_executable_and_owned_linux_processes',submitted_at=self.submitted_at,
            deadline_at=self.deadline_at,finished_at=time.time_ns()//1000000,launch=copy.deepcopy(self.launch),
            processes=process,source_process_bindings=sorted(self.bindings.values(),key=lambda r:(r['role'],r['pid'],r['start_ticks'])),
            native_package_cleanup_verified=False,runtime_ack_verified=False,model_delivery_verified=False,
            cold_persistence_verified=False,cli_acceptance_verified=False)
        if self.failures and self.native_watch is not None:self.native_watch.close()
        return copy.deepcopy(self.result)

    def collect(self,capture,*,cleanup_wait_ms=90000):
        """Use this original handle; source capture cannot replace native proof."""
        from javascript_cli_capture import RedactedCliCapture
        if not isinstance(capture,RedactedCliCapture) or capture.mode!=self.kind:
            raise ValueError('cli_capture_original_collect_contract')
        # The low-level constructor is also used for inert process fixtures.
        # Candidate factories already bind their capture before collection.
        if self.capture is None and self.candidate is None:self.capture=capture
        if capture is not self.capture:raise ValueError('cli_controller_original_capture_required')
        from javascript_cli_capture import collect_cli_process,collect_cold_process
        collector=collect_cli_process if self.kind=='cli' else collect_cold_process
        self.collection=collector(self,capture,cleanup_wait_ms=cleanup_wait_ms)
        return copy.deepcopy(self.collection)

    def create_capture(self,directory,worker):
        """Pin the redactor/Node to this candidate, credentials to this profile."""
        if (self.result is not None or self.capture is not None or self.kind!='cli' or self.candidate is None
                or self.launch.get('transport')!='normal_standalone_run'
                or self.launch.get('profile')!=str(self.owner.profile)):
            raise ValueError('cli_capture_original_factory_required')
        from javascript_cli_capture import RedactedCliCapture,known_cli_secrets
        candidate,pins=self.candidate
        if not verify_cli_candidate(candidate,pins)['passed']:raise ValueError('cli_capture_candidate_unverified')
        directory=absolute_directory(directory)
        if any(directory.is_relative_to(path) or path.is_relative_to(directory)
                for path in (candidate,self.owner.profile,Path(self.launch['directory']))):
            raise ValueError('cli_capture_evidence_isolation')
        redactor=candidate/'resources/loginom/runtime/client/lib/redact.mjs'
        self.capture=RedactedCliCapture(directory,node=self.node,worker=worker,
            redactor=dict(path=str(redactor),sha256=file_sha256(redactor)),
            known_values=known_cli_secrets(self.owner.profile))
        return self.capture

    def freeze_native(self,events,expected):
        if self.kind!='cli' or self.candidate is None or self.native_watch is None:
            raise ValueError('cli_native_original_factory_required')
        from javascript_cli_native import managed_runtime_pin
        candidate,pins=self.candidate
        if not verify_cli_candidate(candidate,pins)['passed']:raise ValueError('cli_native_candidate_unverified')
        return self.native_watch.freeze(events,expected,managed_runtime_pin(candidate/'resources/loginom/runtime/client'))

    def create_cold_capture(self,directory,worker):
        if (self.result is not None or self.capture is not None or self.kind!='cold' or self.candidate is None
                or self.cold_inputs is None or self.reader_freeze is None
                or self.launch.get('transport')!='separate_path_only_reader'):
            raise ValueError('cold_capture_original_factory_required')
        from javascript_cli_capture import RedactedCliCapture
        from javascript_cli_reader_freeze import verify_cold_reader
        candidate,pins=self.candidate
        if not verify_cold_reader(self.reader_freeze,candidate,pins)['passed']:
            raise ValueError('cold_capture_reader_or_candidate_unverified')
        directory=absolute_directory(directory)
        if any(directory.is_relative_to(path) or path.is_relative_to(directory) for path in
                (candidate,self.owner.profile,Path(self.reader_freeze['root']),Path(self.launch['evidence']))):
            raise ValueError('cold_capture_evidence_isolation')
        config=Path(self.cold_inputs['config']['path'])
        if config.resolve()!=config or file_sha256(config)!=self.cold_inputs['config']['sha256']:
            raise ValueError('cold_capture_configuration_changed')
        private=json.loads(config.read_text())
        redactor=candidate/'resources/loginom/runtime/client/lib/redact.mjs'
        self.capture=RedactedCliCapture(directory,node=self.node,worker=worker,
            redactor=dict(path=str(redactor),sha256=file_sha256(redactor)),known_values=[private['password']],
            mode='cold',expected_report=str(Path(self.launch['evidence'])/'report.json'))
        return self.capture

    @classmethod
    def launch_cli(cls,candidate,pins,profile,directory,files,prompt,*,environment,lease=None):
        """Build the ordinary product argv; no source transport or tool injection."""
        candidate,profile,directory = map(absolute_directory,(candidate,profile,directory))
        if not verify_cli_candidate(candidate,pins)['passed']:raise ValueError('cli_controller_candidate_unverified')
        if (not isinstance(prompt,str) or not prompt or not files or (profile/'.writer').exists()
                or (profile/'.writer').is_symlink()
                or any(a.is_relative_to(b) or b.is_relative_to(a) for a,b in
                    ((candidate,profile),(candidate,directory),(profile,directory)))
                or environment.get('LOGINOM_AI_AGENT_CLI_BUNDLE')):
            raise ValueError('cli_controller_isolation_or_normal_transport')
        attachments = [Path(item['path']) for item in files]
        if (len(set(attachments)) != len(attachments) or set(directory.iterdir()) != set(attachments)
                or any(not path.is_absolute() or path.resolve() != path or path.parent != directory
                    or not path.is_file() or path.is_symlink() or file_sha256(path) != item['sha256']
                    or path.stat().st_size != item['bytes'] for path,item in zip(attachments,files))):
            raise ValueError('cli_controller_original_inputs_or_clean_directory')
        if not (environment.get('DISPLAY') or environment.get('WAYLAND_DISPLAY')):
            raise ValueError('cli_controller_graphical_session_required')
        resource = candidate/'resources/loginom'
        manifest = json.loads((resource/'resource-manifest.json').read_text())
        executable = candidate/'bin/loginom-ai-agent-cli'
        executable_pin = dict(path=str(executable),sha256=file_sha256(executable))
        node = dict(path=str(resource/manifest['node']),sha256=pins['node_sha256'])
        browser = dict(path=str(resource/manifest['browser']),sha256=pins['browser_sha256'])
        argv = [str(executable),'run','--no-headless','--format','json','--model','openai/gpt-6.1-sol',
            '--variant','low','--dir',str(directory),*[part for path in attachments for part in ('--file',str(path))],
            '--',prompt]
        submitted_at = time.time_ns()//1000000
        from javascript_cli_native import NativeJournalWatch,attempt_directories
        before=attempt_directories(profile)
        from javascript_cli_lease import JavascriptAcceptanceLease
        if not isinstance(lease,JavascriptAcceptanceLease):raise ValueError('cli_controller_original_host_lease_required')
        lease.admit('cli',profile,pins)
        process = subprocess.Popen(argv,cwd=directory,env={**environment,'LOGINOM_AI_AGENT_CLI_PROFILE':str(profile)},
            stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        try:
            controller = cls(process,profile,executable=executable_pin,
                browser=browser,kind='cli',node=node,source_entries=(('node_host',resource/'host/node-host.mjs'),
                    ('managed_runtime',resource/'runtime/src/managed-entry.mjs')))
        except Exception:
            # Preserve the original handle for the owner. Do not silently kill a
            # possibly authenticated browser when observation setup fails.
            raise JavascriptLaunchUnconfirmed(process) from None
        controller.submitted_at,controller.deadline_at = submitted_at,submitted_at+1800000
        controller.candidate = (candidate,copy.deepcopy(pins))
        controller.launch = dict(candidate=str(candidate),profile=str(profile),directory=str(directory),
            files=[dict(name=path.name,bytes=item['bytes'],sha256=item['sha256']) for path,item in zip(attachments,files)],
            prompt_sha256=value_digest(prompt),model='openai/gpt-6.1-sol',variant='low',headed=True,transport='normal_standalone_run')
        controller.native_watch=NativeJournalWatch(controller,before)
        controller.lease=lease
        return controller

    @classmethod
    def launch_cold(cls,writer,cleanup,reader,config,profile,evidence,*,environment):
        """Gate the separate exact-path reader on original writer and native Close."""
        if (not isinstance(writer,cls) or writer.kind != 'cli' or writer.candidate is None
                or writer.launch.get('transport') != 'normal_standalone_run'
                or writer.launch.get('profile') != str(writer.owner.profile)):
            raise ValueError('cli_controller_original_writer_required')
        if (writer.native_watch is None or writer.native_watch.result is None
                or not writer.native_watch.result['passed'] or writer.native_watch.sealed is None
                or not writer.native_watch.revalidate()
                or value_digest(writer.native_watch.sealed['events'])!=value_digest(cleanup['native_events'])
                or value_digest(writer.native_watch.sealed['receipt'])!=value_digest(cleanup['receipt'])):
            raise ValueError('cli_controller_sealed_original_native_artifacts_required')
        projection = read_cli_session(writer.owner.profile,cleanup['expected']['cli_session_id'])
        if value_digest(projection) != value_digest(cleanup['projection']):
            raise ValueError('cli_controller_original_writer_sqlite_required')
        delivery = verify_cli_delivery(cleanup['events'],projection,
            [dict(filename=item['name'],bytes=item['bytes'],sha256=item['sha256']) for item in writer.launch['files']],
            submitted_at=writer.submitted_at,deadline_at=writer.deadline_at,directory=writer.launch['directory'])
        if not delivery['passed']:raise ValueError('cli_controller_original_writer_delivery_required')
        native = verify_cli_package_cleanup(**cleanup)
        if not native['passed'] or not writer.finish()['passed']:
            raise ValueError('cli_controller_writer_native_and_process_cleanup_required')
        if not writer.submitted_at <= native_time(cleanup['receipt']['started_at']) <= native_time(
                cleanup['receipt']['completed_at']) <= writer.finish()['finished_at']:
            raise ValueError('cli_controller_native_cleanup_outside_original_attempt')
        candidate,pins = writer.candidate
        if not verify_cli_candidate(candidate,pins)['passed']:raise ValueError('cli_controller_candidate_unverified')
        config,profile,evidence = Path(config),absolute_directory(profile),Path(evidence)
        cold_inputs=cold_launch_inputs(config,profile,evidence,cleanup['expected']['account'])
        if (any(path.is_relative_to(parent) or parent.is_relative_to(path) for path in (profile,evidence,config.parent)
                    for parent in (candidate,writer.owner.profile))):
            raise ValueError('cli_controller_cold_isolation')
        from javascript_cli_reader_freeze import verify_cold_reader
        frozen=verify_cold_reader(reader,candidate,pins)
        if not frozen['passed']:raise ValueError('cli_controller_complete_frozen_cold_reader_required')
        entry=Path(frozen['entry'])
        reader_root=Path(reader['root'])
        if any(reader_root.is_relative_to(parent) or parent.is_relative_to(reader_root)
                for parent in (profile,evidence,writer.owner.profile,Path(writer.launch['directory']))):
            raise ValueError('cli_controller_cold_reader_isolation')
        if not (environment.get('DISPLAY') or environment.get('WAYLAND_DISPLAY')):
            raise ValueError('cli_controller_graphical_session_required')
        resource = candidate/'resources/loginom'
        manifest = json.loads((resource/'resource-manifest.json').read_text())
        node = dict(path=str(resource/manifest['node']),sha256=pins['node_sha256'])
        browser = dict(path=str(resource/manifest['browser']),sha256=pins['browser_sha256'])
        verify_cold_package_path(entry,node,native['package_path'],environment)
        argv = [node['path'],str(entry),'--config',str(config),'--profile',str(profile),
            '--browser',browser['path'],'--evidence',str(evidence),'--package',native['package_path']]
        from javascript_cli_lease import JavascriptAcceptanceLease
        if not isinstance(writer.lease,JavascriptAcceptanceLease):raise ValueError('cli_controller_original_host_lease_required')
        writer.lease.admit('cold',profile,pins)
        submitted_at = time.time_ns()//1000000
        process = subprocess.Popen(argv,cwd=evidence.parent,env=environment,stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        try:controller = cls(process,profile,executable=node,browser=browser,kind='cold',node=node,
            source_entries=(('cold_reader',entry),))
        except Exception as error:
            # Retain the original handle on its writer even if a caller's generic
            # error handler drops the exception. Never retry or kill it here.
            writer.failed_cold_launch=JavascriptLaunchUnconfirmed(process)
            raise writer.failed_cold_launch from error
        controller.submitted_at,controller.deadline_at = submitted_at,submitted_at+600000
        controller.candidate = (candidate,copy.deepcopy(pins))
        controller.reader_freeze = copy.deepcopy(reader)
        controller.cold_inputs = cold_inputs
        controller.lease=writer.lease
        controller.launch = dict(candidate=str(candidate),profile=str(profile),evidence=str(evidence),
            package_path=native['package_path'],writer_pid=writer.process.pid,reader=copy.deepcopy(reader),
            inputs=copy.deepcopy(cold_inputs),
            headed=True,transport='separate_path_only_reader')
        return controller


class JavascriptLaunchUnconfirmed(RuntimeError):
    def __init__(self,process):
        super().__init__('cli_controller_launch_observation_unconfirmed')
        self.process = process
