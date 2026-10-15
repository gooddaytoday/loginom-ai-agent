import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-cancel-resume-live.mjs --case cancel-resume-code --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; fixed read-only local cancel/SAME-ID continuation/native Stop/NEW same-node repair; no Save.');
else {
  if(index<0||args.lastIndexOf('--case')!==index||args[index+1]!=='cancel-resume-code')throw Error('Fixed public cancel/resume case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))
    throw Error('Only assigned public cancel/resume paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:'code',publicCancelResumeCaseId:'cancel-resume-code'});
}
