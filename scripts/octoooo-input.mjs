import fs from 'node:fs';
import { octooooInput } from '../packages/core/dist/index.js';
const args = process.argv.slice(2);
const value = name => { const i=args.indexOf(name); if(i<0 || !args[i+1])throw new Error('Missing '+name); return args[i+1]; };
const snapshot=JSON.parse(fs.readFileSync(value('--snapshot'),'utf8'));
const mapping=JSON.parse(fs.readFileSync(value('--mapping'),'utf8'));
const result=octooooInput(snapshot,mapping);
if(args.includes('--push')) {
  const origin=new URL(value('--core'));
  if(origin.protocol!=='https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/')throw new Error('Explicit HTTPS core origin required');
  const token=process.env.AINDLE_OCTOOOO_SOURCE_TOKEN;
  if(!token)throw new Error('Source ingestion token required');
  for(const [route, rows] of [['/v2/source-observations',result.observations],['/v2/aindle/usage',result.usage]]) {
    for(const row of rows) {
      const response=await fetch(origin.origin+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(row),redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Input rejected ('+response.status+')');
    }
  }
  process.stdout.write(JSON.stringify({observations:result.observations.length,usage:result.usage.length,skipped:result.skipped.length})+'\n');
} else {
  fs.writeFileSync(value('--output'),JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
}
