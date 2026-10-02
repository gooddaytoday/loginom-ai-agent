"""Read the existing manual host lease before these original launch factories.

No registry writer, stale-lock recovery, resource release or background queue.
The owning controller keeps acceptance.lock until native/process cleanup is
independently verified. This gate never infers cleanup from a lease status.
"""
import copy
import json
import os
from pathlib import Path
import time
from javascript_cli_candidate import file_sha256,hexadecimal
from javascript_cli_processes import linux_process


class JavascriptAcceptanceLease:
    def __init__(self,registry,expected):
        if not isinstance(expected,dict):raise ValueError('cli_lease_external_assignment')
        self.registry=Path(registry)
        self.lock=self.registry.with_name('acceptance.lock')
        self.metadata=self.lock/'owner.json'
        self.expected=copy.deepcopy(expected)
        current=linux_process(os.getpid())
        if current is None:raise ValueError('cli_lease_original_linux_holder')
        self.holder=dict(current,boot_id=Path('/proc/sys/kernel/random/boot_id').read_text().strip())
        self.failures=set()
        self.used=set()
        self.observed_at=time.time_ns()//1000000
        self.metadata_identity=None
        self.metadata_sha256=None
        if (set(expected)!={'lease_id','owner_task_id','campaign_id','node_id','account','worktree',
                'cli_profile','cold_profile','candidate_manifest_sha256'}
                or any(not isinstance(value,str) or not value for value in expected.values())
                or expected['campaign_id']!='javascript-20260926-ubuntu'
                or expected['node_id']!='component.programming.JavaScript' or expected['account']!='jsteach'
                or not hexadecimal(expected['candidate_manifest_sha256'],64)
                or any(not Path(expected[name]).is_absolute() or Path(expected[name]).resolve()!=Path(expected[name])
                    for name in ('worktree','cli_profile','cold_profile'))
                or Path(expected['cli_profile']).is_relative_to(Path(expected['cold_profile']))
                or Path(expected['cold_profile']).is_relative_to(Path(expected['cli_profile']))):
            raise ValueError('cli_lease_external_assignment')
        self.revalidate()

    def revalidate(self):
        if self.failures:raise ValueError('cli_lease_previous_observation_failed')
        try:
            for path in (self.registry,self.lock,self.metadata):
                info=path.stat()
                if (not path.is_absolute() or path.resolve()!=path or path.is_symlink()
                        or info.st_uid!=os.getuid() or info.st_mode & 0o077
                        or (not path.is_dir() if path==self.lock else not path.is_file())):
                    raise ValueError('cli_lease_private_canonical_registry_and_lock')
            info=self.metadata.stat()
            identity=(info.st_dev,info.st_ino)
            digest=file_sha256(self.metadata)
            if self.metadata_identity is not None and (identity!=self.metadata_identity or digest!=self.metadata_sha256):
                raise ValueError('cli_lease_lock_identity_changed')
            registry=json.loads(self.registry.read_text())
            metadata=json.loads(self.metadata.read_text())
            lease=registry['acceptance_lease']
            if (registry.get('schema_version')!=1 or registry.get('registry_owner')!=self.expected['owner_task_id']
                    or not isinstance(lease,dict) or any(lease.get(k)!=v for k,v in self.expected.items())
                    or lease.get('status') not in ('reserved_active','running','cold_reading','cleanup_pending')
                    or metadata.get('lease_id')!=self.expected['lease_id']
                    or metadata.get('owner_task_id')!=self.expected['owner_task_id']
                    or metadata.get('campaign_id')!=self.expected['campaign_id']
                    or metadata.get('holder')!=self.holder
                    or linux_process(self.holder['pid'])!={k:v for k,v in self.holder.items() if k!='boot_id'}
                    or Path('/proc/sys/kernel/random/boot_id').read_text().strip()!=self.holder['boot_id']):
                raise ValueError('cli_lease_original_live_holder_or_assignment')
            for other in registry['developer_leases']:
                if other.get('status') in ('released','closed_verified'):continue
                if other.get('account')==self.expected['account']:
                    if (other.get('owner_task_id')!=self.expected['owner_task_id']
                            or other.get('campaign_id')!=self.expected['campaign_id']
                            or other.get('browser_status')!='closed_verified'
                            or other.get('active_exec_session') is not None):
                        raise ValueError('cli_lease_account_busy')
                profile=other.get('profile')
                if (other.get('owner_task_id')!=self.expected['owner_task_id'] and isinstance(profile,str)
                        and any(Path(profile).is_relative_to(Path(self.expected[key]))
                            or Path(self.expected[key]).is_relative_to(Path(profile)) for key in ('cli_profile','cold_profile'))):
                    raise ValueError('cli_lease_profile_busy')
            self.metadata_identity,self.metadata_sha256=identity,digest
        except (OSError,ValueError,KeyError,TypeError,AttributeError) as error:
            self.failures.add(str(error) if isinstance(error,ValueError) else 'cli_lease_missing_or_malformed')
            raise ValueError('cli_lease_observation_unconfirmed') from None
        return dict(passed=True,lease_id=self.expected['lease_id'],holder=copy.deepcopy(self.holder),
            first_observed_at=self.observed_at,scope='existing_manual_host_lease_and_original_live_controller_holder',
            native_cleanup_verified=False,resource_release_verified=False,cli_acceptance_verified=False)

    def admit(self,kind,profile,pins):
        if (kind not in ('cli','cold') or kind in self.used
                or str(profile)!=self.expected[kind+'_profile']
                or pins.get('manifest_sha256')!=self.expected['candidate_manifest_sha256']
                or kind=='cold' and 'cli' not in self.used):
            raise ValueError('cli_lease_original_once_only_profile_candidate')
        proof=self.revalidate()
        # Reserve this original attempt before Popen. A launch error cannot
        # authorize retry with the same lease object or forget unknown effects.
        self.used.add(kind)
        return proof
