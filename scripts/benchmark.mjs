// Usage: node scripts/benchmark.mjs https://deployment.example
// Synthetic phrases only. Timing is measured at this caller and excludes audio.
// This is a review aid, not a native-speaker accuracy score.
import { readFileSync } from 'node:fs';
const base=new URL(process.argv[2]);
if(!['https:','http:'].includes(base.protocol))throw new Error('Expected HTTP(S) deployment URL');
const cases=JSON.parse(readFileSync(new URL('../tests/quality-cases.json',import.meta.url),'utf8'));
for(const item of cases){
  const started=performance.now();let firstTextMs=null,result,error;
  try{
    const response=await fetch(new URL('/api/translate',base),{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...item,stream:true,quality:'accurate'}),signal:AbortSignal.timeout(30_000)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    if(response.headers.get('content-type')?.includes('application/x-ndjson')){
      let buffer='';const decoder=new TextDecoder();
      for await(const chunk of response.body){
        buffer+=decoder.decode(chunk,{stream:true});let newline;
        while((newline=buffer.indexOf('\n'))>=0){
          const event=JSON.parse(buffer.slice(0,newline));buffer=buffer.slice(newline+1);
          if(event.type==='progress'&&event.translation&&firstTextMs===null)firstTextMs=Math.round(performance.now()-started);
          if(event.type==='done')result=event.result;
          if(event.type==='error')throw new Error(event.error);
        }
      }
      if(!result)throw new Error('Incomplete translation stream');
    }else result=await response.json();
  }catch(e){error=e.message}
  console.log(JSON.stringify({id:item.id,firstTextMs,totalMs:Math.round(performance.now()-started),result,error,review:item.review}));
}
