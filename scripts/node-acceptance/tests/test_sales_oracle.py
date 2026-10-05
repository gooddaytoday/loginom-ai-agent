"""Sales expectations retain native category-major order and independent math."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('sales_oracle',Path(__file__).resolve().parents[3]/'docs/node-development/nodes/transform-crosstable/acceptance/oracle.py')
oracle=importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)

class SalesOracle(unittest.TestCase):
    def test_category_major_fields_do_not_change_group_values_or_empty_intersections(self):
        records=[{'Region':'North','Category':'A','Amount':2.0,'Quantity':1.0},
                 {'Region':'North','Category':'A','Amount':6.0,'Quantity':1.0},
                 {'Region':'South','Category':'B','Amount':None,'Quantity':1.0}]
        output=oracle.report(records,['A','B'])
        self.assertEqual([c['name'] for c in output['columns']],['Region',
            'C_1_Amount_Sum','C_1_Amount_Min','C_1_Amount_Max','C_1_Amount_Avg','C_1_Quantity_Sum',
            'C_2_Amount_Sum','C_2_Amount_Min','C_2_Amount_Max','C_2_Amount_Avg','C_2_Quantity_Sum'])
        north,south=output['rows']
        self.assertEqual([north[k] for k in ['C_1_Amount_Sum','C_1_Amount_Min','C_1_Amount_Max','C_1_Amount_Avg','C_1_Quantity_Sum']],[8.0,2.0,6.0,4.0,2.0])
        self.assertIsNone(north['C_2_Quantity_Sum'])
        self.assertIsNone(south['C_2_Amount_Sum'])
        self.assertEqual(south['C_2_Quantity_Sum'],1.0)
        self.assertTrue(all(c['type']=='real' for c in output['columns'][1:]))

if __name__=='__main__':unittest.main()
