import {createLiveText} from '../src/live-text.js';
import {createDocument} from './helpers/dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {OrderedTranslationQueue,requestTranslation,splitPhrases} from '../src/translation-client.js';
import {shouldRecover} from '../src/audio-health.js';
import {LIVE_TRANSCRIBE_MODEL,WHISPER_MODEL,speechProviderOptions} from '../lib/speech-models.js';
import {createPcmBuffer} from '../src/pcm-buffer.js';
import {guessSourceLanguage} from '../src/source-language.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const twoPerson=readFileSync(new URL('../src/two-person-conversation.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export function','function');
const frontend=twoPerson+readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function app(extra={}){
  const document=createDocument();
  document.getElementById('inputLang').value='fr-FR';document.getElementById('outputLang').value='en-US';
  const context=vm.createContext({document,navigator:{onLine:true,mediaDevices:{}},window:{addEventListener(){}},
    localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,setInterval,clearInterval,console,AbortController,
    createLiveText,OrderedTranslationQueue,requestTranslation:async()=>({translation:'Hello'}),splitPhrases,shouldRecover,speechProviderOptions,createPcmBuffer,guessSourceLanguage,LIVE_TRANSCRIBE_MODEL,WHISPER_MODEL,URLSearchParams,performance,...extra});
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
  const context=vm.createContext({LIVE_TRANSCRIBE_MODEL,WHISPER_MODEL,URL,process:{env:{AI_GATEWAY_API_KEY:'SECRET_CREDENTIAL'}},console:{error:(...args)=>logs.push(args),log(){}},
    createGateway:()=>({experimental_transcription:{getToken:async()=>{throw Object.assign(new Error('SECRET_CREDENTIAL PRIVATE_CONVERSATION'),{statusCode:401});}}})});
  vm.runInContext(code,context);
  const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await context.handler({method:'POST',headers:{}},res);
  assert.equal(res.code,503);assert.equal(res.body.upstreamStatus,401);
  assert.doesNotMatch(JSON.stringify({body:res.body,logs}),/SECRET_CREDENTIAL|PRIVATE_CONVERSATION/);
});

