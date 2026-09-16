import unittest
from row_filter_oracle import load_rows, partition, assert_partition, matches


class GoldenOracleTests(unittest.TestCase):
    def test_duplicates_null_and_empty_are_distinct(self):
        rows = load_rows()
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[5], rows[6])
        self.assertEqual(rows[3]["Text"], "")
        self.assertIsNone(rows[4]["Text"])
        conditions = [[{"field": {"kind": "input_field", "name": "Text"}, "type": "string", "operator": "is_null", "case_sensitive": False}]]
        ports = partition(rows, conditions)
        self.assertEqual([r["Id"] for r in ports[0]], [5])
        assert_partition(rows, ports)
        ports[1].pop()
        with self.assertRaises(AssertionError):
            assert_partition(rows, ports)

    def test_precedence_and_row_number_use_the_given_order(self):
        rows = load_rows()
        def c(op, value):
            return {"field": {"kind": "input_field", "name": "Id"}, "type": "integer", "operator": op, "value": value}
        ports = partition(rows, [[c("=", 9)], [c(">=", 6), c("<=", 7)]])
        self.assertEqual([r["Id"] for r in ports[0]], [6, 6, 7, 9])
        incorrectly_left_associated = [r for r in rows if (r['Id']==9 or r['Id']>=6) and r['Id']<=7]
        self.assertNotEqual(ports[0], incorrectly_left_associated)
        self.assertEqual([r['Id'] for r in incorrectly_left_associated], [6, 6, 7])
        assert_partition(rows, ports)
        condition = {"field": {"kind": "row_number"}, "type": "integer", "operator": "=", "value": 2}
        self.assertEqual(partition(rows[::-1], [[condition]])[0][0]["Id"], 8)

    def test_fixture_latin_order_separates_letter_order_from_case_equality(self):
        # Native filter ordering; list editor display sorting is independent.
        ordered=['','A,b','alpha','Alpha','Beta','end','preTail','preTAIL']
        def c(op,value,case=True):return dict(field=dict(kind='input_field',name='Text'),type='string',operator=op,value=value,case_sensitive=case)
        for i,left in enumerate(ordered):
            for j,right in enumerate(ordered):
                self.assertEqual(matches({'Text':left},1,c('<',right)),i<j)
        self.assertFalse(matches({'Text':'alpha'},1,c('=','Alpha')))
        self.assertTrue(matches({'Text':'alpha'},1,c('=','Alpha',False)))
        self.assertFalse(matches({'Text':'alpha'},1,c('<','Alpha',False)))
        with self.assertRaises(ValueError):matches({'Text':'Я'},1,c('<','Alpha'))


if __name__ == "__main__":
    unittest.main()
