const need=(v,m)=>{if(!v)throw Error('Database import: '+m);};
const text=(maxLength,description)=>({type:'string',minLength:1,maxLength,description});
export const databaseImportParametersSchema={type:'object',additionalProperties:false,properties:{
 database:{type:'object',additionalProperties:false,required:['database_path'],properties:{
  database_path:text(512,'Exact storage path of the SQLite .db file, e.g. /folder/people.db. Connection created or reused by this path.'),
  table:text(128,'mode=table: exact table or view name; whole object, all fields in source order.'),
  sql:text(8000,'mode=sql: one read-only SELECT; ORDER BY fixes row order; select/rename/reorder fields here.'),
 },description:'New import: database_path and table (mode table) or sql (mode sql). Existing {} keeps saved settings.'},
}};
// Tokens outside quoted literals/identifiers. Conservative: a keyword used as
// an unquoted identifier is refused; quote it or rename it in the query.
const WRITE=/\b(insert|update|delete|replace|upsert|create|drop|alter|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|load_extension)\b/i;
export function readOnlySelect(sql){
 if(typeof sql!=='string'||sql.length>8000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(sql))return false;
 const bare=sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]/g,' q ');
 if(/['"`[\]]/.test(bare)||/--|\/\*|\*\//.test(bare))return false;
 const body=bare.trim().replace(/;\s*$/,'');
 return /^select\b/i.test(body)&&!body.includes(';')&&!WRITE.test(body)&&!/[:@$?]\w*/.test(body.replace(/::/g,''))&&!/%\w+%/.test(body);
}
// Reason text only; readOnlySelect alone decides.
export function sqlRefusal(sql){
 const bare=typeof sql==='string'?sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]/g,' q '):'';
 if(/^\s*with\b/i.test(bare))return 'WITH is refused, even a reading one; write one SELECT with subqueries';
 const word=bare.match(WRITE)?.[1];
 if(word)return 'word '+JSON.stringify(word)+' outside quotes is refused; quote a column or table with that name ("'+word+'")';
 return 'sql must be exactly one read-only SELECT without comments, parameters, macros or a second statement';
}
export function validateDatabaseImportPath(path){
 need(typeof path==='string'&&path.length<=512&&/^\/(?!\/)/.test(path)&&/\.db$/i.test(path)&&!/[|*?%\\\x00-\x1f]/.test(path)
  &&path.split('/').slice(1).every(s=>s&&s!=='.'&&s!=='..'),'database_path must be one absolute storage path of a .db file');
 return path;
}
export function validateDatabaseImportParameters(p,mode,r){
 need(['table','sql'].includes(mode),'mode must be table or sql');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='database'),'only parameters.database is supported');
 const d=p.database;
 if(d===undefined)need(r.target?.kind==='existing','a new import requires database.database_path and table (mode table) or sql (mode sql)');
 else{
  need(d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).every(k=>['database_path','table','sql'].includes(k)),'database accepts database_path, table and sql only; filters, parameters, macros, field subsets and other DBMS are outside this stage; use mode sql to choose or reorder fields');
  validateDatabaseImportPath(d.database_path);
  if(mode==='table'){
   need(d.sql===undefined&&typeof d.table==='string'&&d.table.trim()===d.table&&d.table.length>0&&d.table.length<=128&&!/[\x00-\x1f;]/.test(d.table),'mode table requires one exact table or view name and no sql');
  }else{
   need(d.table===undefined&&typeof d.sql==='string','mode sql requires sql and no table');
   need(readOnlySelect(d.sql),'sql must be exactly one read-only SELECT without comments, parameters, macros or a second statement ('+sqlRefusal(d.sql)+'); nothing was changed');
  }
 }
 need(r.inputs.length===0&&!(r.variable_inputs??[]).length,'import has no table input; connect nothing to it');
 need(r.mappings.length===0,'output mapping edits are outside this stage');
 need(['done','execute','close'].includes(r.finish)&&r.read.ports.length<=1&&r.read.ports.every(port=>port===0),'only output 0 is available');
 need(r.finish==='execute'||r.read.ports.length===0,'reading output 0 requires finish execute');
}