test('preview selects Live Transcribe while explicit comparison and production use Whisper',async()=>{
  const code=readFileSync(new URL('../api/transcription-token.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
  const calls=[];
  const env={VERCEL_ENV:'preview',AI_GATEWAY_API_KEY:'fixture'};
  const context=vm.createContext({LIVE_TRANSCRIBE_MODEL,WHISPER_MODEL,URL,process:{env},console:{log(){},warn(){},error(){}},
    createGateway:()=>({experimental_transcription:{getToken:async({model})=>{
      calls.push(model);
      if(calls.length===4)throw new Error('Live preview unavailable');
      return {token:'ephemeral'};
    }}})});
  vm.runInContext(code,context);
  async function modelFor(url){
    const res={setHeader(){},status(){return this},json(body){this.body=body}};
    await context.handler({method:'POST',headers:{},url},res);
    return res.body.model;
  }
  assert.equal(await modelFor('/api/transcription-token'),LIVE_TRANSCRIBE_MODEL);
  assert.equal(await modelFor('/api/transcription-token?model=whisper'),WHISPER_MODEL);
  env.VERCEL_ENV='production';
  assert.equal(await modelFor('/api/transcription-token?model=live'),WHISPER_MODEL);
  env.VERCEL_ENV='preview';
  assert.equal(await modelFor('/api/transcription-token'),WHISPER_MODEL);
  assert.deepEqual(calls,[LIVE_TRANSCRIBE_MODEL,WHISPER_MODEL,WHISPER_MODEL,LIVE_TRANSCRIBE_MODEL,WHISPER_MODEL]);
});

function fakeTimers(){
  const timers=new Map();let next=0;
  return {timers,setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
}

test('continuous word updates keep the first preview timer and show a likely language locally',async()=>{
  const clock=fakeTimers();
  const requests=[];
  let resolvePreview;
  const {run,document}=app({...clock,requestTranslation:job=>{
    requests.push(job);
    return new Promise(resolve=>{resolvePreview=resolve});
  }});
  const label=document.getElementById('detectedLanguage');
  run("input.value='auto';detectSourceWhileSpeaking('Bonjour');scheduleTranslation('Bonjour')");
  assert.doesNotMatch(label.textContent,/French/);
  const [[timer,scheduled]]=clock.timers;
  run("detectSourceWhileSpeaking('Bonjour comment allez-vous');scheduleTranslation('Bonjour comment allez-vous')");
  assert.equal(label.textContent,'Likely: French');
  assert.equal(clock.timers.size,1);
  assert.equal(clock.timers.get(timer),scheduled);
  assert.equal(scheduled.ms,180);
  scheduled.fn();
  assert.equal(requests[0].text,'Bonjour comment allez-vous');
  assert.equal(requests[0].sourceLanguage,'auto');
  resolvePreview({translation:'Hello how are you?',detectedLanguage:'fr-FR'});
  await tick();
  assert.equal(label.textContent,'Detected: French');
});
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
  run("createMicrophonePcmStream=async()=>{const error=new Error('Permission denied');error.name='NotAllowedError';throw error};audioContext=oldContext;wantsListening=true;var failing=startListening()");await tick();
  assert.ok(closeOld);run('++transcriptionSession;wantsListening=isListening=true');closeOld();await run('failing');
  assert.equal(run('wantsListening&&isListening'),true);
});
test('old watchdog recovery cannot schedule reconnects for a newer session',async()=>{
  let closeOld;const {run,context}=app();
  context.oldContext={close:()=>new Promise(resolve=>{closeOld=resolve;})};
  run('audioContext=oldContext;wantsListening=true;var reconnects=0;scheduleReconnect=()=>reconnects++;var recovery=recoverSpeech();++transcriptionSession');
  closeOld();await run('recovery');assert.equal(run('reconnects'),0);
});

test('slow startup and a cancelled socket preserve unsent microphone frames in order',async()=>{
  const buffer=createPcmBuffer(()=>assert.fail('Unexpected audio loss'));
  const frame=number=>new Uint8Array(960).fill(number);
  for(let number=0;number<200;number++)buffer.push(frame(number));
  const first=buffer.open().getReader();
  assert.equal((await first.read()).value[0],0);
  await first.cancel();
  buffer.push(frame(200));
  const reconnected=buffer.open().getReader();
  for(let number=1;number<=200;number++)assert.equal((await reconnected.read()).value[0],number);
  const liveRead=reconnected.read();
  await tick();
  buffer.push(frame(201));
  assert.equal((await liveRead).value[0],201);
  await reconnected.cancel();
});

test('exhausting the audio buffer warns once and keeps the most recent audio',async()=>{
  let warnings=0;
  const buffer=createPcmBuffer(()=>warnings++,2);
  for(const value of [1,2,3,4])buffer.push(Uint8Array.of(value));
  const reader=buffer.open().getReader();
  assert.equal(warnings,1);
  assert.equal((await reader.read()).value[0],3);
  assert.equal((await reader.read()).value[0],4);
  buffer.disconnect();
  assert.equal((await reader.read()).done,true);
});

test('overlapping realtime segments stay visible and commit in order across a socket failure',async()=>{
  const clock=fakeTimers();
  const buffer=createPcmBuffer(()=>assert.fail('Unexpected audio loss'));
  let connections=0,captures=0;
  const {run,context,document}=app({...clock,
    navigator:{onLine:true,mediaDevices:{getUserMedia(){}}},
    console:{log(){},warn(){},error(){}},
    fetch:async()=>({ok:true,json:async()=>({token:'ephemeral'})}),
    createGateway:()=>({transcriptionModel:()=>({})}),
    streamTranscribe:({audio})=>({fullStream:(async function*(){
      const reader=audio.getReader();
      if(++connections===1){
        yield {type:'transcript-delta',id:'first',delta:'Bonjour'};
        yield {type:'transcript-delta',id:'second',delta:'Comment'};
        yield {type:'transcript-final',id:'first',text:'Bonjour.'};
        assert.equal(document.getElementById('transcript').textContent,'Bonjour. Comment');
        yield {type:'transcript-delta',id:'third',delta:'Bien'};
        yield {type:'transcript-final',id:'third',text:'Bien.'};
        yield {type:'transcript-delta',id:'second',delta:' allez-vous'};
        yield {type:'transcript-final',id:'second',text:'Comment allez-vous ?'};
        yield {type:'transcript-partial',id:'fourth',text:'Merci beaucoup'};
        buffer.push(Uint8Array.of(12));
        await reader.cancel();
        yield {type:'error',error:new Error('Socket disconnected')};
      }else{
        assert.equal((await reader.read()).value[0],12);
        yield {type:'transcript-final',id:'fresh',text:'À demain.'};
        await reader.cancel();
      }
    })()})
  });
  context.capture=()=>{captures++;return buffer};
  run(`createMicrophonePcmStream=async()=>{
      microphoneBuffer=capture();
      audioContext={state:'running'};
      mediaStream={getAudioTracks:()=>[{readyState:'live'}],getTracks:()=>[]};
      return microphoneBuffer;
    };
    wantsListening=true;var started=startListening()`);
  await run('started');
  assert.equal(document.getElementById('transcript').textContent,'Bonjour. Comment allez-vous ? Bien. Merci beaucoup');
  await run('startListening(true)');
  assert.equal(document.getElementById('transcript').textContent,'Bonjour. Comment allez-vous ? Bien. Merci beaucoup À demain.');
  assert.equal(captures,1);
  assert.equal(connections,2);
  await run('stopListening()');
});

test('live translations retain completed DOM nodes while phrases stream, queue and finish out of order',async()=>{
  const requests=new Map();
  const {run,document}=app({requestTranslation:(job,{onProgress})=>new Promise(resolve=>requests.set(job.text,{onProgress,resolve}))});
  const box=document.getElementById('translation');
  run("queueFinalTranslation('one')");await tick();
  requests.get('one').onProgress('First sentence.');
  assert.equal(box.textContent,'First sentence.');
  run("queueFinalTranslation('two')");await tick();
  assert.equal(box.textContent,'First sentence.'); // Enqueue must not blank the active stream.
  requests.get('two').onProgress('Second sentence.');
  assert.equal(box.textContent,'First sentence.'); // Later speech cannot overtake the first.
  requests.get('one').resolve({translation:'First sentence.'});await tick();
  const first=box.children[0].children[0];
  requests.get('two').onProgress('Second');
  requests.get('two').onProgress(''); // Discard a rejected draft without changing completed sentences.
  assert.equal(box.textContent,'First sentence.');
  requests.get('two').resolve({translation:'Second sentence.'});await tick();
  assert.equal(box.textContent,'First sentence. Second sentence.');
  assert.equal(box.children[0].children[0],first);
  assert.equal(first.textContent,'First sentence.');
  run("committedTranscript='one two';interimTranscript='three';setTranscript()");
  const source=document.getElementById('transcript'),oldSource=source.children[0].children[0];
  run("interimTranscript='three four';setTranscript()");
  assert.equal(source.textContent,'one two three four');assert.equal(source.children[0].children[0],oldSource);
  document.getElementById('clear').onclick();
  assert.equal(box.textContent,'Your translation will appear here.');
  assert.equal(source.textContent,'Your speech will appear here.');
});

test('browser speech keeps the next partial phrase when a result also finalizes earlier speech',async()=>{
  let recognition;
  class Recognition{constructor(){recognition=this}start(){}stop(){}}
  const {run,document}=app({window:{addEventListener(){},SpeechRecognition:Recognition}});
  run('wantsListening=true;startBrowserFallback()');
  recognition.onresult({resultIndex:0,results:[
    Object.assign([{transcript:'First sentence.'}],{isFinal:true}),
    Object.assign([{transcript:'Next sentence'}],{isFinal:false})
  ]});
  assert.equal(document.getElementById('transcript').textContent,'First sentence. Next sentence');
  await tick();run('stopBrowserFallback()');
});

test('changing output language discards late progress and results from the previous target',async()=>{
  const requests=[];
  const {run,document}=app({requestTranslation:(job,{onProgress,signal})=>new Promise(resolve=>requests.push({job,onProgress,signal,resolve}))});
  run("committedTranscript='Bonjour';queueFinalTranslation('Bonjour')");await tick();
  requests[0].onProgress('Hello');
  await run("pickerTarget='output';selectLanguage('nl-NL')");await tick();
  assert.equal(requests[0].signal.aborted,true);
  assert.equal(requests[1].job.targetLanguage,'nl-NL');
  requests[0].onProgress('WRONG OLD TARGET');requests[0].resolve({translation:'WRONG OLD TARGET'});await tick();
  assert.doesNotMatch(document.getElementById('translation').textContent,/WRONG/);
  requests[1].resolve({translation:'Hallo',targetLanguage:'nl-NL'});await tick();
  assert.equal(document.getElementById('translation').textContent,'Hallo');
});

test('a late speculative preview cannot overwrite the completed English phrase',async()=>{
  const requests=[];
  const {run,document}=app({requestTranslation:(job,{onProgress,signal})=>new Promise(resolve=>requests.push({job,onProgress,signal,resolve}))});
  run("var preview=translateText('Bonjour')");await tick();
  run("queueFinalTranslation('Bonjour')");await tick();
  assert.equal(requests[0].signal.aborted,true);
  requests[1].resolve({translation:'Hello'});await tick();
  requests[0].onProgress('Bonjour');requests[0].resolve({translation:'Bonjour'});await run('preview');
  assert.equal(document.getElementById('translation').textContent,'Hello');
});

test('MP3 download snapshots completed turns and live translation continues while it is prepared',async()=>{
  let finishExport,snapshot,saved=0;
  const {run,document}=app({
    createConversationMp3:(turns)=>{snapshot=turns;return new Promise(resolve=>finishExport=resolve)},
    URL:{createObjectURL:()=> 'blob:conversation',revokeObjectURL(){}},
    requestTranslation:async job=>({translation:job.text==='Bonjour'?'Hello':'Thank you'})
  });
  const download=document.getElementById('downloadMp3'),link=document.getElementById('mp3Save');link.click=()=>saved++;
  run("queueFinalTranslation('Bonjour')");await tick();assert.equal(download.disabled,false);
  const exporting=download.onclick();
  run("queueFinalTranslation('Merci')");await tick();
  assert.equal(document.getElementById('translation').textContent,'Hello Thank you');
  assert.equal(snapshot.length,1);assert.equal(snapshot[0].source,'Bonjour');assert.equal(snapshot[0].translation,'Hello');
  finishExport(new Blob(['audio']));await exporting;
  assert.equal(saved,1);assert.equal(link.href,'blob:conversation');assert.match(link.download,/\.mp3$/);
  assert.equal(download.disabled,false);
});

test('Clear cancels an export and removes its conversation snapshot from the screen',async()=>{
  let signal;
  const {run,document}=app({createConversationMp3:(_,options)=>{signal=options.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}))}});
  run("queueFinalTranslation('Bonjour')");await tick();
  const exporting=document.getElementById('downloadMp3').onclick();
  document.getElementById('clear').onclick();await exporting;
  assert.equal(signal.aborted,true);assert.equal(document.getElementById('downloadMp3').disabled,true);
  assert.equal(document.getElementById('mp3Save').hidden,true);
  assert.equal(document.getElementById('translation').textContent,'Your translation will appear here.');
});

