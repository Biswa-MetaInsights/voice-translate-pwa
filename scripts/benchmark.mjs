// Synthetic text only; microphone capture is excluded. No response text is logged.
// Usage: node scripts/benchmark.mjs https://www.voicetranslator.eu [rounds=1] [curl|fetch]
import { readFileSync } from 'node:fs';
import { measure,measureFetch,summarize } from './benchmark-lib.mjs';
const base=new URL(process.argv[2]);
if(!['https:','http:'].includes(base.protocol)||base.username||base.password||base.search)throw new Error('Expected HTTP(S) origin without credentials or query');
const rounds=Number(process.argv[3]||1);
if(!Number.isInteger(rounds)||rounds<1||rounds>5)throw new Error('Rounds must be 1–5');
const cases=JSON.parse(readFileSync(new URL('../tests/quality-cases.json',import.meta.url),'utf8'));
const transport=process.argv[4]||'curl';
if(!['curl','fetch'].includes(transport))throw new Error('Transport must be curl or fetch');
const run=transport==='curl'?measure:measureFetch;
const rows=[];
console.log(JSON.stringify({type:'environment',node:process.version,connectionMode:transport==='curl'?'fresh-per-request':'fetch-pool-reuse',proxyConfigured:!!(process.env.HTTPS_PROXY||process.env.https_proxy),microphoneIncluded:false}));
for(let round=0;round<rounds;round++)for(const item of cases){
  const row={id:item.id,round,...await run(new URL('/api/translate',base).href,{...item,quality:'accurate'})};
  rows.push(row);console.log(JSON.stringify(row));
}
console.log(JSON.stringify({type:'summary',firstObserved:rows[0],subsequent:summarize(rows.slice(1)),all:summarize(rows)}));
if(rows.some(row=>!row.ok))process.exitCode=1;
