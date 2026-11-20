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
const frontend=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function app(extra={}){
  const document=createDocument();
  document.getElementById('inputLang').value='fr-FR';document.getElementById('outputLang').value='en-US';
  const context=vm.createContext({document,navigator:{onLine:true,mediaDevices:{}},window:{addEventListener(){}},
    localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,setInterval,clearInterval,console,AbortController,
    createLiveText,OrderedTranslationQueue,requestTranslation:async()=>({translation:'Hello'}),splitPhrases,shouldRecover,speechProviderOptions,createPcmBuffer,guessSourceLanguage,LIVE_TRANSCRIBE_MODEL,WHISPER_MODEL,URLSearchParams,performance,...extra});
  vm.runInContext(frontend,context);return {context,document,run:code=>vm.runInContext(code,context)};
}

test('language picker and selected languages use bundled country flags',()=>{
  const {document,run}=app();
  const css=readFileSync(new URL('../public/language-flags.css',import.meta.url),'utf8');
  assert.equal(document.getElementById('outputFlag').dataset.flag,'gb');
  run("pickerTarget='output';renderLanguagePicker('Welsh')");
  const row=document.getElementById('languageResults').children[1].children[0];
  assert.equal(row.children[0].dataset.flag,'gb-wls');
  assert.equal(row.children[1].textContent,'Welsh');
  run("input.value='auto';updateLanguageButtons()");
  assert.equal(document.getElementById('inputFlag').dataset.flag,undefined);
  assert.equal(document.getElementById('inputFlag').textContent,'🌐');
  for(const flag of run("LANGUAGES.map(({code})=>{const element=document.createElement('span');renderLanguageFlag(element,code);return element.dataset.flag})")){
    assert.ok(css.includes(`[data-flag="${flag}"]`),`Missing artwork for ${flag}`);
  }
});

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
    return {ok:true,headers:new Headers({'Content-Type':'audio/mpeg'}),blob:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))};
  }});
  run("speakText('Synthetic speech')");await tick();
  const timeout=[...clock.timers.values()].find(x=>x.ms===12_000);
  assert.ok(timeout,'timeout must remain active until audio bytes finish');
  timeout.fn();await run('liveVoiceQueue');assert.equal(signal.aborted,true);
});
test('manual Speak can replay prepared audio with a tap if automatic playback is blocked',async()=>{
  let audio,requests=0,gesture=false;
  class Audio{
    constructor(){audio=this}
    async play(){if(this.src==='blob:voice'&&!gesture)throw new DOMException('Blocked','NotAllowedError')}
  }
  const {run,document}=app({Audio,URL:{createObjectURL:()=> 'blob:voice',revokeObjectURL(){}},
    fetch:async()=>{requests++;return new Response(new Uint8Array([1]),{headers:{'Content-Type':'audio/mpeg'}})}});
  run("speakText('Good morning',{replace:true})");await tick();
  const button=document.getElementById('speak');
  assert.match(button.textContent,/Play voice/);
  gesture=true;button.onclick();await tick();audio.onended();await run('liveVoiceQueue');
  assert.equal(requests,1);assert.equal(button.textContent,'🔊 Speak');
});
test('cancelling prepared voice releases the blocked player and clears its retry',async()=>{
  let paused=0,revoked=0;
  class Audio{
    async play(){if(this.src==='blob:voice')throw new DOMException('Blocked','NotAllowedError')}
    pause(){paused++}
  }
  const {run,document}=app({Audio,URL:{createObjectURL:()=> 'blob:voice',revokeObjectURL(){revoked++}},
    fetch:async()=>new Response(new Uint8Array([1]),{headers:{'Content-Type':'audio/mpeg'}})});
  run("speakText('Good morning',{replace:true})");await tick();
  assert.match(document.getElementById('speak').textContent,/Play voice/);
  const queue=run('liveVoiceQueue');
  run('cancelVoice()');await queue;
  assert.equal(paused,1);assert.equal(revoked,1);
  assert.equal(run('retryVoicePlayback'),null);
  assert.equal(document.getElementById('speak').textContent,'🔊 Speak');
});
test('listening requests the speech token while microphone capture is starting',async()=>{
  const clock=fakeTimers();let finishCapture;const stages=[];
  const {run,context}=app({...clock,navigator:{onLine:true,mediaDevices:{getUserMedia(){}}},
    fetch:async()=>{stages.push('token');return {ok:true,json:async()=>({token:'test'})}}});
  context.capture=()=>{stages.push('microphone');return new Promise(resolve=>{finishCapture=resolve})};
  run('createMicrophonePcmStream=capture;wantsListening=true;var listening=startListening()');
  assert.deepEqual(stages,['microphone','token']);
  await run('stopListening()');finishCapture(null);await run('listening');
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
  let finishExport,snapshot;
  const {run,document}=app({
    createConversationMp3:(turns)=>{snapshot=turns;return new Promise(resolve=>finishExport=resolve)},
    URL:{createObjectURL:()=> 'blob:conversation',revokeObjectURL(){}},
    requestTranslation:async job=>({translation:job.text==='Bonjour'?'Hello':'Thank you'})
  });
  const download=document.getElementById('downloadMp3'),link=document.getElementById('mp3Save');
  link.click=()=>assert.fail('The save link needs a direct user gesture');
  run("queueFinalTranslation('Bonjour')");await tick();assert.equal(download.disabled,false);
  const exporting=download.onclick();
  assert.match(document.getElementById('mp3Status').textContent,/Preparing MP3/);
  run("queueFinalTranslation('Merci')");await tick();
  assert.equal(document.getElementById('translation').textContent,'Hello Thank you');
  assert.equal(snapshot.length,1);assert.equal(snapshot[0].source,'Bonjour');assert.equal(snapshot[0].translation,'Hello');
  finishExport(new Blob(['audio']));await exporting;
  assert.equal(link.hidden,false);assert.equal(link.href,'blob:conversation');assert.match(link.download,/\.mp3$/);
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

test('conversation finishes each turn before reversing languages and preserves both turns for export',async()=>{
  const requests=[];
  const {run,document}=app({requestTranslation:async(job,{onProgress})=>{
    requests.push([job.sourceLanguage,job.targetLanguage,job.text]);
    onProgress(job.targetLanguage==='en-US'?'Good':'Bon');
    return {translation:job.targetLanguage==='en-US'?'Good morning':'Bonjour'};
  }});
  await run("setAudioSource('conversation')");
  run("beginListening=async()=>{wantsListening=true}; conversationLanguages=['en-US','fr-FR']");
  await run('startConversationTurn()');
  run("interimTranscript='Good morning'");
  await run('endConversationTurn()');
  await tick();
  assert.equal(document.getElementById('conversationAction').textContent,'Person 2 · Speak');
  assert.equal(document.getElementById('conversationHistory').children[0].children[2].textContent,'Bonjour');
  await run('startConversationTurn()');
  run("interimTranscript='Bonjour'");
  await run('endConversationTurn(true)');
  await tick();
  assert.equal(document.getElementById('conversationAction').textContent,'Start conversation');
  assert.equal(document.getElementById('conversationHistory').children[1].children[2].textContent,'Good morning');
  assert.deepEqual(requests,[['en-US','fr-FR','Good morning'],['fr-FR','en-US','Bonjour']]);
  assert.equal(run('conversationTurns.length'),2);
  assert.equal(document.getElementById('downloadMp3').disabled,false);
});