async function openTwoPersonMode(appFixture) {
  const {document: doc} = appFixture;
  await doc.getElementById('conversationSourceBtn').onclick();
  doc.getElementById('beginConversation').onclick();
}

function visibleTurns(doc) {
  return [...doc.getElementById('turnHistory').children, ...doc.getElementById('latestTurn').children];
}

test('two people keep fixed languages, finish recognition, and hear each completed turn in the opposite language', async () => {
  const instances = [];
  const requests = [];
  const voice = [];
  let stop;
  class Recognition {
    constructor() { instances.push(this); }
    start() {}
    stop() { stop = this; }
  }
  const {run, document: doc, context} = app({
    window: {addEventListener(){}, SpeechRecognition: Recognition},
    requestTranslation: async job => {
      requests.push(job);
      return {translation: job.targetLanguage === 'ar-AE' ? 'الموعد يوم الثلاثاء' : 'Please bring your ID.'};
    }
  });
  context.voice = voice;
  run(`startListening=async()=>{startBrowserFallback()}; speakText=(text,options)=>voice.push([text,options.lang]);
       committedTranscript='Existing microphone transcript'; document.getElementById('conversationAutoplay').checked=true`);
  await openTwoPersonMode({document: doc});
  const first = doc.getElementById('personOneTurn');
  const second = doc.getElementById('personTwoTurn');
  assert.equal(doc.getElementById('singleTranslationPanels').hidden, true);
  first.onclick();
  assert.equal(instances[0].lang, 'en-US');
  assert.equal(second.disabled, true);
  first.onclick();
  assert.equal(stop, instances[0]);
  assert.equal(first.disabled && second.disabled, true);
  stop.onresult({resultIndex:0, results:[Object.assign([{transcript:'The appointment is on Tuesday.'}], {isFinal:true})]});
  stop.onend();
  await tick();
  assert.equal(visibleTurns(doc).length, 1);
  assert.match(visibleTurns(doc)[0].textContent, /الموعد.*Tuesday/);
  assert.equal(second.disabled, false);
  assert.equal(doc.activeElement, second);

  second.onclick();
  assert.equal(instances[1].lang, 'ar-AE');
  second.onclick();
  stop.onresult({resultIndex:0, results:[Object.assign([{transcript:'أحضر بطاقة الهوية'}], {isFinal:true})]});
  stop.onend();
  await tick();
  assert.deepEqual(requests.map(job => [job.sourceLanguage, job.targetLanguage, job.quality]), [
    ['en-US', 'ar-AE', 'accurate'], ['ar-AE', 'en-US', 'accurate']
  ]);
  assert.equal(requests[1].context[0], 'الموعد يوم الثلاثاء');
  assert.deepEqual(voice.map(([message, lang]) => [message, lang]), [
    ['الموعد يوم الثلاثاء', 'ar-AE'], ['Please bring your ID.', 'en-US']
  ]);
  assert.equal(visibleTurns(doc).length, 2);
  assert.match(visibleTurns(doc)[0].textContent, /الموعد.*Tuesday/);
  assert.match(visibleTurns(doc)[1].textContent, /Please bring your ID.*الهوية/);
  await doc.getElementById('micSourceBtn').onclick();
  assert.equal(doc.getElementById('singleTranslationPanels').hidden, false);
  assert.equal(run('committedTranscript'), 'Existing microphone transcript');
  assert.equal(doc.getElementById('inputLang').value, 'fr-FR');
  assert.equal(doc.getElementById('outputLang').value, 'en-US');
});

