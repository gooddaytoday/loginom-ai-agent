import unittest
from decimal import Decimal as D
from audit_scalar_expression import parse_expression, evaluate_expression


class ScalarAudit(unittest.TestCase):
    def calculate(self,formula,**row):
        return evaluate_expression(parse_expression(formula),row)

    def test_ascii_month_conversion_and_unreviewed_string_domains(self):
        for month in range(1,13):
            for formula in ['Val(SubStr(Names,3,2))', 'Val(SubStr(Names,3,Count(Names)-2))']:
                self.assertEqual(self.calculate(formula,Names='m_'+str(month)),D(month))
        for formula in ['Length("m_1")', 'SubStr("m_1",3)', 'SubStr("abc",0,1)',
                        'SubStr("abc",4,1)', 'SubStr("abc",1,0)', 'SubStr("abc",1.5,1)',
                        'Count("🙂")', 'Count(1)', 'Val("1,2")', 'Val("1.2")',
                        'Val(" 1")', 'Val("")', 'Val("1234567890123456")']:
            with self.subTest(formula=formula),self.assertRaises(ValueError):
                self.calculate(formula)

    def test_reviewed_numeric_functions_fail_closed_on_ambiguous_rounding(self):
        with self.assertRaises(ValueError):self.calculate('INT(month)',month='12')
        self.assertEqual(self.calculate('INT(-1.9)'),D(-1))
        self.assertEqual(self.calculate('ROUND(59/101*100,1)'),D('58.4'))
        self.assertEqual(self.calculate('ROUND(-1.26,1)'),D('-1.3'))
        for formula in ['INT("01")','ROUND(1.25,1)','ROUND(1,1.5)','ROUND(1,100)','ROUND(1,1,1)']:
            with self.subTest(formula=formula),self.assertRaises(ValueError):self.calculate(formula)

    def test_reviewed_month_name_replacement_and_unsupported_multiple_matches(self):
        for month in [1,9,10,12]:
            self.assertEqual(self.calculate('REPLACE(Names, "m_", "")',Names='m_'+str(month)),str(month))
        for value,pattern in [('m_m_','m_'),('m_1','')]:
            with self.assertRaises(ValueError):self.calculate('REPLACE(Names, Pattern, "")',Names=value,Pattern=pattern)

    def test_threshold_boundaries_and_lazy_branch(self):
        formula='IF(age < 26, "18-25", IF(age < 36, "26-35", "36+"))'
        for age,label in [(25,'18-25'),(26,'26-35'),(35,'26-35'),(36,'36+')]:
            self.assertEqual(self.calculate(formula,age=D(age)),label)
        self.assertEqual(self.calculate('IF(x = 0, 0, 10/x)',x=D(0)),D(0))

    def test_decimal_arithmetic_precedence_and_field_case(self):
        self.assertEqual(self.calculate('(actual-budget)/budget*100',actual=D(110),budget=D(100)),D(10))
        self.assertEqual(self.calculate('1 + 2*3 - 4/2'),D(5))
        self.assertEqual(self.calculate('aBs(-x)',x=D('1.1')),D('1.1'))
        with self.assertRaisesRegex(ValueError,'Unknown'):self.calculate('X+1',x=D(1))

    def test_unreviewed_syntax_functions_and_types_stop_audit(self):
        for formula in ['exec("x")','Math.abs(x)','x; 1','IF(x,1,0)','1/0','1+"2"','IF(1<2,0)','x ** 2']:
            with self.subTest(formula=formula),self.assertRaises((ValueError,KeyError)):
                self.calculate(formula,x=D(1))


if __name__ == '__main__':unittest.main()
