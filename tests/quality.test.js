import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderedTranslationQueue,requestTranslation,splitPhrases } from '../src/translation-client.js';
import { shouldRecover,speechProviderOptions } from '../src/audio-health.js';
import { readCompletionStream,translationPrefix } from '../lib/translation-stream.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('slow earlier phrases do not block the next request or reorder output',async()=>{
  const pending=new Map(),committed=[];
  const queue=new OrderedTranslationQueue({run:job=>new Promise(resolve=>pending.set(job.id,resolve)),onCommit:item=>committed.push(item.result)});
  queue.push({text:'first'});queue.push({text:'second'});await tick();
  assert.equal(pending.size,2);
  pending.get(1)('second');await tick();assert.deepEqual(committed,[]);
  pending.get(0)('first');await tick();assert.deepEqual(committed,['first','second']);
});
test('backlog coalesces pending phrases without dropping text',async()=>{
  const jobs=[],pending=[];
  const queue=new OrderedTranslationQueue({run:job=>{jobs.push(job.text);return new Promise(resolve=>pending.push(resolve))}});
  for(const text of ['one','two','three','four','five'])queue.push({text,sourceLanguage:'auto',targetLanguage:'en-US',quality:'accurate'});
  await tick();pending[0]({translation:'one'});await tick();
  assert.deepEqual(jobs,['one','two','three four five']);
  pending[1]({translation:'two'});pending[2]({translation:'three four five'});await tick();
});
test('clear aborts requests and stale results cannot reach the next conversation',async()=>{
  let resolveOld,oldSignal;const committed=[];
  const queue=new OrderedTranslationQueue({run:(job,signal)=>{oldSignal=signal;return new Promise(resolve=>resolveOld=resolve)},onCommit:item=>committed.push(item)});
  queue.push({text:'old'});await tick();queue.clear();assert.equal(oldSignal.aborted,true);
  resolveOld({translation:'stale'});await tick();assert.equal(committed.length,0);
});
test('a failed phrase is surfaced and does not discard later translations',async()=>{
  const committed=[];
  const queue=new OrderedTranslationQueue({run:async job=>{if(job.text==='bad')throw new Error('offline');return {translation:job.text}},onCommit:item=>committed.push(item)});
  queue.push({text:'bad'});queue.push({text:'next'});await tick();
  assert.equal(committed.length,2);assert.match(committed[0].error.message,/offline/);assert.equal(committed[1].result.translation,'next');
});
test('long transcripts split without truncation, including CJK and emoji',()=>{
  for(const text of ['word '.repeat(2000).trim(),'日本語'.repeat(2000),'😀'.repeat(3000)]){
    const parts=splitPhrases(text);assert.ok(parts.every(x=>x.length<=2400));
    assert.equal(parts.join('').replace(/\s/g,''),text.replace(/\s/g,''));
    assert.ok(parts.every(x=>!/[\uD800-\uDBFF]$/.test(x)));
  }
});
test('manual speech hints reach the provider and automatic mode remains multilingual',()=>{
  assert.equal(speechProviderOptions('fr-FR').openai.language,'fr');
  assert.equal(speechProviderOptions('fil-PH').openai.language,'tl');
  assert.equal(speechProviderOptions('auto').openai.language,undefined);
  assert.equal(speechProviderOptions('auto').openai.streaming.delay,'low');
});
test('watchdog distinguishes silence from stalled audio or recognition',()=>{
  const base={now:30_000,startedAt:0,lastAudioAt:30_000,lastVoiceAt:0,lastTranscriptAt:1000,suspended:false,hidden:false};
  assert.equal(shouldRecover(base),false);
  assert.equal(shouldRecover({...base,lastVoiceAt:29_000}),true);
  assert.equal(shouldRecover({...base,lastAudioAt:10_000}),true);
  assert.equal(shouldRecover({...base,suspended:true}),true);
  assert.equal(shouldRecover({...base,suspended:true,hidden:true}),false);
});
test('partial structured translation hides JSON and incomplete Unicode escapes',()=>{
  assert.equal(translationPrefix('{"translation":"Hello \\u00'),'Hello ');
  assert.equal(translationPrefix('{"translation":"Hello \\u00e9\\nworld","detectedLanguage":'),'Hello é\nworld');
});
test('provider stream handles UTF-8 across chunks and rejects incomplete streams',async()=>{
  const data='data: '+JSON.stringify({choices:[{delta:{content:'日本語'}}]})+'\n\ndata: [DONE]\n\n';
  const bytes=new TextEncoder().encode(data),seen=[];
  const body=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close()}});
  assert.equal(await readCompletionStream(body,text=>seen.push(text)),'日本語');assert.deepEqual(seen,['日本語']);
  await assert.rejects(()=>readCompletionStream(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n').body,()=>{}),/ended early/);
});
test('client displays incremental output, resets fallback previews, and requires completion',async()=>{
  const progress=[];
  const stream=[{type:'progress',translation:'wrong'},{type:'reset'},{type:'progress',translation:'Hello'},{type:'done',result:{translation:'Hello',detectedLanguage:'en-US'}}].map(x=>JSON.stringify(x)+'\n').join('');
  const result=await requestTranslation({text:'Bonjour'},{fetchImpl:async()=>new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}}),onProgress:text=>progress.push(text)});
  assert.equal(result.translation,'Hello');assert.deepEqual(progress,['wrong','','Hello']);
  await assert.rejects(()=>requestTranslation({text:'Bonjour'},{fetchImpl:async()=>new Response('{"type":"progress","translation":"Hi"}\n',{headers:{'Content-Type':'application/x-ndjson'}})}),/ended early/);
});
