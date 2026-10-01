import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-new-done-live.mjs --case new-done-code|new-done-declared --config PRIVATE --profile NEW --browser ABS --evidence NEW\nOrdinary headed; new standalone Done, full source/settings/graph, exact retry and NEW preserve Execute/full6x4; no Save.');
else {
  if(index<0||args.lastIndexOf('--case')!==index||!['new-done-code','new-done-declared'].includes(args[index+1]))
    throw Error('Fixed public new Done case required');
  const mode=args[index+1].endsWith('-declared')?'declared':'code';
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence'].includes(arg)))
    throw Error('Only assigned public new Done paths permitted');
  await runJavascriptOperator([...paths,'--execution-case',mode+'-table-execute','--verify-public-'+mode+'-lifecycle'],
    {publicNewDoneMode:mode});
}
