import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from verify_downloads import verify


class ReadonlyTraceTests(unittest.TestCase):
    def setUp(self):
        source=os.environ.get('COLLAPSE_READONLY_SESSION')
        manifest=os.environ.get('COLLAPSE_READONLY_MANIFEST')
        if not source or not manifest:self.skipTest('explicit live readonly evidence not supplied')
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.manifest=json.loads(Path(manifest).read_text())
        for name in ['readonly-first.json','preparation.json','session.json','browser-5.json','browser-6.json']:
            shutil.copyfile(Path(source)/name,self.root/name)
        shutil.copytree(Path(source)/'readonly-downloads',self.root/'readonly-downloads')

    def change(self,name,mutate):
        p=self.root/name;x=json.loads(p.read_text());mutate(x);p.write_text(json.dumps(x))

    def test_native_live_baseline(self):
        self.assertEqual(verify(self.root,self.manifest)['status'],'READONLY_DIAGNOSTIC_PASS')

    def test_cross_document_rejected(self):
        self.change('preparation.json',lambda x:x.update(document_id='other'))
        with self.assertRaises(ValueError):verify(self.root,self.manifest)

    def test_after_write_marker_rejected(self):
        self.change('readonly-first.json',lambda x:x.update(executor_created=True))
        with self.assertRaises(ValueError):verify(self.root,self.manifest)

    def test_missing_raw_rejected(self):
        (self.root/'browser-5.json').unlink()
        with self.assertRaises(OSError):verify(self.root,self.manifest)

    def test_local_byte_substitution_rejected(self):
        p=self.root/'readonly-downloads'/self.manifest['source']['path'].split('/')[-1];p.write_bytes(b'not the native file')
        with self.assertRaises(ValueError):verify(self.root,self.manifest)

    def test_wrong_expected_sha_rejected(self):
        self.manifest['source']['sha256']='0'*64
        with self.assertRaises(ValueError):verify(self.root,self.manifest)

    def test_swapped_order_rejected(self):
        self.change('readonly-first.json',lambda x:x['downloads'].reverse())
        with self.assertRaises(ValueError):verify(self.root,self.manifest)

    def test_invented_prior_sequence_rejected(self):
        self.change('readonly-first.json',lambda x:x.update(start_sequence=15))
        with self.assertRaises(ValueError):verify(self.root,self.manifest)

if __name__=='__main__':unittest.main()
