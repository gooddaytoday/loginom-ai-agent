import unittest
from duplicates_configuration_evidence import verify_duplicates_configuration


class DuplicatesConfigurationEvidenceTest(unittest.TestCase):
    def test_empty_or_projected_only_evidence_never_passes(self):
        request = dict(operation_id='op', target=dict(type='research.duplicates'), mode='mark', mappings=[])
        for events in ([], [dict(operation_id='op', phase='node_checkpoint', result=dict(status='SUCCEEDED'))]):
            result = verify_duplicates_configuration(events, request)
            self.assertFalse(result['passed'])
            self.assertFalse(result['package_persistence_verified'])

    def test_foreign_contract_is_rejected_before_evidence(self):
        for target, mode, mapping in [('transform.union_data', 'mark', []), ('research.duplicates', 'delete', []), ('research.duplicates', 'mark', [{}])]:
            result = verify_duplicates_configuration([], dict(operation_id='op', target=dict(type=target), mode=mode, mappings=mapping))
            self.assertIn('duplicates_contract', result['failures'])


if __name__ == '__main__':
    unittest.main()