test('a slow turn blocks handoff through playback and a retry updates only the failed message', async () => {
  let resolveFirst, finishPlayback;
  let shouldFail = true;
  const voice = [];
  const {run, document: doc, context} = app({
    requestTranslation: job => {
      if (job.text === 'First') return new Promise(resolve => { resolveFirst = resolve; });
      if (shouldFail) throw new Error('Service unavailable');
      return Promise.resolve({translation:'Second translated', needsReview:true});
    }
  });
  context.voice = voice;
  context.playback = new Promise(resolve => { finishPlayback = resolve; });
  run(`startListening=async()=>{}; speakText=(text,options)=>{
    voice.push([text,options.lang]);options.feedback.onPlaying();liveVoiceQueue=playback;return true;
  };
       document.getElementById('conversationAutoplay').checked=true`);
  await openTwoPersonMode({document: doc});
  doc.getElementById('personOneTurn').onclick();
  run("commitCapturedSpeech('First')");
  await run('conversation.finish()');
  const other = doc.getElementById('personTwoTurn');
  const status = doc.getElementById('status');
  assert.equal(other.disabled, true);
  assert.equal(status.textContent, 'Translating…');
  other.onclick();
  assert.equal(visibleTurns(doc).length, 1);
  resolveFirst({translation:'First translated'});
  await tick();
  assert.equal(other.disabled, true);
  assert.match(status.textContent, /Playing translation/);
  assert.equal(voice.length, 1);
  assert.equal(doc.getElementById('skipConversationAudio').hidden, false);
  doc.getElementById('skipConversationAudio').onclick();
  assert.equal(other.disabled, false);
  other.onclick();
  finishPlayback();
  await tick();
  assert.equal(other.disabled, false);
  run("commitCapturedSpeech('Second')");
  await run('conversation.finish()');
  await tick();
  const [first, second] = visibleTurns(doc);
  assert.match(second.textContent, /could not be translated/);
  shouldFail = false;
  const retry = second.children.find(element => element.textContent === 'Retry translation');
  retry.onclick();
  await tick();
  assert.match(first.textContent, /First translated/);
  assert.match(second.textContent, /Second translated.*speech was unclear/);
  assert.equal(retry.hidden, true);
  assert.equal(voice.length, 1);
  doc.getElementById('endConversation').onclick();
  assert.equal(status.textContent, 'Conversation ended.');
  assert.equal(visibleTurns(doc).length, 2);
  assert.equal(doc.getElementById('downloadMp3').disabled, false);
  assert.equal(doc.getElementById('latestTurn').children[0], second);
  doc.getElementById('newConversation').onclick();
  assert.equal(doc.getElementById('confirmNewConversation').hidden, false);
  assert.equal(visibleTurns(doc).length, 2);
  doc.getElementById('keepConversation').onclick();
  assert.equal(visibleTurns(doc).length, 2);
  doc.getElementById('newConversation').onclick();
  doc.getElementById('startOverConversation').onclick();
  assert.equal(visibleTurns(doc).length, 0);
  assert.equal(doc.getElementById('conversationSetup').hidden, false);
});

