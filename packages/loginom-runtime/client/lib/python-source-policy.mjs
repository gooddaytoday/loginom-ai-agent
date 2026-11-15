import {createHash} from 'node:crypto';

// Static admission of model-supplied Python before any node mutation. The code
// runs on the shared Loginom server: only computation modules are imported,
// their members are allowlisted, and known file, network, process and
// reflection names are refused anywhere. Object members stay under that
// denylist over source text, not a sandbox: unknown routes are not proven absent.
export const PYTHON_MODULE_POLICY='python-module-v1';
// The wizard editor is replaced through the bounded replace_expression gesture.
export const PYTHON_SOURCE_LIMITS=Object.freeze({utf16:2048,lines:128});
export const PYTHON_ALLOWED_MODULES=Object.freeze(['builtin_data','builtin_pandas_utils','pandas','numpy','math','cmath','datetime','decimal','fractions',
  'statistics','re','json','itertools','functools','collections','random']);
// Allowed top-level names of each admitted module (python-module-v1). A name
// that is also a key here is a submodule whose members are listed in turn.
const names=text=>Object.freeze(new Set(text.trim().split(/\s+/)));
const OFFSETS=names(`DateOffset Day Hour Minute Second Milli Micro Nano Week WeekOfMonth LastWeekOfMonth MonthEnd MonthBegin SemiMonthEnd
  SemiMonthBegin QuarterEnd QuarterBegin YearEnd YearBegin BusinessDay BDay CustomBusinessDay BusinessMonthEnd BusinessMonthBegin BMonthEnd
  BMonthBegin BQuarterEnd BQuarterBegin BYearEnd BYearBegin BusinessHour Easter Tick`);
