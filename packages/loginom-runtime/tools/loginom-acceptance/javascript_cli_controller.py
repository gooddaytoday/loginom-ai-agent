"""Original Linux launch handles for normal standalone and path-only cold work.

The collector drains stdout/stderr through the existing redactor before writing
evidence and controls only this original CLI root through its PID-fd on expiry.
Launch/process receipts are not a whole JavaScript acceptance PASS.
"""
import copy
import json
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
        self.reader_files = None
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
        members = self.owner.observe()
        for row in members:
            try:
                arguments = Path('/proc',str(row['pid']),'cmdline').read_bytes().decode('utf-8').split('\0')
                names = [name for name,path in self.entries.items() if path in arguments]
                if not names:continue
                self.verify_executable(row['pid'],self.node)
                current = linux_process(row['pid'])
                if current is None or current['start_ticks'] != row['start_ticks']:continue
                for name in names:self.bindings[(name,row['pid'],row['start_ticks'])] = dict(role=name,**row)
            except (FileNotFoundError,ProcessLookupError):continue
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
        if self.reader_files is not None:
            try:unchanged = all(path.is_file() and file_sha256(path) == digest for path,digest in self.reader_files)
            except OSError:unchanged = False
            if not unchanged:
                self.failures.add('cli_controller_cold_reader_changed_after_launch')
        self.result = dict(version=1,passed=not self.failures,failures=sorted(self.failures),kind=self.kind,
            scope='original_launch_executable_and_owned_linux_processes',submitted_at=self.submitted_at,
            deadline_at=self.deadline_at,finished_at=time.time_ns()//1000000,launch=copy.deepcopy(self.launch),
            processes=process,source_process_bindings=sorted(self.bindings.values(),key=lambda r:(r['role'],r['pid'],r['start_ticks'])),
            native_package_cleanup_verified=False,runtime_ack_verified=False,model_delivery_verified=False,
            cold_persistence_verified=False,cli_acceptance_verified=False)
        return copy.deepcopy(self.result)

    def collect(self,capture,*,cleanup_wait_ms=90000):
        """Use this original handle; source capture cannot replace native proof."""
        from javascript_cli_capture import collect_cli_process
        return collect_cli_process(self,capture,cleanup_wait_ms=cleanup_wait_ms)

    def create_capture(self,directory,worker):
        """Pin the redactor/Node to this candidate, credentials to this profile."""
        if (self.result is not None or self.kind!='cli' or self.candidate is None
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
        return RedactedCliCapture(directory,node=self.node,worker=worker,
            redactor=dict(path=str(redactor),sha256=file_sha256(redactor)),
            known_values=known_cli_secrets(self.owner.profile))

    @classmethod
    def launch_cli(cls,candidate,pins,profile,directory,files,prompt,*,environment):
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
        argv = [str(executable),'run','--no-headless','--format','json','--model','openai/gpt-6-sol',
            '--variant','low','--dir',str(directory),*[part for path in attachments for part in ('--file',str(path))],
            '--',prompt]
        submitted_at = time.time_ns()//1000000
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
            prompt_sha256=value_digest(prompt),model='openai/gpt-6-sol',variant='low',headed=True,transport='normal_standalone_run')
        return controller

    @classmethod
    def launch_cold(cls,writer,cleanup,reader_files,config,profile,evidence,*,environment):
        """Gate the separate exact-path reader on original writer and native Close."""
        if (not isinstance(writer,cls) or writer.kind != 'cli' or writer.candidate is None
                or writer.launch.get('transport') != 'normal_standalone_run'
                or writer.launch.get('profile') != str(writer.owner.profile)):
            raise ValueError('cli_controller_original_writer_required')
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
        config,profile,evidence = Path(config),absolute_directory(profile),absolute_directory(evidence)
        if (not config.is_absolute() or config.resolve() != config or not config.is_file()
                or config.is_symlink() or config.stat().st_mode & 0o077
                or list(profile.iterdir()) or list(evidence.iterdir())
                or profile.is_relative_to(evidence) or evidence.is_relative_to(profile)
                or any(path.is_relative_to(parent) or parent.is_relative_to(path) for path in (profile,evidence)
                    for parent in (candidate,writer.owner.profile))):
            raise ValueError('cli_controller_cold_isolation')
        frozen = [(Path(item['path']),item['sha256']) for item in reader_files]
        if (not frozen or len({path for path,digest in frozen}) != len(frozen)
                or any(not path.is_absolute() or path.resolve() != path or not path.is_file() or path.is_symlink()
                    or file_sha256(path) != digest for path,digest in frozen)):
            raise ValueError('cli_controller_frozen_cold_reader_required')
        entry = frozen[0][0]
        if entry.name != 'javascript-persistence-read-live.mjs':raise ValueError('cli_controller_path_only_reader')
        private = json.loads(config.read_text())
        if private.get('url') != 'http://logi-test-plan.bg.local/app/' or private.get('username') != cleanup['expected']['account']:
            raise ValueError('cli_controller_cold_target_or_account')
        if not (environment.get('DISPLAY') or environment.get('WAYLAND_DISPLAY')):
            raise ValueError('cli_controller_graphical_session_required')
        resource = candidate/'resources/loginom'
        manifest = json.loads((resource/'resource-manifest.json').read_text())
        node = dict(path=str(resource/manifest['node']),sha256=pins['node_sha256'])
        browser = dict(path=str(resource/manifest['browser']),sha256=pins['browser_sha256'])
        argv = [node['path'],str(entry),'--config',str(config),'--profile',str(profile),
            '--browser',browser['path'],'--evidence',str(evidence),'--package',native['package_path']]
        submitted_at = time.time_ns()//1000000
        process = subprocess.Popen(argv,cwd=evidence,env=environment,stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        try:controller = cls(process,profile,executable=node,browser=browser,kind='cold')
        except Exception:raise JavascriptLaunchUnconfirmed(process) from None
        controller.submitted_at,controller.deadline_at = submitted_at,submitted_at+600000
        controller.candidate = (candidate,copy.deepcopy(pins))
        controller.reader_files = frozen
        controller.launch = dict(candidate=str(candidate),profile=str(profile),evidence=str(evidence),
            package_path=native['package_path'],writer_pid=writer.process.pid,headed=True,transport='separate_path_only_reader')
        return controller


class JavascriptLaunchUnconfirmed(RuntimeError):
    def __init__(self,process):
        super().__init__('cli_controller_launch_observation_unconfirmed')
        self.process = process
