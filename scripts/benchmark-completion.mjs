// Synthetic delayed-EOF comparison; no provider calls or credentials.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const baseline=process.argv[2]||'e6f51f4942e188adca9cc0aca41c47d819dceffb';
const sources=[['original',execFileSync('git',['show',`${baseline}:lib/translation-stream.js`],{encoding:'utf8'})],
  ['changed',readFileSync(new URL('../lib/translation-stream.js',import.meta.url),'utf8')]];
const rows=[];
for(const [version,code] of sources){
  const {readCompletionStream}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  for(let i=0;i<3;i++){
    let timer,cancelled=false;
    const body=new ReadableStream({start(c){
      c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Synthetic"}}]}\n\ndata: [DONE]\n\n'));
      timer=setTimeout(()=>c.close(),250);
    },cancel(){clearTimeout(timer);cancelled=true;}});
    const started=performance.now();await readCompletionStream(body,()=>{});
    rows.push({version,tailDelayMs:250,elapsedMs:Math.round((performance.now()-started)*100)/100,cancelled});
  }
}
console.log(JSON.stringify(rows,null,2));
