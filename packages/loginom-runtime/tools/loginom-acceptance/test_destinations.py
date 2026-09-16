import unittest
from destinations import storage_segments,render_goal

class DestinationsTest(unittest.TestCase):
    def test_different_accounts_are_explicit_and_preserved(self):
        for directory in ['/test','/analyst/data','/Иван/данные']:
            self.assertEqual('/'+'/'.join(storage_segments(directory)),directory)
            self.assertIn(directory,render_goal('__STORAGE_DIRECTORY__ __STORAGE_SEGMENTS__','unused',directory))
        self.assertNotIn('/user/',render_goal('__STORAGE_DIRECTORY__','unused','/test'))

    def test_missing_or_ambiguous_destination_has_no_fallback(self):
        for directory in [None,'','test/data','/','/test//data','/test/../data','/test/','/ test/data','/test\\data']:
            with self.assertRaises(ValueError):storage_segments(directory)