export const PYTHON_MODULE_NAMES=Object.freeze({
  builtin_data:names(`InputTable InputTables InputVariables OutputTable OutputTables DataType DataKind UsageType ColumnInfo ColumnClass
    InputColumnClass OutputColumnClass ConfigurableOutputColumnClass ColumnsClass DataSourceClass OutputTableClass ConfigurableOutputTableClass
    VariableClass VariableItemsClass VariablesClass`),
  builtin_pandas_utils:names('to_data_frame prepare_compatible_table fill_table'),
  pandas:names(`DataFrame Series Index MultiIndex RangeIndex DatetimeIndex TimedeltaIndex PeriodIndex CategoricalIndex IntervalIndex Categorical
    CategoricalDtype Interval Period Timestamp Timedelta DateOffset NA NaT NamedAgg Grouper IndexSlice concat merge merge_asof merge_ordered
    to_datetime to_numeric to_timedelta isna isnull notna notnull date_range bdate_range period_range timedelta_range interval_range cut qcut
    pivot pivot_table crosstab melt wide_to_long lreshape get_dummies from_dummies factorize unique value_counts array json_normalize infer_freq
    Int8Dtype Int16Dtype Int32Dtype Int64Dtype UInt8Dtype UInt16Dtype UInt32Dtype UInt64Dtype Float32Dtype Float64Dtype BooleanDtype StringDtype
    DatetimeTZDtype PeriodDtype IntervalDtype SparseDtype ArrowDtype offsets tseries api`),
  'pandas.api':names('types'),
  'pandas.api.types':names(`is_numeric_dtype is_integer_dtype is_float_dtype is_bool_dtype is_string_dtype is_object_dtype is_datetime64_dtype
    is_datetime64_any_dtype is_timedelta64_dtype is_complex_dtype is_signed_integer_dtype is_unsigned_integer_dtype is_any_real_numeric_dtype
    is_extension_array_dtype is_dtype_equal is_list_like is_dict_like is_scalar is_number is_integer is_float is_bool is_hashable is_re
    is_iterator infer_dtype pandas_dtype union_categoricals CategoricalDtype`),
  'pandas.tseries':names('offsets frequencies'),
  'pandas.offsets':OFFSETS,'pandas.tseries.offsets':OFFSETS,
  'pandas.tseries.frequencies':names('to_offset'),
  numpy:names(`array asarray asanyarray ascontiguousarray copy zeros ones empty full zeros_like ones_like empty_like full_like arange linspace
    logspace geomspace eye identity diag diagonal meshgrid indices mgrid ogrid r_ c_ s_ newaxis fromiter fromfunction where select choose piecewise
    clip nan inf pi e euler_gamma isnan isinf isfinite isnat isneginf isposinf isclose allclose array_equal array_equiv isreal iscomplex isscalar
    round around rint floor ceil trunc fix abs absolute fabs sign signbit copysign sqrt cbrt square power float_power exp exp2 expm1 log log2
    log10 log1p logaddexp logaddexp2 sin cos tan arcsin arccos arctan arctan2 sinh cosh tanh arcsinh arccosh arctanh asin acos atan atan2 asinh
    acosh atanh hypot degrees radians deg2rad rad2deg add subtract multiply divide true_divide floor_divide mod remainder fmod divmod modf frexp
    ldexp negative positive reciprocal maximum minimum fmax fmin heaviside sinc gcd lcm nextafter spacing sum prod cumsum cumprod cumulative_sum
    cumulative_prod nansum nanprod nancumsum nancumprod mean nanmean median nanmedian average std nanstd var nanvar min max amin amax nanmin nanmax
    ptp percentile nanpercentile quantile nanquantile argmin argmax nanargmin nanargmax argsort sort lexsort partition argpartition searchsorted
    unique unique_values unique_counts unique_inverse unique_all bincount histogram histogram2d histogram_bin_edges digitize diff ediff1d gradient
    trapezoid interp cov corrcoef correlate convolve dot vdot inner outer matmul cross tensordot einsum kron trace transpose swapaxes moveaxis
    reshape ravel squeeze expand_dims concatenate concat stack vstack hstack column_stack dstack split array_split hsplit vsplit tile repeat flip
    fliplr flipud roll rot90 append insert delete resize atleast_1d atleast_2d atleast_3d broadcast_to broadcast_arrays count_nonzero nonzero
    flatnonzero argwhere take put place extract compress triu tril any all logical_and logical_or logical_not logical_xor equal not_equal
    greater greater_equal less less_equal isin intersect1d union1d setdiff1d setxor1d polyfit polyval poly1d roots nan_to_num real imag conj
    conjugate angle apply_along_axis vectorize unravel_index ravel_multi_index ndindex ndenumerate shape size ndim errstate iinfo finfo
    issubdtype result_type promote_types can_cast dtype ndarray generic number integer signedinteger unsignedinteger floating complexfloating
    int_ uint isdtype int8 int16 int32 int64 uint8 uint16 uint32 uint64 intp uintp float16 float32 float64 longdouble complex64 complex128 bool bool_ str_ bytes_
    object_ datetime64 timedelta64 is_busday busday_count busday_offset datetime_as_string array2string array_repr random linalg ma fft`),
  'numpy.random':names(`default_rng Generator RandomState PCG64 SeedSequence seed rand randn randint random random_sample choice shuffle
    permutation normal standard_normal uniform binomial poisson exponential beta gamma lognormal multinomial multivariate_normal triangular
    geometric chisquare laplace logistic weibull pareto standard_t hypergeometric negative_binomial`),
  'numpy.linalg':names(`norm vector_norm matrix_norm inv pinv det slogdet solve lstsq eig eigh eigvals eigvalsh svd svdvals qr cholesky
    matrix_rank matrix_power cond multi_dot tensorsolve tensorinv matmul outer cross trace diagonal vecdot matrix_transpose LinAlgError`),
  'numpy.ma':names(`masked_array MaskedArray array masked nomask masked_where masked_invalid masked_equal masked_not_equal masked_greater
    masked_greater_equal masked_less masked_less_equal masked_inside masked_outside masked_values getmask getmaskarray getdata filled is_masked
    count mean median sum prod std var min max average where compressed`),
  'numpy.fft':names('fft ifft rfft irfft fft2 ifft2 rfft2 irfft2 fftn ifftn rfftn irfftn fftfreq rfftfreq fftshift ifftshift'),
  math:names(`acos acosh asin asinh atan atan2 atanh cbrt ceil comb copysign cos cosh degrees dist e erf erfc exp exp2 expm1 fabs factorial
    floor fma fmod frexp fsum gamma gcd hypot inf isclose isfinite isinf isnan isqrt lcm ldexp lgamma log log10 log1p log2 modf nan nextafter
    perm pi pow prod radians remainder sin sinh sqrt sumprod tan tanh tau trunc ulp`),
  cmath:names(`acos acosh asin asinh atan atanh cos cosh e exp inf infj isclose isfinite isinf isnan log log10 nan nanj phase pi polar rect sin
    sinh sqrt tan tanh tau`),
  datetime:names('date datetime time timedelta timezone tzinfo MINYEAR MAXYEAR UTC'),
  decimal:names(`Decimal Context localcontext getcontext setcontext BasicContext ExtendedContext DefaultContext ROUND_HALF_UP ROUND_HALF_EVEN
    ROUND_HALF_DOWN ROUND_UP ROUND_DOWN ROUND_CEILING ROUND_FLOOR ROUND_05UP DecimalException InvalidOperation DivisionByZero Overflow Underflow
    Inexact Rounded Subnormal Clamped FloatOperation MAX_PREC MAX_EMAX MIN_EMIN MIN_ETINY`),
  fractions:names('Fraction'),
  statistics:names(`mean fmean geometric_mean harmonic_mean median median_low median_high median_grouped mode multimode quantiles pstdev
    pvariance stdev variance covariance correlation linear_regression NormalDist StatisticsError`),
  re:names(`compile search match fullmatch split findall finditer sub subn escape Pattern Match error PatternError NOFLAG ASCII A IGNORECASE I LOCALE L
    MULTILINE M DOTALL S VERBOSE X UNICODE U`),
  json:names('loads dumps JSONDecodeError JSONDecoder JSONEncoder'),
  itertools:names(`accumulate batched chain combinations combinations_with_replacement compress count cycle dropwhile filterfalse groupby islice
    pairwise permutations product repeat starmap takewhile tee zip_longest`),
  functools:names('reduce partial partialmethod lru_cache cache cached_property total_ordering wraps cmp_to_key singledispatch singledispatchmethod'),
  collections:names('Counter defaultdict OrderedDict deque namedtuple ChainMap UserDict UserList UserString abc'),
  'collections.abc':names(`Iterable Iterator Generator Sequence MutableSequence Mapping MutableMapping Set MutableSet Hashable Sized Container
    Collection Callable Reversible`),
  random:names(`random randint randrange choice choices shuffle sample uniform gauss normalvariate triangular betavariate expovariate
    gammavariate lognormvariate vonmisesvariate paretovariate weibullvariate binomialvariate seed getrandbits randbytes Random`),
});
// Admitted modules re-export os/sys (random._os, statistics.sys, re.enum.sys):
// those names, sys.modules and process calls are refused as any identifier, as
// is DataFrame.query (engine='python' evaluates @-names from its string).
const FORBIDDEN_NAMES=new Set(['open','exec','eval','compile','__import__','importlib','globals','locals','vars','getattr','setattr','delattr',
  'breakpoint','input','help','exit','quit','memoryview','__builtins__','os','sys','modules','subprocess','pickle','builtins','system','popen','query']);
