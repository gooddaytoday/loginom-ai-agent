"""SQLite/actual compact Save producers plus synthetic native close data.

No Loginom/browser/model run or process cleanup is represented by these fixtures.
"""
import copy
from datetime import datetime, timezone
import unittest
from javascript_cli_cleanup import verify_cli_package_cleanup
from javascript_cli_evidence import value_digest
import test_javascript_cli_persistence


def stamp(value):
    return datetime.fromtimestamp(value/1000,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')


class JavascriptCliCleanupTests(unittest.TestCase):
    def setUp(self):
        self.saved = test_javascript_cli_persistence.JavascriptCliPersistenceTests(methodName='runTest')
        self.saved.setUp()
        self.addCleanup(self.saved.doCleanups)
        for row in self.saved.nodes.native:
            row['recorded_at'] = stamp(1400)
        self.receipt = dict(version=1,status='SUCCEEDED',reason=None,policy='last_confirmed_own_save',
            session_id='runtime-session',document_id='document',account='jsteach',package_path=self.saved.path,
            save_operation_id='save',package_closed=True,logged_out=True,unsaved_changes_discarded=False,
            packages_before=1,packages_after=0,started_at=stamp(2100),completed_at=stamp(2300))
        self.cleanup = {**{k:self.saved.nodes.native[-1][k] for k in ('session_id','runtime_revision','manifest_sha256','target')},
            'event':'managed_saved_package_cleanup','recorded_at':stamp(2400),'cleanup':copy.deepcopy(self.receipt)}
        self.saved.nodes.native.append(self.cleanup)
        self.saved.nodes.synchronize()
        self.projection = self.saved.nodes.fixture.projection()

    def audit(self):
        return verify_cli_package_cleanup(self.saved.nodes.fixture.events,self.saved.nodes.native,'js',self.saved.path,
            self.saved.revisions,self.saved.expected,self.receipt,self.projection)

    def sync_receipt(self):
        self.cleanup['cleanup'] = copy.deepcopy(self.receipt)

    def test_normal_bound_receipt_passes_only_its_partial_scope(self):
        result = self.audit()
        self.assertTrue(result['passed'],result)
        self.assertEqual(result['save_operation_id'],'save')
        for key in ('authenticated_journal_verified','process_cleanup_verified','cold_persistence_verified','cli_acceptance_verified'):
            self.assertIs(result[key],False)

    def test_every_native_success_guard_remains_strict(self):
        patches = [dict(version=True),dict(version=2),dict(status='BLOCKED'),dict(status='SKIPPED_UNPREPARED'),
            dict(reason='UNSAVED_CHANGES'),dict(policy='isolated'),dict(save_operation_id='foreign'),dict(package_path='/foreign/pkg.lgp'),
            dict(session_id='foreign'),dict(document_id='foreign'),dict(account='foreign'),dict(package_closed=False),
            dict(logged_out=False),dict(package_closed=1),dict(logged_out=1),dict(unsaved_changes_discarded=True),
            dict(unsaved_changes_discarded=None),dict(packages_before=True),dict(packages_before=2),dict(packages_after=False),dict(packages_after=1)]
        original = copy.deepcopy(self.receipt)
        for patch in patches:
            with self.subTest(patch=patch):
                self.receipt = original|patch
                self.assertNotEqual(value_digest(self.receipt),value_digest(original))
                self.sync_receipt()
                result = self.audit()
                self.assertFalse(result['passed'],result)
                self.assertIn('cli_cleanup_owned_native_close_logout',result['failures'])
        self.receipt = original;self.sync_receipt()

    def test_receipt_cannot_be_substituted_without_native_event(self):
        self.receipt['package_closed'] = False
        result = self.audit()
        self.assertIn('cli_cleanup_native_receipt_binding',result['failures'])

    def test_missing_duplicate_isolated_or_later_events_refuse(self):
        original = copy.deepcopy(self.saved.nodes.native)
        for case in ('missing','duplicate','isolated','later'):
            with self.subTest(case=case):
                self.saved.nodes.native = copy.deepcopy(original)
                self.cleanup = self.saved.nodes.native[-1]
                if case == 'missing':self.saved.nodes.native.pop()
                if case == 'duplicate':self.saved.nodes.native.append(copy.deepcopy(self.cleanup))
                if case == 'isolated':self.cleanup['event']='isolated_package_cleanup'
                if case == 'later':self.saved.nodes.native.append(dict(event='unexpected'))
                self.assertFalse(self.audit()['passed'])

    def test_native_session_runtime_manifest_target_are_independently_bound(self):
        original = copy.deepcopy(self.cleanup)
        for key in ('session_id','runtime_revision','manifest_sha256','target'):
            with self.subTest(key=key):
                self.cleanup.clear();self.cleanup.update(copy.deepcopy(original))
                self.cleanup[key] = 'foreign' if key != 'target' else dict(platform='foreign')
                self.assertIn('cli_cleanup_native_receipt_binding',self.audit()['failures'])

    def test_last_save_must_be_verified_in_both_public_and_native_sources(self):
        self.saved.stages[-1]['dirty']['state']['modified'] = True
        self.assertIn('cli_cleanup_last_save_unverified',self.audit()['failures'])

    def test_model_terminal_comes_from_own_sqlite_projection(self):
        original = copy.deepcopy(self.projection)
        for case in ('late','missing','foreign','boolean'):
            with self.subTest(case=case):
                self.projection = copy.deepcopy(original)
                if case == 'foreign':self.projection['session_id']='foreign'
                if case == 'missing':self.projection['models']=[]
                if case in ('late','boolean'):
                    for model in self.projection['models']:
                        if model['role']=='assistant':model['time']['completed'] = 2200 if case=='late' else True
                self.assertIn('cli_cleanup_before_actual_model_terminal',self.audit()['failures'])

    def test_native_time_order_and_shape(self):
        original = copy.deepcopy(self.receipt)
        for patch in [dict(started_at='2100'),dict(started_at=stamp(2500)),dict(completed_at=stamp(2000)),dict(completed_at=stamp(2500))]:
            with self.subTest(patch=patch):
                self.receipt = original|patch;self.sync_receipt()
                self.assertFalse(self.audit()['passed'])

    def test_save_dirty_read_must_precede_native_close(self):
        self.saved.stages[-1]['dirty']['recorded_at']=stamp(2200)
        self.assertIn('cli_cleanup_save_or_tool_time_order',self.audit()['failures'])

    def test_public_tool_cannot_end_after_close_begins(self):
        self.saved.nodes.fixture.events[-1]['part']['state']['time']['end']=2200
        self.assertIn('cli_cleanup_save_or_tool_time_order',self.audit()['failures'])

    def test_malformed_input_does_not_crash_or_pass(self):
        for patch in [None,{},dict(status='SUCCEEDED')]:
            with self.subTest(patch=patch):
                self.receipt=patch
                self.assertFalse(self.audit()['passed'])

    def test_missing_reason_is_not_a_native_success_receipt(self):
        del self.receipt['reason'];self.sync_receipt()
        self.assertIn('cli_cleanup_owned_native_close_logout',self.audit()['failures'])


if __name__ == '__main__':unittest.main()
