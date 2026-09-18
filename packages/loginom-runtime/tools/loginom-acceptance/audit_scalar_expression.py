"""Small independent scalar auditor, never eval/exec or part of model execution.

Only reviewed arithmetic, comparisons, IF, ABS, numeric INT/ROUND and bounded
string operations are accepted. ROUND halfway cases stop pending native evidence.
An unknown expression stops the audit rather than guessing Loginom semantics.
"""
import json
import re
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_EVEN

from audit_sales_scenario import require

TOKEN = re.compile(r'\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|("(?:[^"\\]|\\.)*")|([A-Za-z_][A-Za-z_0-9]*)|(<=|>=|<>|==|[+*/(),<>=-]))')
PRECEDENCE = {'=':1, '==':1, '<>':1, '<':1, '>':1, '<=':1, '>=':1, '+':2, '-':2, '*':3, '/':3}


def parse_expression(formula):
    require(isinstance(formula,str) and 0 < len(formula) <= 8000, 'Bounded audit formula required')
    tokens, offset = [], 0
    while offset < len(formula.rstrip()):
        match = TOKEN.match(formula,offset)
        require(match is not None, 'Unsupported audit formula token at '+str(offset))
        number,string,name,operator = match.groups()
        tokens.append(('number',Decimal(number)) if number else ('string',json.loads(string)) if string else ('name',name) if name else ('op',operator))
        offset = match.end()
    position = 0
    def expression(minimum=0, depth=0):
        nonlocal position
        require(depth < 64 and position < len(tokens), 'Invalid or overly nested audit formula')
        kind,value = tokens[position];position += 1
        if kind in ('number','string'):
            left = ('constant',value)
        elif kind == 'name':
            if position < len(tokens) and tokens[position] == ('op','('):
                position += 1;arguments = [expression(0,depth+1)]
                while position < len(tokens) and tokens[position] == ('op',','):
                    position += 1;arguments.append(expression(0,depth+1))
                require(position < len(tokens) and tokens[position] == ('op',')'), 'Unclosed audit function')
                position += 1
                function = value.upper()
                arities = {'IF':(3,), 'ABS':(1,), 'REPLACE':(3,), 'INT':(1,), 'ROUND':(1,2),
                           'COUNT':(1,), 'SUBSTR':(3,), 'VAL':(1,)}
                require(function in arities and len(arguments) in arities[function], 'Unsupported audit function')
                left = (function,*arguments)
            else:
                left = ('field',value)
        elif kind == 'op' and value in ('+','-'):
            left = ('unary'+value,expression(4,depth+1))
        elif (kind,value) == ('op','('):
            left = expression(0,depth+1)
            require(position < len(tokens) and tokens[position] == ('op',')'), 'Unclosed audit parentheses')
            position += 1
        else:
            raise ValueError('Unsupported audit expression')
        while position < len(tokens):
            kind,operator = tokens[position]
            if kind != 'op' or operator not in PRECEDENCE or PRECEDENCE[operator] < minimum:
                break
            position += 1
            left = (operator,left,expression(PRECEDENCE[operator]+1,depth+1))
        return left
    tree = expression()
    require(position == len(tokens), 'Trailing audit formula tokens')
    return tree


def evaluate_expression(tree, row):
    operator = tree[0]
    if operator == 'constant': return tree[1]
    if operator == 'field':
        require(tree[1] in row, 'Unknown audit formula field: '+tree[1])
        return row[tree[1]]
    if operator == 'REPLACE':
        values=[evaluate_expression(t,row) for t in tree[1:]]
        require(all(isinstance(v,str) for v in values) and values[1] and values[0].count(values[1])<=1,
                'Only a single literal substring replacement has been reviewed')
        return values[0].replace(values[1],values[2])
    if operator == 'IF':
        condition = evaluate_expression(tree[1],row)
        require(type(condition) is bool, 'Audit IF requires a boolean condition')
        return evaluate_expression(tree[2] if condition else tree[3],row)
    left = evaluate_expression(tree[1],row)
    if operator in ('COUNT', 'SUBSTR', 'VAL'):
        # Loginom Help calc-func/string.md: Count counts characters, SubStr
        # takes source/start/length, Val is locale-dependent. Native task38
        # rollback/recovery confirmed SubStr("m_1",3,2)=="1". Restrict the
        # auditor to ASCII and locale-independent nonnegative integer text;
        # Unicode indexing, nulls, decimal separators and edge positions stop.
        require(isinstance(left,str) and left.isascii() and 0 < len(left) <= 1024,
                'Bounded nonempty ASCII string required for audit')
        if operator == 'COUNT': return Decimal(len(left))
        if operator == 'VAL':
            require(re.fullmatch(r'[0-9]{1,15}',left) is not None,
                    'Only locale-independent integer text is reviewed for VAL')
            return Decimal(left)
        start,length=[evaluate_expression(t,row) for t in tree[2:]]
        require(all(isinstance(v,Decimal) and v.is_finite() and v==v.to_integral_value() for v in (start,length))
                and 1 <= start <= len(left) and 1 <= length <= 1024,
                'Reviewed positive in-range SUBSTR bounds required')
        return left[int(start)-1:int(start)-1+int(length)]
    if operator == 'INT':
        # INT is not a string conversion: the live task38 run produced NULL
        # from month strings. Reject that domain; never invent numeric values.
        require(isinstance(left,Decimal) and left.is_finite(), 'Finite INT operand required')
        return left.to_integral_value(rounding=ROUND_DOWN)
    if operator == 'ROUND':
        places=evaluate_expression(tree[2],row) if len(tree)==3 else Decimal(0)
        require(isinstance(left,Decimal) and left.is_finite() and isinstance(places,Decimal)
                and places.is_finite() and places==places.to_integral_value() and -12<=places<=12,
                'Bounded finite ROUND operands required')
        scaled=abs(left.scaleb(int(places)))
        # Help specifies nearest rounding but not tie-breaking; never guess it.
        require(abs(scaled-scaled.to_integral_value(rounding=ROUND_DOWN)-Decimal('0.5'))>Decimal('1e-12'),
                'ROUND halfway case requires separately verified tie semantics')
        return left.quantize(Decimal(1).scaleb(-int(places)),rounding=ROUND_HALF_EVEN)
    if operator in ('ABS','unary+','unary-'):
        require(isinstance(left,Decimal) and left.is_finite(), 'Finite numeric audit operand required')
        return abs(left) if operator=='ABS' else -left if operator=='unary-' else left
    right = evaluate_expression(tree[2],row)
    if operator in ('+','-','*','/'):
        require(all(isinstance(v,Decimal) and v.is_finite() for v in (left,right)), 'Finite numeric audit operands required')
        if operator=='+': return left+right
        if operator=='-': return left-right
        if operator=='*': return left*right
        require(right != 0, 'Audit division by zero requires explicit null semantics')
        return left/right
    require(type(left) is type(right), 'Audit comparison types differ')
    return {'=':lambda:left==right,'==':lambda:left==right,'<>':lambda:left!=right,
            '<':lambda:left<right,'>':lambda:left>right,'<=':lambda:left<=right,'>=':lambda:left>=right}[operator]()
