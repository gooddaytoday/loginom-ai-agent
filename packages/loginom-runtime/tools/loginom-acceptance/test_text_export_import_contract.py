import copy
import hashlib
import unittest
from text_export_import_contract import verify_unchanged_import_request


class ImportPersistenceContractTests(unittest.TestCase):
    def setUp(self):
        self.data = b'id;text\n1;hello\n'
        self.source = {'artifact_id': 'artifact-main', 'upload_operation_id': 'upload-main'}
        self.metadata = {'bytes': len(self.data), 'sha256': hashlib.sha256(self.data).hexdigest()}
        self.seed = {'parameters': {'source': self.source}}
        self.node = {'node_id': 'native-main'}
        self.request = {'target': {'kind': 'existing', 'type': 'imports.text', 'ref': self.node},
                        'parameters': {'source': dict(self.source), 'settings': {}}, 'inputs': [], 'mappings': []}
        self.events = [{'operation_id': 'upload-main', 'outcome': {'status': 'SUCCEEDED', 'output': {
            'artifact_id': 'artifact-main', **self.metadata, 'server_copy_verification': {'status': 'SUCCEEDED'}}}}]

    def verify(self, request=None, events=None):
        return verify_unchanged_import_request(self.events if events is None else events, self.seed,
                                              self.request if request is None else request, self.node, self.data)

    def test_required_identity_and_optional_exact_integrity(self):
        self.assertTrue(self.verify()['passed'])
        self.request['parameters']['source'].update(self.metadata)
        self.assertTrue(self.verify()['passed'])

    def test_rejects_substitutions_and_reconfiguration(self):
        mutations = [
            lambda r: r['parameters']['source'].update(artifact_id='another'),
            lambda r: r['parameters']['source'].update(upload_operation_id='another'),
            lambda r: r['parameters']['source'].update(bytes=0),
            lambda r: r['parameters']['source'].update(sha256='0'*64),
            lambda r: r['parameters']['source'].update(source_path='/test-2/other.csv'),
            lambda r: r['parameters'].update(settings={'source': {'source_path': '/test-2/other.csv'}}),
            lambda r: r['parameters'].update(settings={'format': {'delimiter': ','}}),
            lambda r: r['parameters'].update(settings={'columns': [{'name': 'foreign'}]}),
            lambda r: r.update(inputs=[{'source': {'node_id': 'foreign'}, 'input': 0, 'output': 0}]),
            lambda r: r.update(mappings=[{'direction': 'output', 'port': 0, 'fields': []}]),
            lambda r: r['target']['ref'].update(node_id='foreign'),
            lambda r: r.update(parameters={}),
            lambda r: r['parameters'].update(extra=True),
        ]
        for i, mutate in enumerate(mutations):
            with self.subTest(mutation=i):
                changed = copy.deepcopy(self.request); mutate(changed)
                with self.assertRaises((AssertionError, KeyError)): self.verify(changed)

    def test_rejects_missing_or_corrupt_delivery_evidence(self):
        for field, value in [('bytes', 999), ('sha256', '0'*64), ('artifact_id', 'foreign')]:
            events = copy.deepcopy(self.events); events[0]['outcome']['output'][field] = value
            with self.subTest(field=field), self.assertRaises(AssertionError): self.verify(events=events)
        with self.assertRaises(AssertionError): self.verify(events=[])


if __name__ == '__main__': unittest.main()
