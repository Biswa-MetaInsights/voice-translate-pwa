import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {OrderedTranslationQueue,requestTranslation,splitPhrases} from '../src/translation-client.js';
import {shouldRecover,speechProviderOptions} from '../src/audio-health.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const frontend=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function app(extra={}){
  const elements=new Map();
  const element=()=>({value:'',textContent:'',children:[],dataset:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},
    append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},
    setAttribute(){},removeAttribute(){},addEventListener(){},set innerHTML(value){this.children=[]},get innerHTML(){return ''}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},
    createElement:element,querySelectorAll:()=>[],documentElement:{dataset:{}},addEventListener(){}};
  document.getElementById('inputLang').value='fr-FR';document.getElementById('outputLang').value='en-US';
  const context=vm.createContext({document,navigator:{onLine:true,mediaDevices:{}},window:{addEventListener(){}},
    localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,setInterval,clearInterval,console,AbortController,
    OrderedTranslationQueue,requestTranslation:async()=>({translation:'Hello'}),splitPhrases,shouldRecover,speechProviderOptions,performance,...extra});
  vm.runInContext(frontend,context);return {context,document,run:code=>vm.runInContext(code,context)};
}

test('JSON response body remains abortable after headers arrive',async()=>{
  const caller=new AbortController();let signal;
  const request=requestTranslation({}, {signal:caller.signal,fetchImpl:async(_,options)=>{
    signal=options.signal;
    return {ok:true,headers:new Headers({'Content-Type':'application/json'}),
      json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))};
  }});
  const rejected=assert.rejects(request,{name:'AbortError'});
  await tick();caller.abort();assert.equal(signal.aborted,true);await rejected;
});
test('backlog never merges silent history replay with newly spoken phrases',async()=>{
  const pending=[],jobs=[];
  const queue=new OrderedTranslationQueue({concurrency:1,run:job=>{jobs.push(job);return new Promise(resolve=>pending.push(resolve));}});
  queue.push({text:'active',voiceGeneration:1});
  queue.push({text:'history',voiceGeneration:-1});queue.push({text:'new',voiceGeneration:1});
  assert.equal(queue.pending.length,2);
  await tick();pending[0]({translation:'active'});await tick();pending[1]({translation:'history'});await tick();pending[2]({translation:'new'});await tick();
  assert.deepEqual(jobs.map(x=>[x.text,x.voiceGeneration]),[['active',1],['history',-1],['new',1]]);
});
test('old microphone cleanup cannot erase resources installed by a newer session',async()=>{
  let closeOld;const {run,context}=app();
  context.oldContext={close:()=>new Promise(resolve=>{closeOld=resolve;})};
  context.newContext={close:async()=>{}};context.newStream={getTracks:()=>[]};
  run('audioContext=oldContext;var cleaning=cleanupAudio();audioContext=newContext;mediaStream=newStream;sourceNode={newSource:true}');
  closeOld();await run('cleaning');
  assert.equal(run('audioContext===newContext && mediaStream===newStream && sourceNode.newSource'),true);
});
test('stopping an older session does not overwrite the restarted microphone UI',async()=>{
  let closeOld;const {run,context,document}=app();
  context.oldContext={close:()=>new Promise(resolve=>{closeOld=resolve;})};
  run("audioContext=oldContext;wantsListening=true;var stopping=stopListening();++transcriptionSession;isListening=wantsListening=true");
  document.getElementById('status').textContent='NEW_SESSION';
  closeOld();await run('stopping');
  assert.equal(document.getElementById('status').textContent,'NEW_SESSION');
  assert.equal(run('wantsListening&&isListening'),true);
});
test('stale browser callbacks cannot restore cleared transcript or stop a new session',()=>{
  const instances=[];
  class Recognition{constructor(){instances.push(this)}start(){}stop(){}}
  const {run}=app({window:{addEventListener(){},SpeechRecognition:Recognition}});
  run('wantsListening=true;startBrowserFallback()');
  const oldResult=instances[0].onresult,oldError=instances[0].onerror;
  run('stopBrowserFallback();wantsListening=true;startBrowserFallback()');
  oldResult({resultIndex:0,results:[Object.assign([{transcript:'STALE'}],{isFinal:true})]});
  oldError({error:'not-allowed'});
  assert.equal(run('committedTranscript'),'');assert.equal(run('wantsListening&&usingBrowserFallback'),true);
});
test('switching capture mode preserves and commits the unfinished source phrase',async()=>{
  const {run}=app();run("interimTranscript='unfinished phrase';committedTranscript='earlier';var queued=[];queueFinalTranslation=text=>queued.push(text)");
  await run('stopListening(false)');
  assert.equal(run('committedTranscript'),'earlier unfinished phrase');assert.equal(run('interimTranscript'),'');
  assert.equal(run('queued[0]'),'unfinished phrase');
});
test('blocked preference storage does not break language selection',async()=>{
  const {run,document}=app({localStorage:{getItem(){return null},setItem(){throw new Error('Quota exceeded')}}});
  await run("pickerTarget='output';selectLanguage('de-DE')");
  assert.equal(document.getElementById('outputLang').value,'de-DE');
});
test('voice backlog counts all chunks in a long spoken phrase',async()=>{
  const {run}=app();run("speakText('word '.repeat(1100))");
  assert.equal(run('queuedVoiceCount'),3);run('cancelVoice()');await tick();
});
test('transcription token failures never expose upstream secrets or text',async()=>{
  const logs=[];
  const code=readFileSync(new URL('../api/transcription-token.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
  const context=vm.createContext({process:{env:{AI_GATEWAY_API_KEY:'SECRET_CREDENTIAL'}},console:{error:(...args)=>logs.push(args),log(){}},
    createGateway:()=>({experimental_transcription:{getToken:async()=>{throw Object.assign(new Error('SECRET_CREDENTIAL PRIVATE_CONVERSATION'),{statusCode:401});}}})});
  vm.runInContext(code,context);
  const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await context.handler({method:'POST',headers:{}},res);
  assert.equal(res.code,503);assert.equal(res.body.upstreamStatus,401);
  assert.doesNotMatch(JSON.stringify({body:res.body,logs}),/SECRET_CREDENTIAL|PRIVATE_CONVERSATION/);
});

function fakeTimers(){
  const timers=new Map();let next=0;
  return {timers,setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
}
test('natural voice download timeout covers audio body after headers',async()=>{
  const clock=fakeTimers();let signal;
  const {run}=app({...clock,fetch:async(_,options)=>{
    signal=options.signal;
    return {ok:true,blob:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))};
  }});
  run("speakText('Synthetic speech')");await tick();
  const timeout=[...clock.timers.values()].find(x=>x.ms===12_000);
  assert.ok(timeout,'timeout must remain active until audio bytes finish');
  timeout.fn();await run('liveVoiceQueue');assert.equal(signal.aborted,true);
});
test('speech-token timeout covers JSON body after headers',async()=>{
  const clock=fakeTimers();let signal;
  const {run}=app({...clock,navigator:{onLine:true,mediaDevices:{getUserMedia(){}}},console:{log(){},warn(){},error(){}},fetch:async(_,options)=>{
    signal=options.signal;
    return {ok:true,status:200,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))};
  }});
  run('createMicrophonePcmStream=async()=>null;wantsListening=true;var listening=startListening()');await tick();
  const timeout=[...clock.timers.values()].find(x=>x.ms===20_000);
  assert.ok(timeout,'timeout must remain active until token JSON finishes');
  timeout.fn();await run('listening');assert.equal(signal.aborted,true);
});
test('old speech failure cannot mark a new session as microphone blocked',async()=>{
  const clock=fakeTimers();let closeOld;
  const {run,context}=app({...clock,navigator:{onLine:true,mediaDevices:{getUserMedia(){}}},console:{log(){},warn(){},error(){}},
    fetch:async()=>{throw new DOMException('Permission denied','NotAllowedError')}});
  context.oldContext={close:()=>new Promise(resolve=>{closeOld=resolve;})};
  run('createMicrophonePcmStream=async()=>null;audioContext=oldContext;wantsListening=true;var failing=startListening()');await tick();
  assert.ok(closeOld);run('++transcriptionSession;wantsListening=isListening=true');closeOld();await run('failing');
  assert.equal(run('wantsListening&&isListening'),true);
});
test('old watchdog recovery cannot schedule reconnects for a newer session',async()=>{
  let closeOld;const {run,context}=app();
  context.oldContext={close:()=>new Promise(resolve=>{closeOld=resolve;})};
  run('audioContext=oldContext;wantsListening=true;var reconnects=0;scheduleReconnect=()=>reconnects++;var recovery=recoverSpeech();++transcriptionSession');
  closeOld();await run('recovery');assert.equal(run('reconnects'),0);
});