// pandas/numpy readers, writers and submodules reach files, URLs, the clipboard
// and native code. Refused as any identifier: `from x import name` and a line
// break after the dot bind them without a preceding dot.
const FORBIDDEN_ATTRIBUTE=/^(?:read_\w+|to_(?:csv|excel|json|parquet|pickle|sql|html|hdf|feather|stata|xml|clipboard|latex|markdown|orc|gbq|string)|load|loadtxt|save|savez\w*|savetxt|genfromtxt|fromfile|tofile|memmap|open_memmap|dump|urlopen|DataSource|ExcelWriter|HDFStore|io|lib|f2py|testing|ctypeslib)$/;
const DUNDER=/(?<![A-Za-z0-9])__\w+__/;

const refusal=(reason,line=null)=>Object.freeze({status:'REFUSED',policy:PYTHON_MODULE_POLICY,reason,...(line?{line}:{})});

// Saved/template code read back from the editor: identity without input bounds.
export function pythonObservedIdentity(source){
  if(typeof source!=='string')throw Error('Python observed source unavailable');
  return Object.freeze({source_sha256:createHash('sha256').update(source,'utf8').digest('hex'),source_utf8_bytes:Buffer.byteLength(source,'utf8'),source_lf_lines:source.split('\n').length});
}
export function pythonSourceIdentity(source){
  if(typeof source!=='string'||/[\r\0]/u.test(source)||!source.isWellFormed())throw Error('Python source characters refused: LF text without CR/NUL required');
  const lines=source.split('\n').length;
  if(source.length>PYTHON_SOURCE_LIMITS.utf16||lines>PYTHON_SOURCE_LIMITS.lines)
    throw Error('Python source bounds refused: at most '+PYTHON_SOURCE_LIMITS.utf16+' characters and '+PYTHON_SOURCE_LIMITS.lines+' lines');
  return Object.freeze({source_sha256:createHash('sha256').update(source,'utf8').digest('hex'),source_utf8_bytes:Buffer.byteLength(source,'utf8'),source_lf_lines:lines});
}

// Blank comments and string literal text, keeping line structure. f-string
// {expressions} stay visible because they execute; their literal text is
// blanked. Literal text, joined so that split literals meet, is returned for
// the dunder check (str.format fields).
// f-strings follow Python 3.12 (PEP 701): a field is code, so a string literal
// inside it is read whole (any quote, nested f-strings recursively), `#` starts
// a comment, and fields inside the format spec after `:` are code. Anything the
// scanner cannot place is refused as fstring_braces, never skipped.
// Escapes decoded for that check; a named \N{…} counts as an underscore.
const unescape=text=>text.replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|([0-7]{1,3})|N\{[^}]*\})/g,
  (all,x,u,U,o)=>{const code=parseInt(x??u??U??o??'5f',x||u||U?16:o?8:16);return code<=0x10ffff?String.fromCodePoint(code):'_';});
