import hashlib,unittest
from pathlib import Path
from join_upload_probe import FIXTURES,descriptors,prompt,validate_catalog,MANIFEST_URI,MANIFEST_SHA
class JoinUploadTest(unittest.TestCase):
    def test_two_separate_frozen_csv_descriptors(self):
        ds=descriptors('20260912-010000-1234abcd','/test-1')
        self.assertEqual(len(ds),2);self.assertNotEqual(ds[0]['name'],ds[1]['name'])
        for (name,(sha,size)),d in zip(FIXTURES.items(),ds):
            raw=(Path(__file__).parent/'fixtures/join'/name).read_bytes();self.assertEqual((hashlib.sha256(raw).hexdigest(),len(raw)),(sha,size));self.assertEqual(d['upload']['directory'],'/test-1')
    def test_catalog_and_destination_must_match_before_model(self):
        validate_catalog(MANIFEST_URI,MANIFEST_SHA,'/test-1')
        for uri,sha,directory in [('old',MANIFEST_SHA,'/test-1'),(MANIFEST_URI,'0'*64,'/test-1'),(MANIFEST_URI,MANIFEST_SHA,'/user/dock-p3'),(MANIFEST_URI,MANIFEST_SHA,'/test-10')]:
            with self.assertRaises(ValueError):validate_catalog(uri,sha,directory)
    def test_prompt_uses_both_authorized_names(self):
        s=prompt('__LEFT_CSV__ __RIGHT_CSV__ __PACKAGE_PATH__','/test-1/p.lgp','/test-1','20260912-010000-1234abcd')
        self.assertNotIn('__',s);self.assertIn('left.csv',s);self.assertIn('right.csv',s)
if __name__=='__main__':unittest.main()