test('browser fallback preserves an interim phrase delivered alongside a final phrase',async()=>{
  const instances=[];
  class Recognition{constructor(){instances.push(this)}start(){}stop(){}}
  const {run}=app({window:{addEventListener(){},SpeechRecognition:Recognition}});
  run('wantsListening=true;var queued=[];queueFinalTranslation=text=>queued.push(text);startBrowserFallback()');
  instances[0].onresult({resultIndex:0,results:[
    Object.assign([{transcript:'Finished sentence.'}],{isFinal:true}),
    Object.assign([{transcript:'Next unfinished phrase'}],{isFinal:false})
  ]});
  assert.equal(run('currentTranscript()'),'Finished sentence. Next unfinished phrase');
  await run('stopListening(false)');
  assert.equal(run('committedTranscript'),'Finished sentence. Next unfinished phrase');
  assert.equal(run('queued[1]'),'Next unfinished phrase');
});

test('stale realtime frames cannot reset diagnostics or retry counts for a new session',async()=>{
  let release;
  const {run}=app({navigator:{onLine:true,mediaDevices:{getUserMedia(){}}},
    fetch:async()=>({ok:true,json:async()=>({token:'SYNTHETIC'})}),
    createGateway:()=>({transcriptionModel:()=>({})}),
    streamTranscribe:()=>({fullStream:(async function*(){await new Promise(resolve=>{release=resolve});yield {type:'transcript-final',text:'STALE'};})()})});
  run('createMicrophonePcmStream=async()=>null;wantsListening=true;startAudioHealth=()=>{};var oldSession=startListening()');
  await tick();
  run("++transcriptionSession;reconnectAttempts=2;diagnosticState.realtime='pending'");
  release();await run('oldSession');
  const attempts=run('reconnectAttempts'),state=run('diagnosticState.realtime'),transcript=run('committedTranscript');
  await run('stopListening(false)');
  assert.equal(attempts,2);
  assert.equal(state,'pending');
  assert.equal(transcript,'');
});
