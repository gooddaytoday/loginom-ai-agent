import hashlib
import unittest
from json_digest import javascript_digest

class JsonDigestTests(unittest.TestCase):
    def test_ecmascript_exponent_boundaries_and_negative_zero(self):
        vectors=[(0.00001,'0.00001'),(0.000001,'0.000001'),(0.0000001,'1e-7'),
                 (-0.00001,'-0.00001'),(1e20,'100000000000000000000'),(1e21,'1e+21'),
                 (-0.0,'0'),(1.0,'1'),(1.23456,'1.23456'),(1000000000000000100.0,'1000000000000000100')]
        for value,spelling in vectors:
            with self.subTest(spelling=spelling):
                self.assertEqual(javascript_digest({'value':value}),hashlib.sha256(('{"value":'+spelling+'}').encode()).hexdigest())
    def test_order_unicode_and_real_value_tampering(self):
        raw='{"строка":"Привет","values":[1,0.00001,null,true]}'
        value={'строка':'Привет','values':[1,0.00001,None,True]}
        self.assertEqual(javascript_digest(value),hashlib.sha256(raw.encode()).hexdigest())
        value['values'][1]=0.00002
        self.assertNotEqual(javascript_digest(value),hashlib.sha256(raw.encode()).hexdigest())

if __name__=='__main__':unittest.main()