const STRING_PREFIX=/^(?:[rRuUbBfF]|[rR][bBfF]|[bBfF][rR])$/;
const blank=text=>text.replace(/[^\n]/g,' ');
// Length of the backslash sequence at i inside f-string literal text: `\{` and
// `\}` do not escape the brace, a named \N{…} (not raw) is one escape.
function fstringEscape(source,i,raw){
  const next=source[i+1];
  if(next==='{'||next==='}')return 1;
  const named=!raw&&next==='N'&&source[i+2]==='{'?source.indexOf('}',i):-1;
  return named>0&&!source.slice(i,named).includes('\n')?named+1-i:2;
}
// Literal at source[i] (a quote) with the given prefix: {end, kept} or {error}.
function readString(source,i,prefix,strings){
  const c=source[i],raw=/r/i.test(prefix),triple=source.startsWith(c.repeat(3),i),quote=triple?c.repeat(3):c;
  let j=i+quote.length;
  if(/f/i.test(prefix)){
    let kept='',literal='';
    for(;;){
      if(j>=source.length)return {error:'unterminated_string'};
      if(source.startsWith(quote,j))break;
      const ch=source[j];
      if(ch==='\\'){const n=fstringEscape(source,j,raw),piece=source.slice(j,j+n);literal+=piece;kept+=blank(piece);j+=n;continue;}
      if((ch==='{'||ch==='}')&&source[j+1]===ch){literal+=ch;kept+='  ';j+=2;continue;}
      if(ch==='}')return {error:'fstring_braces'};
      if(ch==='{'){const field=readField(source,j+1,quote,raw,strings);if(field.error)return field;kept+='{'+field.code+'}';j=field.end+1;continue;}
      if(!triple&&ch==='\n')return {error:'unterminated_string'};
      literal+=ch;kept+=blank(ch);j++;
    }
    strings.push(raw?literal:unescape(literal));
    return {end:j+quote.length,kept:quote+kept+quote};
  }
  let body='';
  for(;;){
    if(j>=source.length)return {error:'unterminated_string'};
    // A backslash never lets its next character end the literal, raw or not.
    if(source[j]==='\\'){body+=source.slice(j,j+2);j+=2;continue;}
    if(source.startsWith(quote,j))break;
    if(!triple&&source[j]==='\n')return {error:'unterminated_string'};
    body+=source[j++];
  }
  strings.push(raw?body:unescape(body));
  return {end:j+quote.length,kept:quote+blank(body)+quote};
}
// Code of the f-string field starting at i (after `{`): {code, end} with end
// at its closing `}`. `!conversion` and `:spec` start only outside brackets.
function readField(source,i,quote,raw,strings){
  let code='',depth=0;
  for(;;){
    if(i>=source.length)return {error:'fstring_braces'};
    const ch=source[i];
    if(ch==='#'){while(i<source.length&&source[i]!=='\n'){code+=' ';i++;}continue;}
    if(ch==='"'||ch==="'"){
      const word=/\w*$/.exec(code)[0],nested=readString(source,i,STRING_PREFIX.test(word)?word:'',strings);
      if(nested.error)return nested;
      code+=nested.kept;i=nested.end;continue;
    }
    if(ch==='('||ch==='['||ch==='{'){depth++;code+=ch;i++;continue;}
    if(ch===')'||ch===']'||ch==='}'&&depth>0){if(--depth<0)return {error:'fstring_braces'};code+=ch;i++;continue;}
    if(depth===0&&ch==='}')return {code,end:i};
    if(depth===0&&ch==='!'&&source[i+1]!=='='){
      const conversion=/^!\w*/.exec(source.slice(i))[0];code+=conversion;i+=conversion.length;
      if(source[i]!==':'&&source[i]!=='}')return {error:'fstring_braces'};
      continue;
    }
    if(depth===0&&ch===':'){
      code+=':';i++;
      // Format spec: literal text, `{…}` fields are code; the outer quote cannot appear.
      for(;;){
        if(i>=source.length||source.startsWith(quote,i)||quote.length===1&&source[i]==='\n')return {error:'fstring_braces'};
        const s=source[i];
        if(s==='}')return {code,end:i};
        if(s==='{'){const field=readField(source,i+1,quote,raw,strings);if(field.error)return field;code+='{'+field.code+'}';i=field.end+1;continue;}
        const n=s==='\\'?fstringEscape(source,i,raw):1,piece=source.slice(i,i+n);
        strings.push(raw?piece:unescape(piece));code+=blank(piece);i+=n;
      }
    }
    code+=ch;i++;
  }
}
// `literals` locates each top-level string that is not an f-string in `code`
// (quote at `at`); `plain` text has no escape and no bytes prefix.
export function pythonCodeSkeleton(source){
  let out='',i=0;const strings=[],literals=[];
  while(i<source.length){
    const c=source[i];
    if(c==='#'){while(i<source.length&&source[i]!=='\n')i++;continue;}
    if(c==='"'||c==="'"){
      // A prefix is the whole word before the quote (`or"…"` has none).
      const word=/\w*$/.exec(out)[0],prefix=STRING_PREFIX.test(word)?word:'',literal=readString(source,i,prefix,strings);
      if(literal.error)return {error:literal.error};
      if(!/f/i.test(prefix))literals.push({at:out.length,end:out.length+literal.kept.length,value:strings.at(-1),
        plain:!/b/i.test(prefix)&&!source.slice(i,literal.end).includes('\\')});
      out+=literal.kept;i=literal.end;continue;
    }
    out+=c;i++;
  }
  return {code:out,strings:strings.join(''),literals};
}

