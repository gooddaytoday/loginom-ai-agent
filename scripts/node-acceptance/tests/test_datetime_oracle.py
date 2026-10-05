"""Calendar fixtures and native Variant dates retain distinct exact encodings."""
import importlib.util
from pathlib import Path
import sys
import unittest
from datetime import datetime
ROOT=Path(__file__).resolve().parents[3]/'docs/node-development/nodes/transform-crosstable/acceptance'
sys.path.insert(0,str(ROOT/'stage2'))
spec=importlib.util.spec_from_file_location('typed_generator',ROOT/'stage2/generate.py')
generator=importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)
class DateOracle(unittest.TestCase):
    def test_scalar_milliseconds_and_variant_bytes_are_independently_derived(self):
        value=datetime(2026,1,3)
        self.assertEqual(generator.encode(value,'datetime'),'2026-01-03T00:00:00.000')
        self.assertEqual(generator.encode(value,'datetime',True),{'cell_type':'datetime','bytes_le':'000000002079e640'})
        self.assertEqual(generator.encode(datetime(2026,1,3,0,0,0,123000),'datetime'),'2026-01-03T00:00:00.123')
        with self.assertRaises(ValueError):generator.encode(datetime(2026,1,3,0,0,0,1),'datetime')
        self.assertIsNone(generator.encode(None,'datetime'))
if __name__=='__main__':unittest.main()
