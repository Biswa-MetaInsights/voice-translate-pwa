// A bounded worker pool prevents one slow phrase blocking all later requests.
// Results are committed in speaking order; pending phrases can be coalesced.
export class OrderedTranslationQueue {
  constructor({run,onProgress=()=>{},onCommit=()=>{},onPending=()=>{},concurrency=2}) {
    Object.assign(this,{run,onProgress,onCommit,onPending,concurrency});
    this.pending=[];this.active=new Map();this.finished=new Map();this.nextId=0;this.nextCommit=0;this.generation=0;
  }
  push(job) {
    const tail=this.pending.at(-1);
    if(tail&&tail.sourceLanguage===job.sourceLanguage&&tail.targetLanguage===job.targetLanguage&&tail.quality===job.quality&&tail.voiceGeneration===job.voiceGeneration&&tail.text.length+job.text.length+1<=2800){
      tail.text+=' '+job.text;
    }else this.pending.push({...job,id:this.nextId++});
    this.pump();
  }
  clear() {
    this.generation++;
    for(const controller of this.active.values())controller.abort();
    this.pending=[];this.active.clear();this.finished.clear();this.nextId=0;this.nextCommit=0;this.onPending(0);
  }
  pump() {
    const generation=this.generation;
    while(this.active.size<this.concurrency&&this.pending.length){
      const job=this.pending.shift(),controller=new AbortController();
      this.active.set(job.id,controller);
      Promise.resolve().then(()=>this.run(job,controller.signal,text=>{
        if(generation===this.generation&&job.id===this.nextCommit)this.onProgress(text,job);
      })).then(result=>this.finish(generation,job,{result}),error=>this.finish(generation,job,{error}));
    }
    this.onPending(this.pending.length+this.active.size+this.finished.size);
  }
  finish(generation,job,outcome) {
    if(generation!==this.generation)return;
    this.active.delete(job.id);this.finished.set(job.id,{job,...outcome});
    while(this.finished.has(this.nextCommit)){
      const item=this.finished.get(this.nextCommit);this.finished.delete(this.nextCommit++);this.onCommit(item);
    }
    this.pump();
  }
}

export function splitPhrases(text,limit=2400) {
  const chunks=[];let rest=text.trim();
  while(rest.length>limit){
    let end=rest.lastIndexOf(' ',limit);
    if(end<limit/2)end=limit;
    // Do not split a Unicode surrogate pair.
    if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;
    chunks.push(rest.slice(0,end));rest=rest.slice(end).trimStart();
  }
  if(rest)chunks.push(rest);return chunks;
}

export async function requestTranslation(payload,{signal,onProgress=()=>{},fetchImpl=fetch}={}) {
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,23_000);
  try{
  const response=await fetchImpl('/api/translate',{
    method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
    body:JSON.stringify({...payload,stream:true})
  });
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Translation failed')}
  if(!response.headers.get('content-type')?.includes('application/x-ndjson'))return await response.json();
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
  const accept=line=>{
    if(!line.trim())return;
    const event=JSON.parse(line);
    if(event.type==='error')throw new Error(event.error||'Translation failed');
    if(event.type==='progress')onProgress(event.translation);
    if(event.type==='reset')onProgress('');
    if(event.type==='done')result=event.result;
  };
  try{
    while(!result){
      const {value,done}=await reader.read();
      buffer+=decoder.decode(value,{stream:!done});
      let newline;while((newline=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,newline));buffer=buffer.slice(newline+1)}
      if(done)break;
    }
    accept(buffer);
    if(!result?.translation)throw new Error('Translation stream ended early');
    return result;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
