import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createConversationMp3,conversationText} from '../src/conversation-export.js';
import {createMp3Encoder} from '../src/mp3-encoder.js';

const turns=[{source:'Bonjour.',translation:'Hello.'},{source:'Merci.',translation:'Thank you.'}];
function harness(){
  const state={closed:false,terminated:false,requests:[],encoded:0};
  const worker={postMessage({id,type}){
    if(type==='encode')state.encoded++;
    queueMicrotask(()=>worker.onmessage({data:{id,parts:type==='finish'?[new Uint8Array([0xff,0xfb,1,2])]:undefined}}));
  },terminate(){state.terminated=true}};
  return {state,options:{
    audioContextFactory:()=>({sampleRate:24000,decodeAudioData:async()=>({getChannelData:()=>new Float32Array(24000)}),close:async()=>{state.closed=true}}),
    workerFactory:()=>worker,
    fetchImpl:async(url,options)=>{state.requests.push({url,body:JSON.parse(options.body)});return new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'audio/mpeg'}})}
  }};
}

test('conversation export preserves both sides in speaking order and offers translation only',()=>{
  assert.equal(conversationText(turns),'Bonjour.\n\nHello.\n\nMerci.\n\nThank you.');
  assert.equal(conversationText(turns,'translation'),'Hello.\n\nThank you.');
});
test('short MP3 exports reuse the returned file without browser audio or worker setup',async()=>{
  const {state,options}=harness(),progress=[];
  const result=await createConversationMp3(turns,{...options,audioContextFactory:()=>assert.fail('Audio context is unnecessary'),
    workerFactory:()=>assert.fail('Worker is unnecessary'),onProgress:x=>progress.push(x)});
  assert.equal(result.type,'audio/mpeg');assert.deepEqual(new Uint8Array(await result.arrayBuffer()),new Uint8Array([1,2]));
  assert.equal(state.requests[0].url,'/api/speak');assert.equal(state.requests[0].body.text,conversationText(turns));
  assert.deepEqual(progress.at(-1),{completed:1,total:1});
});
test('long conversations are chunked without losing either side',async()=>{
  const {state,options}=harness();
  const long=[{source:'Bonjour '.repeat(500).trim(),translation:'Hello '.repeat(500).trim()}];
  await createConversationMp3(long,options);
  assert.ok(state.requests.length>1);assert.ok(state.requests.every(x=>x.body.text.length<=2400));
  assert.equal(state.requests.map(x=>x.body.text).join(' ').replace(/\s+/g,' '),conversationText(long).replace(/\s+/g,' '));
  assert.equal(state.encoded,state.requests.length);assert.equal(state.closed,true);assert.equal(state.terminated,true);
});
test('short exports reject an empty or mislabeled voice response',async()=>{
  const {options}=harness();
  for(const [body,type,error] of [
    [null,'audio/mpeg',/empty audio/],
    ['voice','audio/wav',/did not return MP3/],
  ]){
    await assert.rejects(()=>createConversationMp3(turns,{...options,
      fetchImpl:async()=>new Response(body,{headers:{'Content-Type':type}})}),error);
  }
});
test('empty conversations never request audio',async()=>{
  const {state,options}=harness();await assert.rejects(()=>createConversationMp3([],options),/no completed conversation/);
  assert.equal(state.requests.length,0);
});
test('voice service errors are surfaced and never downloaded as an MP3',async()=>{
  const {state,options}=harness();
  const long=[{source:'Bonjour '.repeat(500).trim()}];
  await assert.rejects(()=>createConversationMp3(long,{...options,fetchImpl:async()=>new Response('{}',{status:429})}),/busy/);
  assert.equal(state.closed,true);assert.equal(state.terminated,true);
});
test('cancellation aborts an in-flight download without affecting microphone resources',async()=>{
  const {state,options}=harness(),controller=new AbortController();let requestSignal,started;
  const ready=new Promise(resolve=>started=resolve);
  const long=[{source:'Bonjour '.repeat(500).trim()}];
  const task=createConversationMp3(long,{...options,signal:controller.signal,fetchImpl:async(_,opts)=>{
    requestSignal=opts.signal;started();return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
  }});
  const rejected=assert.rejects(task,{name:'AbortError'});await ready;controller.abort();await rejected;
  assert.equal(requestSignal.aborted,true);assert.equal(state.closed,true);assert.equal(state.terminated,true);
});
test('the actual encoder produces one decodable MP3 containing every audio chunk',t=>{
  if(spawnSync('ffprobe',['-version']).error){t.skip('ffprobe is not installed');return;}
  const rate=24000,encoder=createMp3Encoder(rate),tone=hz=>Float32Array.from({length:rate},(_,i)=>.2*Math.sin(2*Math.PI*hz*i/rate));
  encoder.add(tone(440));encoder.add(tone(880));
  const path=mkdtempSync(join(tmpdir(),'vt-mp3-'));
  try{
    const file=join(path,'conversation.mp3');writeFileSync(file,Buffer.concat(encoder.finish().map(x=>Buffer.from(x))));
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{encoding:'utf8'});
    assert.equal(probe.status,0,probe.stderr);const duration=Number(probe.stdout.trim());
    assert.ok(duration>=2&&duration<2.2,'both one-second audio chunks must be present');
    const decode=spawnSync('ffmpeg',['-v','error','-i',file,'-f','s16le','-ac','1','-ar',String(rate),'-']);
    assert.equal(decode.status,0);assert.ok(decode.stdout.length>=rate*2*2);
  }finally{rmSync(path,{recursive:true,force:true});}
});
