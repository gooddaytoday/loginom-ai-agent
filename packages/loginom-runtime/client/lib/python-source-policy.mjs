import {createHash} from 'node:crypto';

// Static admission of model-supplied Python before any node mutation. The code
// runs on the shared Loginom server: only computation modules are admitted, no
// files, network, processes, environments or reflection. Not a sandbox.
export const PYTHON_MODULE_POLICY='python-module-v1';
// The wizard editor is replaced through the bounded replace_expression gesture.
export const PYTHON_SOURCE_LIMITS=Object.freeze({utf16:2048,lines:128});
export const PYTHON_ALLOWED_MODULES=Object.freeze(['builtin_data','builtin_pandas_utils','pandas','numpy','math','cmath','datetime','decimal','fractions',
  'statistics','re','json','itertools','functools','collections','operator','string','typing','random']);
const FORBIDDEN_NAMES=new Set(['open','exec','eval','compile','__import__','importlib','globals','locals','vars','getattr','setattr','delattr',
  'breakpoint','input','help','exit','quit','memoryview','__builtins__']);
// pandas/numpy readers and writers reach files, URLs and the clipboard.
const FORBIDDEN_ATTRIBUTE=/^(?:read_\w+|to_(?:csv|excel|json|parquet|pickle|sql|html|hdf|feather|stata|xml|clipboard|latex|markdown|orc|gbq)|load|loadtxt|save|savez\w*|savetxt|genfromtxt|fromfile|tofile|memmap|DataSource|ExcelWriter|HDFStore)$/;

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

// Blank comments and plain string literals, keeping line structure. f-string
// bodies stay visible because their {expressions} execute.
export function pythonCodeSkeleton(source){
  let out='',i=0;
  while(i<source.length){
    const c=source[i];
    if(c==='#'){while(i<source.length&&source[i]!=='\n')i++;continue;}
    if(c==='"'||c==="'"){
      let prefix='';for(let j=out.length-1;j>=0&&/[A-Za-z]/.test(out[j])&&out.length-j<=2;j--)prefix=out[j]+prefix;
      const formatted=/f/i.test(prefix),raw=/r/i.test(prefix),triple=source.startsWith(c.repeat(3),i),quote=triple?c.repeat(3):c;
      let j=i+quote.length,body='';
      for(;;){
        if(j>=source.length)return {error:'unterminated_string'};
        if(!raw&&source[j]==='\\'){body+=source.slice(j,j+2);j+=2;continue;}
        if(source.startsWith(quote,j))break;
        if(!triple&&source[j]==='\n')return {error:'unterminated_string'};
        body+=source[j++];
      }
      out+=quote+(formatted?body:body.replace(/[^\n]/g,' '))+quote;i=j+quote.length;continue;
    }
    out+=c;i++;
  }
  return {code:out};
}

export function inspectPythonSourcePolicy(source){
  let identity;
  try{identity=pythonSourceIdentity(source);}catch{return refusal('source_bounds');}
  const skeleton=pythonCodeSkeleton(source);
  if(skeleton.error)return refusal(skeleton.error);
  const lines=skeleton.code.split('\n');
  for(const [index,line] of lines.entries()){
    const at=index+1,statements=line.split(';');
    for(const statement of statements){
      const from=/^\s*from\s+([.\w]+)\s+import\b/.exec(statement),imported=/^\s*import\s+(.+)$/.exec(statement);
      const modules=from?[from[1]]:imported?imported[1].split(',').map(part=>part.trim().split(/\s+as\s+/)[0].trim()):[];
      for(const module of modules)if(!PYTHON_ALLOWED_MODULES.includes(module.split('.')[0])||module.startsWith('.'))return refusal('module:'+module.slice(0,64),at);
      if(/\bimport\b/.test(statement)&&!from&&!imported)return refusal('import_form',at);
    }
    for(const match of line.matchAll(/(\.)?\s*\b([A-Za-z_]\w*)\b/g)){
      const name=match[2];
      if(/^__\w*__$/.test(name)||FORBIDDEN_NAMES.has(name))return refusal('name:'+name,at);
      if(match[1]&&FORBIDDEN_ATTRIBUTE.test(name))return refusal('attribute:'+name,at);
    }
  }
  return Object.freeze({status:'ADMITTED',policy:PYTHON_MODULE_POLICY,...identity});
}
