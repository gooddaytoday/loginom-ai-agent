"""Observe and seal this original CLI's append-only managed native artifacts.

Ownership is an observed process/profile/path binding, not a cryptographic claim
about arbitrary same-UID writers. The outer auditor still verifies all semantics.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import time
from javascript_cli_candidate import file_sha256
from javascript_cli_cleanup import native_time
from javascript_cli_evidence import loginom_runtime_url_matches


def managed_runtime_pin(client):
    """Independent byte algorithm; parity-tested against createRuntimeSourcePin."""
    client=Path(client)
    lib=client/'lib'
    paths=['../.node-version','../package.json','../package-lock.json']
    for path in lib.rglob('*'):
        if path.is_symlink():raise ValueError('cli_native_runtime_pin_symlink')
        if path.is_file() and (path.suffix=='.mjs' or path.name.endswith('.d.ts')):
            paths.append('./'+path.relative_to(lib).as_posix())
    digest=hashlib.sha256()
    records=[]
    for name in sorted(paths):
        content=(lib/name).read_bytes()
        digest.update(name.encode()+b'\0'+content)
        records.append(dict(path=name,sha256=hashlib.sha256(content).hexdigest()))
    return dict(revision=digest.hexdigest(),manifest=records)


def attempt_directories(profile):
    root=Path(profile)/'loginom/runtime'
    if not root.exists():return set()
    if root.resolve()!=root or not root.is_dir():raise ValueError('cli_native_runtime_root')
    return {str(path) for path in root.glob('generations/*/chats/*/attempts/*') if path.is_dir()}


class NativeJournalWatch:
    def __init__(self,controller,before):
        self.controller=controller
        self.root=controller.owner.profile/'loginom/runtime'
        self.before=set(before)
        self.files={}
        self.failures=set()
        self.result=None
        self.sealed=None
        self.closed=False
        self.revalidation_failed=False

    def sample(self):
        if self.result is not None or self.closed:raise ValueError('cli_native_watch_already_terminal')
        try:
            for browser in self.controller.owner.browsers.values():
                path=Path(browser['profile'])
                if not path.is_relative_to(self.root):continue
                parts=path.relative_to(self.root).parts
                if (len(parts)!=7 or parts[0]!='generations' or parts[2]!='chats' or parts[4]!='attempts'
                        or parts[6]!='browser-profile' or not re.fullmatch(r'[1-9][0-9]*',parts[1])
                        or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',parts[5])):
                    raise ValueError('cli_native_attempt_layout')
                if parts[3]=='readiness':continue
                attempt=path.parent
                if str(attempt) in self.before:raise ValueError('cli_native_preexisting_attempt')
                if (attempt.resolve()!=attempt or attempt.stat().st_uid!=os.getuid()
                        or attempt.stat().st_mode & 0o077):raise ValueError('cli_native_private_attempt')
                journal=attempt/'execution-events.jsonl'
                if not journal.exists():continue
                self.observe_file(journal,browser,dict(generation=int(parts[1]),cli_session_id=parts[3]))
        except (OSError,ValueError,KeyError,UnicodeError):
            self.failures.add('cli_native_watch_observation_unconfirmed')
            raise

    def observe_file(self,path,browser,identity):
        stat=path.stat()
        if (path.resolve()!=path or path.is_symlink() or not path.is_file() or stat.st_uid!=os.getuid()
                or stat.st_mode & 0o077):raise ValueError('cli_native_private_journal')
        previous=self.files.get(str(path))
        if previous is None:
            descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
            info=os.fstat(descriptor)
            if (info.st_dev,info.st_ino)!=(stat.st_dev,stat.st_ino):
                os.close(descriptor);raise ValueError('cli_native_journal_open_identity')
            previous=dict(descriptor=descriptor,device=stat.st_dev,inode=stat.st_ino,offset=0,
                digest=hashlib.sha256(),browser=copy.deepcopy(browser),identity=identity,
                first_observed_at_ms=time.time_ns()//1000000)
            self.files[str(path)]=previous
        if (previous['device'],previous['inode'])!=(stat.st_dev,stat.st_ino) or stat.st_size<previous['offset']:
            raise ValueError('cli_native_journal_replaced_or_truncated')
        remaining=stat.st_size-previous['offset']
        while remaining:
            chunk=os.read(previous['descriptor'],min(65536,remaining))
            if not chunk:raise ValueError('cli_native_journal_truncated_during_read')
            previous['digest'].update(chunk);previous['offset']+=len(chunk)
            remaining-=len(chunk)

    def freeze(self,events,expected,runtime_pin):
        if self.result is not None:return copy.deepcopy(self.result)
        paths=[]
        try:
            self.sample()
            process=self.controller.finish()
            if not process['passed']:raise ValueError('cli_native_original_process_unverified')
            candidates=[]
            seen=set()
            for event in events:
                part=event.get('part',{})
                if (event.get('type')!='tool_use' or part.get('id') in seen
                        or part.get('tool')!='loginom_dock_prepare' or part.get('state',{}).get('status')!='completed'):continue
                seen.add(part['id'])
                result=json.loads(part['state']['output'])
                if result.get('prepared') is True:candidates.append((part,result))
            if not candidates:raise ValueError('cli_native_public_prepare_missing')
            part,prepare=candidates[0]
            generation=part['state']['metadata']['generation']
            cli_session=part['sessionID']
            if (part['state']['input'].get('intent','new_draft')!='new_draft'
                    or cli_session!=expected['cli_session_id'] or type(generation) is not int
                    or prepare.get('sessionId')!=expected['runtime_session_id']):
                raise ValueError('cli_native_public_attempt_identity')
            selected=[(Path(path),row) for path,row in self.files.items()
                if row['identity']==dict(generation=generation,cli_session_id=cli_session)]
            if len(selected)!=1:raise ValueError('cli_native_exact_new_attempt_required')
            journal,row=selected[0]
            attempt=journal.parent
            if not any(binding['role']=='managed_runtime' and binding.get('cwd')==str(self.root)
                    for binding in process['source_process_bindings']):
                raise ValueError('cli_native_managed_runtime_cwd_unobserved')
            if row['offset']!=journal.stat().st_size or file_sha256(journal)!=row['digest'].hexdigest():
                raise ValueError('cli_native_journal_prefix_changed')
            metadata_path=attempt/'session.json'
            cleanup_path=attempt/'saved-package-cleanup.json'
            for path in (journal,metadata_path,cleanup_path):
                info=path.stat()
                if (path.resolve()!=path or path.is_symlink() or not path.is_file()
                        or info.st_uid!=os.getuid() or info.st_mode & 0o077):
                    raise ValueError('cli_native_private_artifact')
                paths.append(dict(name=path.name,path=str(path),bytes=info.st_size,sha256=file_sha256(path),
                    device=info.st_dev,inode=info.st_ino))
            metadata=json.loads(metadata_path.read_text())
            pins=prepare['knowledge']['session_manifest']
            if (runtime_pin['revision']!=expected['runtime_revision']
                    or metadata.get('clientRevision')!=runtime_pin['revision']
                    or metadata.get('clientSourceManifest')!=runtime_pin['manifest']
                    or metadata.get('sessionId')!=expected['runtime_session_id']
                    or metadata.get('profile')!=str(attempt/'browser-profile')
                    or metadata.get('artifacts')!=str(attempt/'artifacts')
                    or metadata.get('resultProfile')!='user-v1' or metadata.get('mode')!='executor-replay'
                    or not loginom_runtime_url_matches(metadata.get('loginomUrl'),expected['loginom_url'])
                    or not loginom_runtime_url_matches(prepare.get('loginomUrl'),expected['loginom_url'])
                    or metadata.get('workspaceReady') is not True
                    or metadata.get('targetIdentity')!=expected['target']
                    or pins.get('clientRevision')!=runtime_pin['revision']
                    or pins.get('actionManifestDigest')!=expected['action_manifest_sha256']):
                raise ValueError('cli_native_metadata_source_prepare_binding')
            content=journal.read_bytes()
            if not content or not content.endswith(b'\n'):raise ValueError('cli_native_complete_journal_required')
            rows=[json.loads(line) for line in content.splitlines()]
            previous=self.controller.submitted_at
            for record in rows:
                recorded=native_time(record['recorded_at'])
                if (not previous<=recorded<=process['finished_at']
                        or record.get('session_id')!=expected['runtime_session_id']
                        or record.get('runtime_revision')!=expected['runtime_revision']
                        or record.get('manifest_sha256')!=expected['action_manifest_sha256']
                        or record.get('type')=='redaction_failure'):
                    raise ValueError('cli_native_complete_journal_owner_time')
                previous=recorded
            cleanup=json.loads(cleanup_path.read_text())
            last=rows[-1]
            if (last.get('event')!='managed_saved_package_cleanup' or last.get('cleanup')!=cleanup
                    or cleanup.get('session_id')!=expected['runtime_session_id']
                    or cleanup.get('policy')!='last_confirmed_own_save'):
                raise ValueError('cli_native_normal_cleanup_artifact_binding')
            self.sealed=dict(events=rows,receipt=cleanup)
        except (OSError,ValueError,KeyError,TypeError,AttributeError,UnicodeError) as error:
            self.failures.add(str(error) if isinstance(error,ValueError) else 'cli_native_artifacts_missing_or_malformed')
        finally:
            self.close()
        self.result=dict(passed=not self.failures,failures=sorted(self.failures),files=paths,
            scope='original_cli_observed_new_attempt_append_only_journal_source_and_public_prepare',
            native_artifact_origin_binding_verified=not self.failures,exclusive_writer_identity_verified=False,
            normal_package_cleanup_semantics_verified=False,cli_acceptance_verified=False)
        return copy.deepcopy(self.result)

    def close(self):
        if self.closed:return
        self.closed=True
        for row in self.files.values():os.close(row['descriptor'])

    def revalidate(self):
        if self.result is None or not self.result['passed'] or self.revalidation_failed:return False
        try:
            for row in self.result['files']:
                path=Path(row['path']);info=path.stat()
                if (path.resolve()!=path or not path.is_file() or path.is_symlink()
                        or info.st_uid!=os.getuid() or info.st_mode & 0o077
                        or (info.st_dev,info.st_ino)!=(row['device'],row['inode'])
                        or info.st_size!=row['bytes'] or file_sha256(path)!=row['sha256']):
                    self.revalidation_failed=True;return False
        except (OSError,ValueError):
            self.revalidation_failed=True;return False
        return True
