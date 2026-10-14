"""Offline original producer controls: no admit CLI or model process is invoked."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

import admit
from test_admit import AdmissionTest


class OriginTest(unittest.TestCase):
    def setUp(self):
        self.fixture = AdmissionTest()
        self.fixture.setUp()
        self.root = self.fixture.root
        self.fixture.contract['business_execution_seconds'] = 90
        self.fixture.write()
        self.args = types.SimpleNamespace(manifest=str(self.root/'manifest'), receipt=str(self.root/'receipt'))

    def tearDown(self):
        self.assertFalse((self.root/'calls').exists(), 'No fixture CLI/model spawn permitted')
        self.fixture.tearDown()

    def receipt(self):
        return json.loads((self.root/'receipt').read_text())

    def test_real_claim_birth_once_and_process_duplicate(self):
        with admit.admission_decision(self.args) as decision:
            first = self.receipt()
            origin = first['execution_origin']
            print(json.dumps({'control': 'canonical-original-birth', 'receipt': first}, sort_keys=True))
            self.assertEqual(origin['deadline_unix_ns'] - origin['born_unix_ns'], 90_000_000_000)
            self.assertEqual(origin['binding']['requirements'], self.fixture.spec['requirements'])
            self.assertEqual(origin['claim']['inode'], os.stat(self.args.receipt).st_ino)
            self.assertEqual(origin['claim']['uid'], os.getuid())
            self.assertEqual(origin['private_receiver'], 'UNAVAILABLE')
            self.assertFalse(origin['sdk_authority'])
            argv = decision.consume_birth()
            self.assertNotIn('execution_origin', repr(argv))
            with self.assertRaises(admit.DeliveryError): decision.consume_birth()
            # Genuine separate process attempts the same producer claim; POST/model0.
            code = 'import admit,types; a=types.SimpleNamespace(manifest='+repr(self.args.manifest)+',receipt='+repr(self.args.receipt)+');\nwith admit.admission_decision(a): pass'
            child = subprocess.run([sys.executable, '-c', code], cwd=Path(admit.__file__).parent, capture_output=True)
            self.assertNotEqual(child.returncode, 0)
            self.assertIn(b'FileExistsError', child.stderr)
            self.assertEqual(self.receipt(), first)
        with self.assertRaises(admit.DeliveryError): decision.before_spawn()
        self.assertEqual(self.receipt(), first)

    def test_missing_lifetime_refuses_without_origin(self):
        del self.fixture.contract['business_execution_seconds']; self.fixture.write()
        with self.assertRaises(admit.DeliveryError):
            with admit.admission_decision(self.args): self.fail('borrowed')
        self.assertEqual(self.receipt()['state'], 'rejected')
        self.assertNotIn('execution_origin', self.receipt())

    def test_invalid_lifetimes(self):
        for value in (True, 0, 7201, 90.0):
            with self.subTest(value=value):
                self.fixture.contract['business_execution_seconds'] = value; self.fixture.write()
                self.args.receipt = str(self.root/('receipt-'+str(value)))
                with self.assertRaises(admit.DeliveryError):
                    with admit.admission_decision(self.args): self.fail('borrowed')

    def test_copies_and_foreign_receipt_refuse(self):
        with admit.admission_decision(self.args) as decision:
            with self.assertRaises(admit.DeliveryError): copy.copy(decision)
            with self.assertRaises(admit.DeliveryError): copy.deepcopy(decision)
            first = (self.root/'receipt').read_bytes()
            replacement = self.root/'foreign'; replacement.write_bytes(first); replacement.chmod(0o600)
            replacement.replace(self.root/'receipt')
            with self.assertRaises(admit.DeliveryError): decision.consume_birth()
            self.assertEqual((self.root/'receipt').read_bytes(), first)

    def test_mutated_receipt_and_input_no_remint(self):
        with admit.admission_decision(self.args) as decision:
            first = self.receipt()
            (self.fixture.cwd/'input.csv').write_text('late changed')
            with self.assertRaises(admit.DeliveryError): decision.consume_birth()
            self.assertEqual(self.receipt(), first)
            (self.root/'receipt').write_text('{}')
            with self.assertRaises(admit.DeliveryError): decision.before_spawn()
            self.assertEqual((self.root/'receipt').read_text(), '{}')

    def test_expiry_and_clock_rollback_do_not_extend(self):
        with admit.admission_decision(self.args) as decision:
            first = self.receipt(); deadline = first['execution_origin']['deadline_unix_ns']
            with patch.object(admit.time, 'time_ns', return_value=deadline):
                with self.assertRaises(admit.DeliveryError): decision.consume_birth()
            with patch.object(admit.time, 'time_ns', return_value=0), patch.object(admit.time, 'monotonic_ns', return_value=decision._monotonic_deadline):
                with self.assertRaises(admit.DeliveryError): decision.consume_birth()
            self.assertEqual(self.receipt(), first)

    def test_awaited_validation_consumes_same_bound(self):
        with admit.admission_decision(self.args) as decision:
            first = self.receipt(); real = admit.validate
            def delayed(spec):
                result = real(spec)
                decision._monotonic_deadline = 0  # labelled elapsed-time fault
                return result
            with patch.object(admit, 'validate', side_effect=delayed):
                with self.assertRaises(admit.DeliveryError): decision.consume_birth()
            self.assertEqual(self.receipt(), first)

    def test_first_error_unknown_keeps_original_claim(self):
        failure = RuntimeError('original fault')
        with self.assertRaises(RuntimeError) as caught:
            with admit.admission_decision(self.args) as decision:
                first = self.receipt()
                decision.consume_birth()
                raise failure
        self.assertIs(caught.exception, failure)
        self.assertEqual(self.receipt(), first)
        self.assertEqual(first['state'], 'launching')
        with self.assertRaises(FileExistsError):
            with admit.admission_decision(self.args): self.fail('replayed')
        self.assertEqual(self.receipt(), first)

    def test_hardlinked_claim_refuses(self):
        with admit.admission_decision(self.args) as decision:
            first = self.receipt()
            os.link(self.args.receipt, self.root/'copy-receipt')
            with self.assertRaises(admit.DeliveryError): decision.consume_birth()
            self.assertEqual(self.receipt(), first)

    def test_missing_and_symlinked_original_claim_refuse(self):
        with admit.admission_decision(self.args) as decision:
            first = self.receipt()
            (self.root/'receipt').rename(self.root/'original')
            with self.assertRaises(FileNotFoundError): decision.before_spawn()
            (self.root/'receipt').symlink_to(self.root/'original')
            with self.assertRaises(admit.DeliveryError): decision.before_spawn()
            self.assertEqual(json.loads((self.root/'original').read_text()), first)

    def test_mismatched_manifest_refuses_without_origin(self):
        self.fixture.spec['candidate']['sha'] = 'f'*40
        self.fixture.write()
        with self.assertRaises(admit.DeliveryError):
            with admit.admission_decision(self.args): self.fail('borrowed')
        self.assertEqual(self.receipt()['state'], 'rejected')
        self.assertNotIn('execution_origin', self.receipt())

    def test_legacy_receipt_untouched(self):
        original = b'{"state":"exited","acceptance":true}'
        (self.root/'receipt').write_bytes(original)
        with self.assertRaises(FileExistsError):
            with admit.admission_decision(self.args): self.fail('migrated')
        self.assertEqual((self.root/'receipt').read_bytes(), original)


    def test_original_claim_refuses_inherited_process_before_write(self):
        with admit.admission_decision(self.args) as decision:
            original = (self.root/'receipt').read_bytes()
            pid = os.fork()
            if pid == 0:
                try:
                    try:
                        decision._claim.write()
                    except admit.DeliveryError:
                        os._exit(0)
                    os._exit(1)
                except BaseException:
                    os._exit(2)
            _, status = os.waitpid(pid, 0)
            self.assertEqual(os.waitstatus_to_exitcode(status), 0)
            self.assertEqual((self.root/'receipt').read_bytes(), original)
            self.assertTrue(decision.consume_birth())

    def test_secondary_diagnostic_refusal_keeps_first_exception_and_cause(self):
        first = ValueError('original validation failure')
        cause = RuntimeError('original cause')
        first.__cause__ = cause
        validate = admit.validate
        held = []
        def fail(spec):
            validate(spec)
            path = self.root/'receipt'
            held.append(path.read_bytes())
            path.rename(self.root/'original-receipt')
            path.write_bytes(held[0])
            path.chmod(0o600)
            raise first
        with patch.object(admit, 'validate', side_effect=fail):
            with self.assertRaises(ValueError) as caught:
                with admit.admission_decision(self.args): self.fail('admitted')
        self.assertIs(caught.exception, first)
        self.assertIs(first.__cause__, cause)
        self.assertIsInstance(first._admission_diagnostic_failure, admit.DeliveryError)
        self.assertEqual((self.root/'receipt').read_bytes(), held[0])
        self.assertEqual((self.root/'original-receipt').read_bytes(), held[0])


if __name__ == '__main__':
    unittest.main()