test('continuing through a delayed translation preserves the result without late audio', async () => {
  let translateFirst;
  const voice = [];
  const {run, document: doc, context} = app({
    requestTranslation: ({text}) => text === 'First'
      ? new Promise(resolve => { translateFirst = resolve; })
      : Promise.resolve({translation: 'Second translated'})
  });
  context.voice = voice;
  run(`startListening=async()=>{statusEl.textContent='Listening'}; speakText=text=>voice.push(text);
       document.getElementById('conversationAutoplay').checked=true`);
  await openTwoPersonMode({document: doc});
  const first = doc.getElementById('personOneTurn');
  const second = doc.getElementById('personTwoTurn');
  const proceed = doc.getElementById('continueConversation');
  first.onclick();
  run("commitCapturedSpeech('First')");
  await run('conversation.finish()');
  assert.equal(second.disabled, true);
  assert.equal(proceed.hidden, false);
  proceed.onclick();
  assert.equal(proceed.hidden, true);
  assert.equal(second.disabled, false);
  second.onclick();
  translateFirst({translation: 'First translated'});
  await tick();
  assert.equal(doc.getElementById('status').textContent, 'Listening');
  assert.equal(voice.length, 0);
  assert.match(visibleTurns(doc)[0].textContent, /First translated/);
  run("commitCapturedSpeech('Second')");
  await run('conversation.finish()');
  await tick();
  assert.deepEqual(voice, ['Second translated']);
});

