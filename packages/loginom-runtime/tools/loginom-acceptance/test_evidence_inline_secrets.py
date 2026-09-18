import unittest
from evidence import clean


class InlineSecretsTests(unittest.TestCase):
    def test_repeat_note_hides_capability_in_truncated_json(self):
        text='[hermes note: identical result. Args: {"_dock_session_token":"private-capability","operation_id":"import-001","t…]'
        result=clean(text,[])
        self.assertNotIn('private-capability',result)
        self.assertIn('"operation_id":"import-001"',result)

    def test_common_inline_credentials_and_nonsecret_fields(self):
        for key in ['password','api_key','access_token','Authorization','cookie']:
            self.assertNotIn('private-value',clean('prefix {"'+key+'": "private-value", "count": 4}',[]))
        self.assertEqual(clean('The token count is 4; result = 12.',[]),'The token count is 4; result = 12.')

if __name__=='__main__':unittest.main()
