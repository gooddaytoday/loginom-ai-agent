"""Private physical manual-registry fixtures and actual Linux holder identity."""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from javascript_cli_lease import JavascriptAcceptanceLease
from javascript_cli_processes import linux_process


@unittest.skipUnless(sys.platform=='linux','actual /proc holder required')
class JavascriptLeaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='loginom-lease-')
        self.addCleanup(self.temporary.cleanup);self.root=Path(self.temporary.name)
        self.registry=self.root/'host-resources.json'
        self.lock=self.root/'acceptance.lock';self.lock.mkdir(mode=0o700)
        self.expected=dict(lease_id='fixture-trial',owner_task_id='fixture-task',campaign_id='javascript-20260926-ubuntu',
            node_id='component.programming.JavaScript',account='jsteach',worktree=str(self.root/'worktree'),
            cli_profile=str(self.root/'cli-profile'),cold_profile=str(self.root/'cold-profile'),candidate_manifest_sha256='a'*64)
        self.holder=dict(linux_process(os.getpid()),boot_id=Path('/proc/sys/kernel/random/boot_id').read_text().strip())
        self.metadata=dict(lease_id='fixture-trial',owner_task_id='fixture-task',campaign_id='javascript-20260926-ubuntu',holder=self.holder)
        self.state=dict(schema_version=1,registry_owner='fixture-task',acceptance_lease={**self.expected,'status':'reserved_active'},
            developer_leases=[dict(lease_id='preparation',status='reserved_active',account='jsteach',owner_task_id='fixture-task',
                campaign_id='javascript-20260926-ubuntu',browser_status='closed_verified',active_exec_session=None)],unrelated='preserve')
        self.write(self.registry,self.state);self.write(self.lock/'owner.json',self.metadata)

    def write(self,path,value):path.write_text(json.dumps(value));path.chmod(0o600)

    def gate(self):return JavascriptAcceptanceLease(self.registry,self.expected)

    def test_actual_original_holder_existing_lease_is_read_only_and_not_cleanup_proof(self):
        before=[path.read_bytes() for path in (self.registry,self.lock/'owner.json')]
        gate=self.gate();proof=gate.revalidate();self.assertTrue(proof['passed'])
        self.assertEqual(proof['holder'],self.holder)
        self.assertEqual(before,[path.read_bytes() for path in (self.registry,self.lock/'owner.json')])
        for name in ('native_cleanup_verified','resource_release_verified','cli_acceptance_verified'):
            self.assertIs(proof[name],False)

    def test_cli_then_cold_each_original_profile_candidate_is_consumed_once(self):
        gate=self.gate();pin=dict(manifest_sha256='a'*64)
        gate.admit('cli',Path(self.expected['cli_profile']),pin)
        with self.assertRaisesRegex(ValueError,'once_only'):gate.admit('cli',self.expected['cli_profile'],pin)
        gate.admit('cold',self.expected['cold_profile'],pin)
        with self.assertRaisesRegex(ValueError,'once_only'):gate.admit('cold',self.expected['cold_profile'],pin)

    def test_cold_first_foreign_profile_or_candidate_refuses_before_consumption(self):
        gate=self.gate();pin=dict(manifest_sha256='a'*64)
        for kind,profile,pins in [('cold',self.expected['cold_profile'],pin),
                ('cli',str(self.root/'foreign'),pin),('cli',self.expected['cli_profile'],dict(manifest_sha256='b'*64))]:
            with self.subTest(kind=kind,profile=profile,pins=pins):
                with self.assertRaisesRegex(ValueError,'once_only'):gate.admit(kind,profile,pins)
        self.assertEqual(gate.used,set())

    def test_wrong_owner_assignment_or_live_holder_refuses(self):
        original=copy.deepcopy(self.state)
        for key,value in [('registry_owner','other'),('acceptance_lease',None)]:
            self.state=copy.deepcopy(original);self.state[key]=value;self.write(self.registry,self.state)
            with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):self.gate()
        self.write(self.registry,original)
        self.metadata['holder']['start_ticks']+=1;self.write(self.lock/'owner.json',self.metadata)
        with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):self.gate()

    def test_busy_account_or_profile_and_owned_active_browser_refuse(self):
        original=copy.deepcopy(self.state)
        for change in (dict(owner_task_id='other'),dict(browser_status='running'),dict(active_exec_session=1234)):
            self.state=copy.deepcopy(original);self.state['developer_leases'][0].update(change)
            self.write(self.registry,self.state)
            with self.subTest(change=change):
                with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):self.gate()
        self.state=copy.deepcopy(original);self.state['developer_leases'].append(dict(status='reserved_active',
            account='other',owner_task_id='other',profile=self.expected['cold_profile']));self.write(self.registry,self.state)
        with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):self.gate()

    def test_missing_public_or_alias_lock_and_registry_refuse_without_removal(self):
        path=self.lock/'owner.json';path.chmod(0o644)
        with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):self.gate()
        path.chmod(0o600)
        alias=self.root/'alias.json';alias.symlink_to(self.registry)
        with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):JavascriptAcceptanceLease(alias,self.expected)
        path.unlink()
        with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):self.gate()
        self.assertTrue(self.lock.is_dir());self.assertEqual(json.loads(self.registry.read_text())['unrelated'],'preserve')

    def test_foreign_ancestor_or_nested_profile_refuses(self):
        original=copy.deepcopy(self.state)
        for profile in (str(self.root),self.expected['cli_profile']+'/browser-profile'):
            self.state=copy.deepcopy(original)
            self.state['developer_leases'].append(dict(status='reserved_active',account='other',owner_task_id='other',profile=profile))
            self.write(self.registry,self.state)
            with self.subTest(profile=profile):
                with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):self.gate()

    def test_first_failed_observation_stays_failed_after_restoring_registry(self):
        gate=self.gate();original=self.registry.read_bytes()
        self.state['acceptance_lease']=None;self.write(self.registry,self.state)
        with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):gate.revalidate()
        self.registry.write_bytes(original)
        with self.assertRaisesRegex(ValueError,'previous_observation_failed'):gate.revalidate()

    def test_same_bytes_replacement_cannot_reuse_original_lock_identity(self):
        gate=self.gate();path=self.lock/'owner.json';original=path.read_bytes()
        moved=self.lock/'original';path.rename(moved);path.write_bytes(original);path.chmod(0o600)
        with self.assertRaisesRegex(ValueError,'observation_unconfirmed'):gate.revalidate()
        self.assertIn('cli_lease_lock_identity_changed',gate.failures)

    def test_invalid_external_paths_account_node_and_pins_refuse(self):
        for patch in (dict(account='admin'),dict(node_id='other'),dict(cli_profile='relative'),
                dict(cold_profile=self.expected['cli_profile']),dict(candidate_manifest_sha256='bad')):
            with self.subTest(patch=patch):
                with self.assertRaisesRegex(ValueError,'external_assignment'):
                    JavascriptAcceptanceLease(self.registry,self.expected|patch)


if __name__=='__main__':unittest.main()