test('two-person setup blocks duplicate languages and an unavailable microphone unlocks both speakers', async () => {
  const {document: doc} = app();
  await doc.getElementById('conversationSourceBtn').onclick();
  const secondLanguage = doc.getElementById('personTwoLanguage');
  const start = doc.getElementById('beginConversation');
  secondLanguage.value = 'en-US';
  secondLanguage.onchange();
  assert.equal(start.disabled, true);
  secondLanguage.value = 'ar-AE';
  secondLanguage.onchange();
  start.onclick();
  const first = doc.getElementById('personOneTurn');
  first.onclick();
  assert.match(doc.getElementById('status').textContent, /not supported/);
  assert.equal(visibleTurns(doc).length, 0);
  assert.equal(first.disabled, false);
  assert.equal(doc.getElementById('personTwoTurn').disabled, false);
});

test('finishing capture sends every queued frame then EOF while refusing later audio', async () => {
  const capture = createPcmBuffer(() => assert.fail('Buffer did not overflow'));
  const reader = capture.open().getReader();
  const first = new Uint8Array([1]);
  const second = new Uint8Array([2]);
  capture.push(first);
  capture.push(second);
  capture.finish();
  capture.push(new Uint8Array([3]));
  assert.deepEqual(await reader.read(), {value:first, done:false});
  assert.deepEqual(await reader.read(), {value:second, done:false});
  assert.deepEqual(await reader.read(), {value:undefined, done:true});
});

