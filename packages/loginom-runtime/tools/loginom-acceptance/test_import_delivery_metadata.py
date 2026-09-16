import copy
import unittest
from import_source_binding import source_with_delivery_metadata


class ImportDeliveryMetadataTests(unittest.TestCase):
    def setUp(self):
        self.source = dict(artifact_id='artifact', upload_operation_id='upload')
        self.events = [dict(operation_id='upload', outcome=dict(status='SUCCEEDED', output=dict(
            artifact_id='artifact', bytes=248, sha256='a'*64, server_copy_verification=dict(bytes_verified=True))))]

    def test_exact_receipt_fills_only_omitted_metadata(self):
        self.assertEqual(source_with_delivery_metadata(self.events, self.source),
                         dict(self.source, bytes=248, sha256='a'*64))
        explicit = dict(self.source, bytes=999, sha256='b'*64)
        self.assertEqual(source_with_delivery_metadata(self.events, explicit), explicit)
        self.assertNotIn('bytes', self.source)

    def test_foreign_unverified_missing_and_conflicting_receipts_fail_closed(self):
        variants = [[], [dict(operation_id='foreign', outcome=self.events[0]['outcome'])]]
        for mutate in (lambda e:e['outcome'].update(status='AMBIGUOUS'),
                       lambda e:e['outcome']['output'].update(artifact_id='foreign'),
                       lambda e:e['outcome']['output'].pop('server_copy_verification'),
                       lambda e:e['outcome']['output'].update(bytes=True)):
            event=copy.deepcopy(self.events[0]);mutate(event);variants.append([event])
        conflict=copy.deepcopy(self.events[0]);conflict['outcome']['output']['bytes']=249
        variants.append(self.events+[conflict])
        for events in variants:
            with self.subTest(events=events):
                result=source_with_delivery_metadata(events,self.source)
                self.assertIsNone(result['bytes']);self.assertIsNone(result['sha256'])
