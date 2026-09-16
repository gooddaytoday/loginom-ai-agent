import unittest
from import_settings import format_equal
class FormatLabels(unittest.TestCase):
 def test_observed_aliases(self):
  self.assertTrue(format_equal({'delimiter':';','text_qualifier':'"','null_marker':'NULL','decimal_separator':'.'},{'delimiter':'Точка с запятой','text_qualifier':'Двойная кавычка (")','null_marker':'NULL','decimal_separator':'Точка (.)'}))
 def test_null_case_and_other_changes_stay_distinct(self):
  for a,b in [('NULL','null'),('NULL',''),('\\N','\\n')]:self.assertFalse(format_equal({'null_marker':a},{'null_marker':b}))
  self.assertFalse(format_equal({'delimiter':';'},{'delimiter':','}))
  self.assertFalse(format_equal({'text_qualifier':'"'},{}))
if __name__=='__main__':unittest.main()