test('finishing an empty microphone stream releases a waiting reader', async () => {
  const capture = createPcmBuffer(() => {});
  const reader = capture.open().getReader();
  const pending = reader.read();
  await tick();
  capture.finish();
  assert.deepEqual(await pending, {value:undefined, done:true});
});

test('conversation drains captured PCM through realtime transcription and keeps the final words', async () => {
  let processor, pcmBytes = 0, stopped = 0, hint;
  const track = {readyState:'live', addEventListener(){}, stop(){ this.readyState='ended'; stopped++; }};
  const stream = {getTracks:()=>[track], getAudioTracks:()=>[track]};
  const node = () => ({connect(){}, disconnect(){}});
  class AudioContext {
    sampleRate = 24000;
    state = 'running';
    destination = {};
    createMediaStreamSource() { return node(); }
    createScriptProcessor() { return processor = node(); }
    createGain() { return {...node(), gain:{value:1}}; }
    async close() {}
  }
  const translated = [];
  const fixture = app({
    navigator:{onLine:true, mediaDevices:{getUserMedia:async()=>stream}},
    window:{addEventListener(){}, AudioContext},
    createGateway:()=>({transcriptionModel:()=>({})}),
    fetch:async()=>({ok:true, json:async()=>({token:'mock', model:WHISPER_MODEL})}),
    streamTranscribe:({audio, providerOptions}) => ({
      async *fullStream() {
        hint = providerOptions.openai.language;
        const reader = audio.getReader();
        let seenAudio = false;
        try {
          for (;;) {
            const {value,done} = await reader.read();
            if (done) break;
            pcmBytes += value.byteLength;
            if (!seenAudio) {
              seenAudio = true;
              yield {type:'transcript-partial', id:'message', text:'الموعد الساعة'};
            }
          }
          yield {type:'transcript-final', id:'message', text:'الموعد الساعة ٩:١٥'};
        } finally {
          reader.releaseLock();
        }
      }
    }),
    requestTranslation: async payload => {
      if (payload.quality === 'fast') return {translation:'The appointment is at'};
      translated.push(payload);
      return {translation:'The appointment is at 9:15.'};
    }
  });
  // Expose the same async iterable shape the transcriber returns.
  const transcribe = fixture.context.streamTranscribe;
  fixture.context.streamTranscribe = params => ({fullStream:transcribe(params).fullStream()});
  await openTwoPersonMode(fixture);
  const {document: doc} = fixture;
  const speaker = doc.getElementById('personTwoTurn');
  speaker.onclick();
  await tick();
  processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(480).fill(0.1)}});
  await tick();
  assert.match(visibleTurns(doc).map(turn => turn.textContent).join(' '), /الموعد الساعة/);
  speaker.onclick();
  await tick();
  assert.equal(hint, 'ar');
  assert.equal(pcmBytes, 960);
  assert.ok(stopped > 0);
  assert.equal(translated[0].text, 'الموعد الساعة ٩:١٥');
  assert.equal(translated[0].targetLanguage, 'en-US');
  assert.match(visibleTurns(doc).map(turn => turn.textContent).join(' '), /The appointment is at 9:15/);
  assert.equal(speaker.disabled, false);
});
