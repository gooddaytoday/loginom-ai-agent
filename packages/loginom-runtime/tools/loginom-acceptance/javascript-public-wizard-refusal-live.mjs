// Fixed native syntax/runtime refusal, owned discard and NEW same-node repair only.
import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-wizard-refusal-live.mjs --case syntax-code|syntax-declared|throw-code|throw-declared|import-code|syntax-details-code --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; fixed syntax, synchronous Error or missing builtIn/Data export diagnostic discovery and NEW same-node repair; two Execute/full6x4; no Save.');
else {
  if(index<0||args.lastIndexOf('--case')!==index||!['syntax-code','syntax-declared','throw-code','throw-declared','import-code','syntax-details-code'].includes(args[index+1]))
    throw Error('Fixed public wizard refusal case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))
    throw Error('Only assigned public wizard refusal paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:args[index+1].endsWith('-declared')?'declared':'code',publicWizardRefusalCaseId:args[index+1]});
}
