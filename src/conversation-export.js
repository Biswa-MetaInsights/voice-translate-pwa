import {splitPhrases} from './translation-client.js';

export function conversationText(turns,mode='both'){
  return turns.map(turn=>mode==='translation'?turn.translation:[turn.source,turn.translation].filter(Boolean).join('\n\n'))
    .filter(Boolean).join('\n\n');
}

async function requestSpeechMp3(text,signal,fetchImpl){
  const timeoutSignal=AbortSignal.timeout(25_000);
  const response=await fetchImpl('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text}),signal:signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal});
  if(!response.ok)throw new Error(response.status===429?'Voice service is busy. Please try downloading again in a minute.':'Could not generate the conversation audio. Please try again.');
  if(response.headers.get('content-type')?.split(';')[0]!=='audio/mpeg')throw new Error('The voice service did not return MP3 audio.');
  const bytes=await response.arrayBuffer();
  signal?.throwIfAborted();
  if(!bytes.byteLength)throw new Error('The voice service returned empty audio. Please try again.');
  return bytes;
}

export async function createConversationMp3(turns,{mode='both',signal,onProgress=()=>{},fetchImpl=fetch,
  audioContextFactory=()=>new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000}),
  workerFactory=()=>new Worker(new URL('./mp3-worker.js',import.meta.url),{type:'module'})}={}){
  const text=conversationText(turns,mode).trim();
  if(!text)throw new Error('There is no completed conversation to download yet.');
  signal?.throwIfAborted();
  const chunks=splitPhrases(text);
  if(chunks.length===1){
    onProgress({completed:0,total:1});
    const bytes=await requestSpeechMp3(chunks[0],signal,fetchImpl);
    onProgress({completed:1,total:1});
    return new Blob([bytes],{type:'audio/mpeg'});
  }
  const context=audioContextFactory();let worker;
  try{worker=workerFactory()}catch(error){await context.close().catch(()=>{});throw error}
  const pending=new Map();let nextId=0;
  const fail=error=>{for(const item of pending.values())item.reject(error);pending.clear()};
  const abort=()=>{fail(new DOMException('Download cancelled','AbortError'));worker.terminate()};
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{
    const item=pending.get(data.id);if(!item)return;pending.delete(data.id);
    if(data.error)item.reject(new Error(data.error));else item.resolve(data.parts);
  };
  worker.onerror=()=>fail(new Error('Could not prepare the MP3. Please try again.'));
  const send=(type,data={},transfer=[])=>new Promise((resolve,reject)=>{
    try{signal?.throwIfAborted();const id=nextId++;pending.set(id,{resolve,reject});worker.postMessage({id,type,...data},transfer)}catch(error){reject(error)}
  });
  try{
    await send('init',{sampleRate:context.sampleRate});
    for(let i=0;i<chunks.length;i++){
      signal?.throwIfAborted();onProgress({completed:i,total:chunks.length});
      const bytes=await requestSpeechMp3(chunks[i],signal,fetchImpl);
      signal?.throwIfAborted();
      const audio=await context.decodeAudioData(bytes);
      signal?.throwIfAborted();
      const samples=new Float32Array(audio.getChannelData(0));
      await send('encode',{samples},[samples.buffer]);
    }
    const parts=await send('finish');signal?.throwIfAborted();
    onProgress({completed:chunks.length,total:chunks.length});
    return new Blob(parts,{type:'audio/mpeg'});
  }finally{
    signal?.removeEventListener('abort',abort);worker.terminate();await context.close().catch(()=>{});
  }
}