// Imports and module members are checked on tokens of the whole skeleton,
// so line breaks inside brackets, `\` continuations and spaces around the dot
// split neither a statement nor a chain. Stage `imports` admits only the
// modules of PYTHON_ALLOWED_MODULES (before the denylist, as `module:` reasons);
// stage `members` allowlists members (PYTHON_MODULE_NAMES): every
// `alias.name` chain and every `from m import name`. A module bound to a name
// may only be used as `alias.member`: assigning or passing it would let an
// unchecked name reach its members. Members of objects stay under the denylist.
function inspectModules(code,stage,literals){
  const members=stage==='members';
  const tokens=[...code.matchAll(/\\\n|\n|(?:\d|\.\d)[\w.]*|[A-Za-z_]\w*|\S/g)].filter(t=>t[0]!=='\\\n');
  const lineOf=index=>code.slice(0,tokens[index]?.index??code.length).split('\n').length;
  const word=index=>/^[A-Za-z_]/.test(tokens[index]?.[0]??'')?tokens[index][0]:null;
  const bound=new Map(),inImport=new Set(),imported=new Map();
  const bind=(name,target)=>{if(!bound.has(name))bound.set(name,new Set());bound.get(name).add(target);};
  // Module path from index: leading dots (relative) and dotted names.
  const path=index=>{
    let i=index,text='';
    while(tokens[i]?.[0]==='.'){text+='.';i++;}
    if(word(i)&&word(i)!=='import'){text+=word(i++);while(tokens[i]?.[0]==='.'&&word(i+1)){text+='.'+word(i+1);i+=2;}}
    return {text,next:i};
  };
  // Refusal for a module path: outside the allowed modules, or (members) a segment that is no allowlisted submodule.
  const refusePath=(text,index)=>{
    const parts=text.split('.');
    if(text.startsWith('.')||!PYTHON_ALLOWED_MODULES.includes(parts[0]))return refusal('module:'+text.slice(0,64),lineOf(index));
    if(members)for(let k=1;k<parts.length;k++)if(!PYTHON_MODULE_NAMES[parts.slice(0,k+1).join('.')])
      return refusal('attribute:'+parts.slice(0,k).join('.')+'.'+parts[k].slice(0,64),lineOf(index));
    return null;
  };
  for(let i=0;i<tokens.length;i++){
    const keyword=word(i);
    if(tokens[i-1]?.[0]==='.'||keyword!=='from'&&keyword!=='import')continue;
    if(keyword==='from'){
      const module=path(i+1);
      if(!module.text||word(module.next)!=='import')continue;
      const refused=refusePath(module.text,i+1);if(refused)return refused;
      const allowed=PYTHON_MODULE_NAMES[module.text];
      let j=module.next+1;const paren=tokens[j]?.[0]==='(';if(paren)j++;
      for(;j<tokens.length;j++){
        const t=tokens[j][0];
        if(t==='\n'&&paren||t===',')continue;
        if(t===')'||t==='\n'||t===';')break;
        if(t==='*'){if(members)return refusal('attribute:'+module.text+'.*',lineOf(j));continue;}
        const name=word(j);if(!name)return refusal('import_form',lineOf(j));
        if(members&&!allowed.has(name))return refusal('attribute:'+module.text+'.'+name.slice(0,64),lineOf(j));
        let alias=name;if(word(j+1)==='as'&&word(j+2)){alias=word(j+2);j+=2;}
        bind(alias,PYTHON_MODULE_NAMES[module.text+'.'+name]?module.text+'.'+name:'');imported.set(alias,module.text+'.'+name);
      }
      for(let k=i;k<j;k++)inImport.add(tokens[k]);i=j;continue;
    }
    let j=i+1;
    for(;j<tokens.length;j++){
      const t=tokens[j][0];
      if(t===',')continue;
      if(t==='\n'||t===';')break;
      const module=path(j);if(!module.text)return refusal('import_form',lineOf(j));
      const refused=refusePath(module.text,j);if(refused)return refused;
      const base=module.text.split('.')[0];
      if(word(module.next)==='as'&&word(module.next+1)){bind(word(module.next+1),module.text);j=module.next+1;}
      else{bind(base,base);j=module.next-1;}
    }
    for(let k=i;k<j;k++)inImport.add(tokens[k]);i=j;
  }
  if(!members)return null;
  for(const [name,targets] of bound){
    const modules=[...targets].filter(Boolean);
    if(modules.length&&targets.size>1)return refusal('alias:'+name.slice(0,64));
  }
  // Line breaks inside brackets do not split a chain: walk the tokens without them.
  const flat=tokens.filter(t=>t[0]!=='\n'),at=index=>/^[A-Za-z_]/.test(flat[index]?.[0]??'')?flat[index][0]:null;
  const lineAt=index=>code.slice(0,flat[index].index).split('\n').length;
  const reCompile=new Set();
  for(let i=0;i<flat.length;i++){
    const name=at(i),targets=name&&!inImport.has(flat[i])&&flat[i-1]?.[0]!=='.'&&bound.get(name);
    // A string prefix (`f"…"` with `import fractions as f`) is not a reference.
    if(!targets||targets.has('')||/^["']/.test(code[flat[i].index+name.length]??''))continue;
    let path=[...targets][0],j=i;
    while(PYTHON_MODULE_NAMES[path]){
      const member=flat[j+1]?.[0]==='.'&&at(j+2);
      if(!member)return refusal('module_value:'+path,lineAt(i));
      if(!PYTHON_MODULE_NAMES[path].has(member))return refusal('attribute:'+path+'.'+member.slice(0,64),lineAt(j+2));
      if(path==='re'&&member==='compile')reCompile.add(flat[j+2]);
      path+='.'+member;j+=2;
    }
  }
  // The builtin compile stays refused: `.compile` passes the denylist only as re.compile.
  for(const [index,token] of flat.entries())if(token[0]==='compile'&&!reCompile.has(token))return refusal('name:compile',lineAt(index));
  return inspectDispatch(code,literals,bound,imported);
}

// pandas dispatchers call getattr(obj, name)(*args, **kwargs) for a string
// function argument (core/apply.py _apply_str, groupby/generic.py aggregate and
// filter, groupby/groupby.py apply): agg/aggregate/transform/apply/filter of
// frames, series, groupby, window and resample objects, and aggfunc of
// pivot_table, crosstab and NamedAgg. Such a call must be written directly, its
// function arguments being an aggregation literal, a lambda, an undecorated
// def, an allowed builtin or from-import never rebound, a module function or a
// str/int/float method; lists, tuples and dict values of those. Everything else,
// a string variable included, is refused as dispatch:<method>.
const DISPATCH=new Set(['agg','aggregate','transform','apply','filter','pivot_table','crosstab','NamedAgg']);
const DISPATCH_IMPORTS=new Map([['pandas.pivot_table','pivot_table'],['pandas.crosstab','crosstab'],['pandas.NamedAgg','NamedAgg']]);
// The card's list and pandas/core/groupby/base.py reduction and transformation kernels.
const AGGREGATIONS=names(`sum mean median min max count size std var sem first last nunique prod any all idxmin idxmax quantile skew kurt
  cumsum cumprod cummin cummax cumcount rank shift diff pct_change ffill bfill ngroup`);
const BUILTIN_FUNCTIONS=names('len str int float abs round bool sum min max list set tuple sorted');
const TYPE_HEADS=new Set(['str','int','float']),REFUSED_METHODS=new Set(['format','format_map','maketrans']);
const KEYWORDS=names(`False None True and as assert async await break class continue def del elif else except finally for from global if
  import in is lambda nonlocal not or pass raise return try while with yield`);
const OPEN=new Set(['(','[','{']),CLOSE=new Set([')',']','}']);
function inspectDispatch(code,literals,bound,imported){
  // Tokens with each plain-or-not string literal as one `"` token.
  const starts=new Map(literals.map(l=>[l.at,l])),tokens=[],pattern=/\\\n|\n|(?:\d|\.\d)[\w.]*|[A-Za-z_]\w*|\S/g;
  for(let m;(m=pattern.exec(code));){
    if(m[0]==='\\\n')continue;
    const literal=starts.get(m.index)??(STRING_PREFIX.test(m[0])?starts.get(m.index+m[0].length):undefined);
    if(literal){tokens.push({t:'"',index:m.index,literal});pattern.lastIndex=literal.end;continue;}
    tokens.push({t:m[0],index:m.index});
  }
  const tok=i=>tokens[i]?.t,isName=i=>/^[A-Za-z_]/.test(tok(i)??'')&&!KEYWORDS.has(tok(i));
  const depth=[],open=[],match=new Map(),stack=[];
  for(const [i,{t}] of tokens.entries()){
    if(CLOSE.has(t)){const o=stack.pop();if(o!==undefined)match.set(o,i);}
    depth[i]=stack.length;open[i]=stack.at(-1)??-1;
    if(OPEN.has(t))stack.push(i);
  }
  const lineAt=i=>code.slice(0,tokens[i]?.index??code.length).split('\n').length;
  // Newlines inside brackets join lines; at depth 0 they end a statement.
  const next=i=>{let j=i+1;while(tok(j)==='\n'&&depth[j]>0)j++;return j;};
  const prev=i=>{let j=i-1;while(tok(j)==='\n'&&depth[j]>0)j--;return j;};
  const statement=i=>{let j=i;while(j<tokens.length&&!(depth[j]===0&&(tok(j)==='\n'||tok(j)===';')))j++;return j;};
  // Binding positions a name check must not trust: lambda parameters, for
  // targets, class headers and case patterns; imports and decorated defs.
  const binding=new Set(),imports=new Set(),decorated=new Set();
  let decorator=false;
  for(let i=0;i<tokens.length;i++){
    const t=tok(i);
    if(t==='lambda'||t==='for'){
      let pending=1,j=i+1;
      for(;j<tokens.length;j++){
        if(depth[j]<depth[i]||depth[j]===0&&tok(j)==='\n')break;
        if(depth[j]>depth[i])continue;
        if(t==='lambda'&&tok(j)==='lambda')pending++;
        if(t==='lambda'?tok(j)===':'&&!--pending:tok(j)==='in')break;
      }
      for(let k=i+1;k<j;k++)binding.add(k);
    }
    if(depth[i]!==0||i>0&&tok(i-1)!=='\n'&&tok(i-1)!==';'||t==='\n')continue;
    const end=statement(i);
    if(t==='import'||t==='from')for(let k=i;k<end;k++)imports.add(k);
    if(t==='class'||t==='case')for(let k=i;k<end;k++)binding.add(k);
    if(t==='@'){decorator=true;continue;}
    if(decorator&&(t==='def'||t==='async'))decorated.add(t==='def'?i+1:i+2);
    decorator=false;
  }
  const isCall=o=>{
    if(tok(o)!=='(')return false;
    const p=prev(o);
    return tok(p)===')'||tok(p)===']'||isName(p)&&tok(prev(p))!=='def'&&tok(prev(p))!=='class';
  };
  const items=o=>{
    const close=match.get(o),d=depth[o]+1,out=[[]];
    for(let j=o+1;j<close;j++){if(tok(j)==='\n')continue;if(tok(j)===','&&depth[j]===d){out.push([]);continue;}out.at(-1).push(j);}
    return out;
  };
  const whole=el=>OPEN.has(tok(el[0]))&&match.get(el[0])===el.at(-1);
  const names=[];
  // name(.name)*: module function, str/int/float method, literal method, or a name checked below.
  const chain=el=>{
    if(el.length%2===0)return false;
    for(let k=1;k<el.length;k+=2)if(tok(el[k])!=='.'||!/^[A-Za-z_]/.test(tok(el[k+1])??''))return false;
    const parts=el.filter((_,k)=>k%2===0).map(tok),head=tokens[el[0]];
    if(head.literal)return parts.length===2&&!REFUSED_METHODS.has(parts[1]);
    if(!isName(el[0]))return false;
    const module=[...bound.get(head.t)??[]].find(Boolean);
    if(module){
      let path=module,k=1;
      while(PYTHON_MODULE_NAMES[path]?.has(parts[k]))path+='.'+parts[k++];
      return k>1&&k===parts.length&&!PYTHON_MODULE_NAMES[path];
    }
    if(parts.length===1||parts.length===2&&TYPE_HEADS.has(head.t)&&!REFUSED_METHODS.has(parts[1])){names.push(el[0]);return true;}
    return false;
  };
  const func=el=>{
    if(!el.length)return false;
    const first=el[0];
    if(tok(first)==='lambda')return true;
    if(el.length===1&&tokens[first].literal)return tokens[first].literal.plain&&AGGREGATIONS.has(tokens[first].literal.value);
    if(whole(el)){
      const parts=items(first),list=parts.at(-1).length?parts:parts.slice(0,-1);
      if(tok(first)==='{')return list.every(p=>{const colon=p.findIndex(j=>tok(j)===':'&&depth[j]===depth[first]+1);return colon>0&&func(p.slice(colon+1));});
      if(tok(first)==='('&&parts.length===1)return func(parts[0]);
      return list.every(func);
    }
    return chain(el);
  };
  // pandas.NamedAgg(...) as a value: its own arguments are checked as a dispatcher.
  const namedAgg=el=>{
    if(tok(el.at(-1))!==')')return false;
    const o=el.findIndex(j=>match.get(j)===el.at(-1)),callee=el.slice(0,o);
    if(o<1||tok(el[o])!=='(')return false;
    if(callee.length===1)return imported.get(tok(callee[0]))==='pandas.NamedAgg';
    const module=[...bound.get(tok(callee[0]))??[]].find(Boolean);
    return module==='pandas'&&callee.length===3&&tok(callee[1])==='.'&&tok(callee[2])==='NamedAgg';
  };
  // Names a failed alternative pushed are dropped.
  const attempt=(check,el)=>{const mark=names.length;if(check(el))return true;names.length=mark;return false;};
  const pair=el=>{
    if(!whole(el)||tok(el[0])!=='(')return false;
    const parts=items(el[0]).filter((p,k,all)=>p.length||k<all.length-1);
    return parts.length===2&&func(parts[1]);
  };
  const pending=[];
  for(let d=0;d<tokens.length;d++){
    if(imports.has(d))continue;
    const dotted=tok(prev(d))==='.',kind=dotted?DISPATCH.has(tok(d))&&tok(d):DISPATCH_IMPORTS.get(imported.get(tok(d)));
    if(!kind)continue;
    const refused=refusal('dispatch:'+kind,lineAt(d)),o=next(d);
    if(!dotted&&(binding.has(d)||['def','class'].includes(tok(prev(d)))))return refused;
    if(tok(o)!=='('||!match.has(o))return refused;
    const args=items(o).filter((p,k,all)=>p.length||k<all.length-1);
    if(args.some(a=>!a.length||tok(a[0])==='*'))return refused;
    const keyword=a=>a.length>1&&isName(a[0])&&tok(a[1])==='='&&tok(a[2])!=='=';
    const positional=args.filter(a=>!keyword(a)),keywords=new Map(args.filter(keyword).map(a=>[tok(a[0]),a.slice(2)]));
    const head=prev(prev(d)),module=dotted?[...bound.get(tok(head))??[]].find(Boolean)==='pandas'&&tok(prev(head))!=='.':true;
    const slots={agg:[positional[0],keywords.get('func')],aggregate:[positional[0],keywords.get('func')],
      transform:[positional[0],keywords.get('func'),keywords.get('arg')],apply:[positional[0],keywords.get('func')],
      filter:[positional[0],keywords.get('func')],
      // aggfunc is 5th of pd.pivot_table, 4th of df.pivot_table and 5th of the unbound DataFrame.pivot_table.
      pivot_table:[positional[4],module?null:positional[3],keywords.get('aggfunc')],
      crosstab:[positional[5],keywords.get('aggfunc')],NamedAgg:[positional[1],keywords.get('aggfunc')]}[kind].filter(Boolean);
    // DataFrame.filter takes column labels: a list or tuple literal passes there.
    if(!slots.every(el=>attempt(func,el)||kind==='filter'&&whole(el)&&(tok(el[0])==='['||tok(el[0])==='('&&items(el[0]).length>1)))return refused;
    // Without a function, agg/aggregate keywords are named aggregations.
    if((kind==='agg'||kind==='aggregate')&&!slots.length)
      for(const [key,value] of keywords)if(!['axis','engine','engine_kwargs'].includes(key)&&!attempt(func,value)&&!attempt(pair,value)&&!namedAgg(value))return refused;
    for(const k of names.splice(0))pending.push([k,refused]);
  }
  for(const [k,refused] of pending)if(!trusted(k))return refused;
  return null;
  // A name is trusted when it is an allowed builtin, an undecorated def or a
  // from-imported member, and every occurrence reads it: a call, an attribute,
  // a call argument or a dispatcher function argument.
  function trusted(k){
    const name=tok(k),slotNames=new Set(pending.map(([j])=>j));
    let defined=BUILTIN_FUNCTIONS.has(name)||imported.has(name)&&!PYTHON_MODULE_NAMES[imported.get(name)];
    for(let i=0;i<tokens.length;i++){
      if(tok(i)!==name||imports.has(i)||tok(prev(i))==='.')continue;
      if(binding.has(i))return false;
      if(tok(prev(i))==='def'){if(decorated.has(i))return false;defined=true;continue;}
      const n=tok(next(i));
      if(slotNames.has(i)||n==='('||n==='.'||(n===','||n===')')&&open[i]>=0&&isCall(open[i]))continue;
      return false;
    }
    return defined;
  }
}

export function inspectPythonSourcePolicy(source){
  let identity;
  try{identity=pythonSourceIdentity(source);}catch{return refusal('source_bounds');}
  const skeleton=pythonCodeSkeleton(source);
  if(skeleton.error)return refusal(skeleton.error);
  const imports=inspectModules(skeleton.code,'imports');
  if(imports)return imports;
  const lines=skeleton.code.split('\n');
  for(const [index,line] of lines.entries()){
    const at=index+1;
    // Python normalizes identifiers by NFKC (ｅｖａｌ is eval): code outside
    // strings and comments must be ASCII.
    if(/[^\x00-\x7f]/.test(line))return refusal('non_ascii',at);
    for(const match of line.matchAll(/\b([A-Za-z_]\w*)\b/g)){
      const name=match[1];
      // Leading underscore: private module members (random._os); `_` alone is a plain variable.
      // `.compile` is left to the member scan, which admits only re.compile.
      if(name==='compile'&&/\.\s*$/.test(line.slice(0,match.index)))continue;
      if(/^__\w*__$/.test(name)||FORBIDDEN_NAMES.has(name)||name.startsWith('_')&&name!=='_')return refusal('name:'+name,at);
      if(FORBIDDEN_ATTRIBUTE.test(name))return refusal('attribute:'+name,at);
    }
  }
  // str.format / Formatter fields reach attributes from string text.
  const dunder=DUNDER.exec(skeleton.strings);
  if(dunder)return refusal('string:'+dunder[0].slice(0,64));
  const member=inspectModules(skeleton.code,'members',skeleton.literals);
  if(member)return member;
  return Object.freeze({status:'ADMITTED',policy:PYTHON_MODULE_POLICY,...identity});
}
