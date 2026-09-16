import copy
import unittest
from duplicates_oracle import verify_marking

class DuplicatesOracleTest(unittest.TestCase):
    def fixture(self):
        source = [dict(Id=i, Key='A', Value=value) for i,value in [(1,None),(2,None),(3,''),(4,'null')]]
        output = [dict(row, Duplicate=row['Id'] in (1,2), DuplicateGroup=9 if row['Id'] in (1,2) else None,
                       Contradiction=True, ContradictionGroup=17) for row in source]
        return source, output

    def test_marks_every_copy_and_preserves_null_empty_text(self):
        source, output = self.fixture()
        result = verify_marking(source, output, [{1,2}], [{1,2,3,4}])
        self.assertTrue(result['passed']); self.assertEqual(result['duplicate_rows'],2)
        output[0]['DuplicateGroup']=output[1]['DuplicateGroup']=102
        self.assertTrue(verify_marking(source,output,[{1,2}],[{1,2,3,4}])['passed'])

    def test_rejects_removed_rows_and_tampered_flags_groups_or_originals(self):
        mutations = [lambda rows: rows.pop(), lambda rows: rows[0].update(Duplicate=False),
                     lambda rows: rows[0].update(DuplicateGroup=0),lambda rows: rows[0].update(DuplicateGroup=5),
                     lambda rows: rows[2].update(DuplicateGroup=9),lambda rows: rows[0].update(Value=''),
                     lambda rows: rows[0].update(Id=2),lambda rows: rows[0].update(Contradiction=1),
                     lambda rows: rows[0].update(ContradictionGroup=2),lambda rows: rows[0].update(Extra='x')]
        for mutation in mutations:
            source, output = self.fixture();mutation(output)
            self.assertFalse(verify_marking(source,output,[{1,2}],[{1,2,3,4}])['passed'])

    def test_empty_table(self):
        self.assertTrue(verify_marking([],[],[],[])['passed'])
        self.assertFalse(verify_marking([],[],[{1,2}],[])['passed'])

if __name__ == '__main__': unittest.main()
