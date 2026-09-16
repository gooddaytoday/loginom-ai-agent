import copy
import io
from pathlib import Path
import unittest
import zipfile
from package_snapshot import snapshot, compare


class SavedPackageTests(unittest.TestCase):
    def setUp(self):
        # Native sample is supplied explicitly, never substituted for live evidence.
        import os
        self.path = os.environ.get('COLLAPSE_SAVED_PACKAGE')
        if not self.path:
            self.skipTest('COLLAPSE_SAVED_PACKAGE not supplied')
        self.data = Path(self.path).read_bytes()
        self.before = snapshot(self.data)

    def test_real_package_native_link_and_source(self):
        self.assertEqual(self.before['source_guid'],self.before['link']['source']['NodeGuid'])
        self.assertEqual(self.before['collapse_guid'],self.before['link']['target']['NodeGuid'])
        self.assertTrue(self.before['source_path'].startswith('/test-1/'))

    def test_each_persisted_setting_change_rejected(self):
        for key in ('source_path','source_guid','collapse_guid','source_component','collapse_component','collapse_engine_attributes','link'):
            changed=copy.deepcopy(self.before);changed[key]=None
            with self.subTest(key=key),self.assertRaises(ValueError): compare(self.before,changed)

    def test_broken_native_topology_rejected(self):
        with zipfile.ZipFile(io.BytesIO(self.data)) as src:
            dest=io.BytesIO()
            with zipfile.ZipFile(dest,'w') as out:
                for item in src.infolist():
                    data=src.read(item)
                    if item.filename.split('/')[-1]=='Unit.xml':
                        data=data.replace(b'<TargetPort NodeGuid="',b'<TargetPort NodeGuid="broken-',1)
                    out.writestr(item,data)
        with self.assertRaisesRegex(ValueError,'topology'): snapshot(dest.getvalue())

    def test_empty_and_oversized_rejected(self):
        for data in (b'',b'x'*262145):
            with self.assertRaises(ValueError): snapshot(data)

    def test_two_incomplete_snapshots_are_not_equal_evidence(self):
        with self.assertRaises(ValueError): compare({}, {})

    def test_duplicate_unit_rejected(self):
        dest=io.BytesIO()
        with zipfile.ZipFile(dest,'w') as out:
            out.writestr('Unit.xml','<Unit/>');out.writestr('extra/Unit.xml','<Unit/>')
        with self.assertRaisesRegex(ValueError,'unique bounded'): snapshot(dest.getvalue())

    def test_xml_entities_rejected(self):
        dest=io.BytesIO()
        with zipfile.ZipFile(dest,'w') as out: out.writestr('Unit.xml','<!DOCTYPE Unit [<!ENTITY x "x">]><Unit>&x;</Unit>')
        with self.assertRaisesRegex(ValueError,'declarations'): snapshot(dest.getvalue())

if __name__=='__main__': unittest.main()
