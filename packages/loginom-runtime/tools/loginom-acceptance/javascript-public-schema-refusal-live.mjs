// Fixed owned refusals only. Existing saved C/D package, ordinary headed.
import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-schema-refusal-live.mjs --case code-to-declared|declared-to-code --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; omit source, no editor mutation, no explicit Execute or Save.');
else{
  if(index<0||args.lastIndexOf('--case')!==index||!['code-to-declared','declared-to-code'].includes(args[index+1]))throw Error('Fixed public schema refusal case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))throw Error('Only assigned public schema refusal paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:args[index+1]==='code-to-declared'?'code':'declared',publicSchemaRefusalCaseId:args[index+1]});
}
