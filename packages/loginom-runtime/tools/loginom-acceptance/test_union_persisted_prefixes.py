import unittest
from union_configuration_evidence import verify_union_persisted_prefixes

NODE='3703ff9a-8e33-4147-baff-4459c9a4a635'
EXPECTED=dict(enabled=False,name='',label='')
def xml(attributes, node=NODE):
    return f'<Unit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><WorkFlow><Nodes><Item Guid="{node}"><Component><Engine xsi:type="TBGUnionDataEngine" {attributes}/></Component></Item></Nodes></WorkFlow></Unit>'

class PersistedPrefixes(unittest.TestCase):
    def test_saved_09_label_cannot_pass_despite_empty_cached_receipts(self):
        result=verify_union_persisted_prefixes(xml('DisplayNamePrefix="Объединение"'),NODE,EXPECTED)
        self.assertFalse(result['passed'])
        self.assertIn('union_saved_prefix_label',result['failures'])
        self.assertEqual(result['unverified_defaults'],['enabled','name'])

    def test_omitted_defaults_are_not_empty_values(self):
        self.assertFalse(verify_union_persisted_prefixes(xml(''),NODE,EXPECTED)['passed'])

    def test_exact_explicit_values_and_node_identity(self):
        saved=xml('UsePrefixes="false" NamePrefix="" DisplayNamePrefix=""')
        self.assertTrue(verify_union_persisted_prefixes(saved,NODE,EXPECTED)['passed'])
        self.assertFalse(verify_union_persisted_prefixes(saved,'other',EXPECTED)['passed'])

if __name__=='__main__':unittest.main()
