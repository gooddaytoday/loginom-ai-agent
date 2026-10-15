// Fixed operator-only public type cases; no caller supplied Loginom source.
import {runJavascriptOperator} from './javascript-live.mjs';
import {javascriptPublicTypedIds} from './javascript-public-code-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help')){
  console.log('node javascript-public-types-live.mjs --case CASE --config PRIVATE --profile NEW --browser ABS --evidence NEW\nFixed code/declared public lifecycle, ordinary headed, no Save. CASE: '+javascriptPublicTypedIds.join(', '));
}else{
  if(index<0||args.lastIndexOf('--case')!==index||!javascriptPublicTypedIds.includes(args[index+1]))throw Error('Fixed public typed case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence'].includes(arg)))throw Error('Only assigned public typed paths permitted');
  const mode=args[index+1].startsWith('declared-')?'declared':'code';
  await runJavascriptOperator([...paths,'--execution-case',mode+'-table-execute','--verify-public-'+mode+'-lifecycle'],{publicProbeId:args[index+1]});
}
