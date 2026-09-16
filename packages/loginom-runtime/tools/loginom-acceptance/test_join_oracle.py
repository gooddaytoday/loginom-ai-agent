import unittest
from join_oracle import expected
from grouping_output_evidence import align_expected_rows
class JoinOracleTest(unittest.TestCase):
    left=b'LKey;Part;LValue\nA;1;x\nA;1;y\nB;1;z\nNULL;1;n\nA;2;q\n'
    right=b'RKey;PartR;RValue\nA;1;p\nA;1;r\nNULL;1;t\nA;2;s\n'
    def run_join(self,mode='inner',sensitive=True,include=False,right=None,keys=None):return expected(self.left,self.right if right is None else right,keys or [('LKey','RKey'),('Part','PartR')],mode,sensitive,include)
    def test_duplicate_multiplicity_left_and_null(self):
        c,r=self.run_join();self.assertEqual(len(r),6);self.assertEqual(r[:4],[['A',1,'x','p'],['A',1,'x','r'],['A',1,'y','p'],['A',1,'y','r']]);self.assertIn([None,1,'n','t'],r)
        c,r=self.run_join('left');self.assertEqual(len(r),7);self.assertIn(['B',1,'z',None],r)
    def test_composite_case_and_right_keys(self):
        self.assertEqual(len(self.run_join(keys=[('LKey','RKey')])[1]),10)
        self.assertEqual(len(self.run_join(include=True)[0]),6)
        lower=self.right.replace(b'A;',b'a;')
        self.assertEqual(len(self.run_join(right=lower)[1]),1)
        self.assertEqual(len(self.run_join(sensitive=False,right=lower)[1]),6)
    def test_empty_and_multiset_rejects_lost_duplicate(self):
        self.assertEqual(self.run_join(right=b'RKey;PartR;RValue\n')[1],[])
        self.assertEqual(len(self.run_join('left',right=b'RKey;PartR;RValue\n')[1]),5)
        cols,rows=self.run_join()
        sample=[[dict(type=c['type'],is_null=v is None,value=str(v) if c['type']=='integer' and v is not None else v) for c,v in zip(cols,row)] for row in rows]
        self.assertEqual(align_expected_rows(cols,rows,list(reversed(sample))),list(reversed(rows)))
        with self.assertRaises(ValueError):align_expected_rows(cols,rows,sample[:-1]+[sample[0]])
if __name__=='__main__':unittest.main()
