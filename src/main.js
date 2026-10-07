import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createGateway } from '@ai-sdk/gateway';

const LANGUAGES = [
  {code:'en-US',name:'English',flag:'🇬🇧',region:'Western Europe'},
  {code:'fr-FR',name:'French',flag:'🇫🇷',region:'Western Europe'},
  {code:'nl-NL',name:'Dutch',flag:'🇳🇱',region:'Western Europe'},
  {code:'de-DE',name:'German',flag:'🇩🇪',region:'Western Europe'},
  {code:'lb-LU',name:'Luxembourgish',flag:'🇱🇺',region:'Western Europe'},
  {code:'ga-IE',name:'Irish',flag:'🇮🇪',region:'Western Europe'},
  {code:'da-DK',name:'Danish',flag:'🇩🇰',region:'Northern Europe'},
  {code:'sv-SE',name:'Swedish',flag:'🇸🇪',region:'Northern Europe'},
  {code:'no-NO',name:'Norwegian',flag:'🇳🇴',region:'Northern Europe'},
  {code:'fi-FI',name:'Finnish',flag:'🇫🇮',region:'Northern Europe'},
  {code:'is-IS',name:'Icelandic',flag:'🇮🇸',region:'Northern Europe'},
  {code:'et-EE',name:'Estonian',flag:'🇪🇪',region:'Northern Europe'},
  {code:'lv-LV',name:'Latvian',flag:'🇱🇻',region:'Northern Europe'},
  {code:'lt-LT',name:'Lithuanian',flag:'🇱🇹',region:'Northern Europe'},
  {code:'pl-PL',name:'Polish',flag:'🇵🇱',region:'Central Europe'},
  {code:'cs-CZ',name:'Czech',flag:'🇨🇿',region:'Central Europe'},
  {code:'sk-SK',name:'Slovak',flag:'🇸🇰',region:'Central Europe'},
  {code:'hu-HU',name:'Hungarian',flag:'🇭🇺',region:'Central Europe'},
  {code:'ro-RO',name:'Romanian',flag:'🇷🇴',region:'Central Europe'},
  {code:'rm-CH',name:'Romansh',flag:'🇨🇭',region:'Central Europe'},
  {code:'it-IT',name:'Italian',flag:'🇮🇹',region:'Southern Europe'},
  {code:'es-ES',name:'Spanish',flag:'🇪🇸',region:'Southern Europe'},
  {code:'pt-PT',name:'Portuguese',flag:'🇵🇹',region:'Southern Europe'},
  {code:'el-GR',name:'Greek',flag:'🇬🇷',region:'Southern Europe'},
  {code:'mt-MT',name:'Maltese',flag:'🇲🇹',region:'Southern Europe'},
  {code:'ca-ES',name:'Catalan',flag:'🏴',region:'Southern Europe'},
  {code:'bg-BG',name:'Bulgarian',flag:'🇧🇬',region:'Eastern Europe & Balkans'},
  {code:'hr-HR',name:'Croatian',flag:'🇭🇷',region:'Eastern Europe & Balkans'},
  {code:'sl-SI',name:'Slovenian',flag:'🇸🇮',region:'Eastern Europe & Balkans'},
  {code:'sr-RS',name:'Serbian',flag:'🇷🇸',region:'Eastern Europe & Balkans'},
  {code:'bs-BA',name:'Bosnian',flag:'🇧🇦',region:'Eastern Europe & Balkans'},
  {code:'sq-AL',name:'Albanian',flag:'🇦🇱',region:'Eastern Europe & Balkans'},
  {code:'mk-MK',name:'Macedonian',flag:'🇲🇰',region:'Eastern Europe & Balkans'},
  {code:'uk-UA',name:'Ukrainian',flag:'🇺🇦',region:'Eastern Europe & Balkans'},
  {code:'ru-RU',name:'Russian',flag:'🇷🇺',region:'Eastern Europe & Balkans'},
  {code:'tr-TR',name:'Turkish',flag:'🇹🇷',region:'Middle East & Asia'},
  {code:'ar-SA',name:'Arabic',flag:'🇸🇦',region:'Middle East & Asia'},
  {code:'zh-CN',name:'Chinese (Mandarin)',flag:'🇨🇳',region:'Middle East & Asia'},
  {code:'hi-IN',name:'Hindi',flag:'🇮🇳',region:'South Asia'},
  {code:'ml-IN',name:'Malayalam',flag:'🇮🇳',region:'South Asia'},
  {code:'ta-IN',name:'Tamil',flag:'🇮🇳',region:'South Asia'},
  {code:'te-IN',name:'Telugu',flag:'🇮🇳',region:'South Asia'},
  {code:'kn-IN',name:'Kannada',flag:'🇮🇳',region:'South Asia'}
];

const THEMES = [
  {id:'calm',name:'Calm',desc:'Light, soft and focused',icon:'◌'},
  {id:'electric',name:'Electric',desc:'Bold, energetic and vivid',icon:'⚡'},
  {id:'sport',name:'Sport',desc:'Fast, warm and dynamic',icon:'●'},
  {id:'professional',name:'Professional',desc:'Clean, structured and precise',icon:'▦'},
  {id:'elegant',name:'Elegant',desc:'Warm, refined and understated',icon:'◇'}
];

const mic=document.getElementById('mic');
const statusEl=document.getElementById('status');
const speechState=document.getElementById('speechState');
const translationState=document.getElementById('translationState');
const transcriptEl=document.getElementById('transcript');
const translationEl=document.getElementById('translation');
const input=document.getElementById('inputLang');
const output=document.getElementById('outputLang');
const copyBtn=document.getElementById('copy');
const speakBtn=document.getElementById('speak');
const diagnosticEl=document.getElementById('diagnostic');
const diagnosticBody=document.getElementById('diagnosticBody');

let isListening=false, committedTranscript='', interimTranscript='';
let audioController=null, mediaStream=null, audioContext=null, sourceNode=null, processorNode=null, muteNode=null;
let translateTimer=null, translateController=null, translateSequence=0, lastRequestedText='', transcriptionSession=0;
let pickerTarget='input';
let wantsListening=false, reconnectAttempts=0, reconnectTimer=null, sessionLimitTimer=null;
let diagnosticState={network:'idle',token:'idle',microphone:'idle',realtime:'idle',fallback:'idle',error:''};

function renderDiagnostics(){
  if(!diagnosticEl||!diagnosticBody)return;
  const icon=(v)=>v==='ok'?'✓':v==='pending'?'…':v==='error'?'✕':'–';
  diagnosticEl.classList.add('show');
  diagnosticBody.innerHTML=
    'Network '+icon(diagnosticState.network)+' · '+
    'Token '+icon(diagnosticState.token)+' · '+
    'Microphone '+icon(diagnosticState.microphone)+' · '+
    'Realtime '+icon(diagnosticState.realtime)+' · '+
    'Fallback '+icon(diagnosticState.fallback)+
    (diagnosticState.error?'<div class="diagError">Last failure: '+diagnosticState.error.replace(/[<>&]/g,'')+'</div>':'');
}

function setDiagnostic(key,value,error=''){
  diagnosticState[key]=value;
  if(error)diagnosticState.error=String(error).slice(0,180);
  renderDiagnostics();
}

function resetDiagnostics(){
  diagnosticState={network:navigator.onLine?'ok':'error',token:'idle',microphone:'idle',realtime:'idle',fallback:'idle',error:''};
  renderDiagnostics();
}
let browserRecognition=null, usingBrowserFallback=false;
const MAX_SESSION_MS=30*60*1000;
const MAX_RECONNECTS=2;

const store={
  get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},
  set(key,value){localStorage.setItem(key,JSON.stringify(value))}
};

let favorites=store.get('vt-favorites',['en-US','fr-FR']);
let recents=store.get('vt-recents',['en-US','fr-FR']);
let counts=store.get('vt-counts',{});

function language(code){return LANGUAGES.find(l=>l.code===code)||LANGUAGES[0]}
function normalizeSpaces(v){return v.replace(/\s+/g,' ').trim()}
function setTranscript(text){transcriptEl.textContent=text||'Your speech will appear here.';transcriptEl.className=text?'textBox':'textBox placeholder'}
function setTranslation(text){translationEl.textContent=text||'Your translation will appear here.';translationEl.className=text?'textBox':'textBox placeholder'}
function currentTranscript(){return normalizeSpaces(committedTranscript+' '+interimTranscript)}

function updateLanguageButtons(){
  const a=language(input.value),b=language(output.value);
  document.getElementById('inputFlag').textContent=a.flag;document.getElementById('inputName').textContent=a.name;
  document.getElementById('outputFlag').textContent=b.flag;document.getElementById('outputName').textContent=b.name;
}

function noteUse(code){
  counts[code]=(counts[code]||0)+1;store.set('vt-counts',counts);
  recents=[code,...recents.filter(x=>x!==code)].slice(0,6);store.set('vt-recents',recents);
}

function openSheet(id){const el=document.getElementById(id);el.classList.add('open');el.setAttribute('aria-hidden','false')}
function closeSheet(id){const el=document.getElementById(id);el.classList.remove('open');el.setAttribute('aria-hidden','true')}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeSheet(b.dataset.close));
document.querySelectorAll('.sheetBackdrop').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)closeSheet(el.id)}));

function renderLanguagePicker(query=''){
  const host=document.getElementById('languageResults');
  const q=query.trim().toLowerCase();
  host.innerHTML='';
  const filtered=LANGUAGES.filter(l=>!q||l.name.toLowerCase().includes(q)||l.region.toLowerCase().includes(q));
  const sections=[];
  if(!q){
    const fav=filtered.filter(l=>favorites.includes(l.code));
    const recent=recents.map(language).filter((l,i,a)=>a.findIndex(x=>x.code===l.code)===i && !favorites.includes(l.code));
    const frequent=[...filtered].filter(l=>(counts[l.code]||0)>0&&!favorites.includes(l.code)&&!recents.includes(l.code)).sort((a,b)=>(counts[b.code]||0)-(counts[a.code]||0)).slice(0,5);
    if(fav.length)sections.push(['Favorites',fav]);
    if(recent.length)sections.push(['Recent',recent]);
    if(frequent.length)sections.push(['Frequently used',frequent]);
  }
  const regions=[...new Set(filtered.map(l=>l.region))];
  regions.forEach(r=>sections.push([r,filtered.filter(l=>l.region===r)]));
  const seen=new Set();
  for(const [title,items] of sections){
    const unique=items.filter(l=>q||!seen.has(l.code));
    if(!unique.length)continue;
    if(!q)unique.forEach(l=>seen.add(l.code));
    const h=document.createElement('div');h.className='groupTitle';h.textContent=title;host.appendChild(h);
    const list=document.createElement('div');list.className='langList';
    unique.forEach(l=>{
      const row=document.createElement('div');row.className='langItem';
      const flag=document.createElement('div');flag.className='flag';flag.textContent=l.flag;
      const choose=document.createElement('button');choose.className='langItemMain';choose.textContent=l.name;
      choose.onclick=()=>selectLanguage(l.code);
      const star=document.createElement('button');star.className='starBtn'+(favorites.includes(l.code)?' active':'');star.textContent=favorites.includes(l.code)?'★':'☆';star.setAttribute('aria-label','Favorite '+l.name);
      star.onclick=()=>{favorites=favorites.includes(l.code)?favorites.filter(x=>x!==l.code):[...favorites,l.code];store.set('vt-favorites',favorites);renderLanguagePicker(document.getElementById('languageSearch').value)};
      row.append(flag,choose,star);list.appendChild(row);
    });
    host.appendChild(list);
  }
  if(!host.children.length){const empty=document.createElement('div');empty.className='groupTitle';empty.textContent='No languages found';host.appendChild(empty)}
}

async function selectLanguage(code){
  const resumeListening=wantsListening&&pickerTarget==='input';
  if(resumeListening)await stopListening(false);
  if(pickerTarget==='input')input.value=code;else output.value=code;
  noteUse(code);updateLanguageButtons();closeSheet('languageSheet');
  const text=currentTranscript();if(text){lastRequestedText='';scheduleTranslation(text,true)}
  if(resumeListening){wantsListening=true;reconnectAttempts=0;await startListening(false)}
}

function launchLanguagePicker(target){
  pickerTarget=target;
  document.getElementById('sheetTitle').textContent=target==='input'?'Choose input language':'Choose translation language';
  const search=document.getElementById('languageSearch');search.value='';renderLanguagePicker();openSheet('languageSheet');setTimeout(()=>search.focus(),150);
}
document.getElementById('inputPicker').onclick=()=>launchLanguagePicker('input');
document.getElementById('outputPicker').onclick=()=>launchLanguagePicker('output');
document.getElementById('languageSearch').addEventListener('input',e=>renderLanguagePicker(e.target.value));

function applyTheme(id){
  const chosen=THEMES.some(t=>t.id===id)?id:'calm';
  document.documentElement.dataset.theme=chosen;store.set('vt-theme',chosen);
  document.querySelectorAll('.themeChoice').forEach(x=>x.classList.toggle('active',x.dataset.theme===chosen));
}
function renderThemes(){
  const host=document.getElementById('themeGrid');host.innerHTML='';
  THEMES.forEach(t=>{const b=document.createElement('button');b.className='themeChoice';b.dataset.theme=t.id;b.innerHTML='<span>'+t.icon+' '+t.name+'</span><small>'+t.desc+'</small>';b.onclick=()=>{applyTheme(t.id);setTimeout(()=>closeSheet('themeSheet'),120)};host.appendChild(b)});
  applyTheme(store.get('vt-theme','calm'));
}
document.getElementById('themeBtn').onclick=()=>{renderThemes();openSheet('themeSheet')};

function floatTo16BitPCM(float32){const buffer=new ArrayBuffer(float32.length*2),view=new DataView(buffer);for(let i=0,o=0;i<float32.length;i++,o+=2){const s=Math.max(-1,Math.min(1,float32[i]));view.setInt16(o,s<0?s*0x8000:s*0x7fff,true)}return new Uint8Array(buffer)}
function resampleTo24k(samples,inputRate){if(inputRate===24000)return samples;const ratio=inputRate/24000,len=Math.max(1,Math.round(samples.length/ratio)),out=new Float32Array(len);for(let i=0;i<len;i++){const p=i*ratio,l=Math.floor(p),r=Math.min(l+1,samples.length-1),f=p-l;out[i]=samples[l]*(1-f)+samples[r]*f}return out}

function scheduleTranslation(text,immediate=false){const clean=normalizeSpaces(text);clearTimeout(translateTimer);if(!clean){lastRequestedText='';setTranslation('');translationState.textContent='';return}translateTimer=setTimeout(()=>translateText(clean),immediate?0:750)}
async function translateText(text){
  if(text===lastRequestedText&&!translationEl.classList.contains('placeholder'))return;
  lastRequestedText=text;const seq=++translateSequence;if(translateController)translateController.abort();translateController=new AbortController();translationState.textContent='Translating…';
  try{
    const response=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},signal:translateController.signal,body:JSON.stringify({text,sourceLanguage:input.value,targetLanguage:output.value})});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.detail||data.error||'Translation request failed');if(seq!==translateSequence)return;
    setTranslation(data.translation||'');translationState.textContent=isListening?'Live':'Ready';
  }catch(error){if(error.name==='AbortError')return;console.error(error);translationState.textContent='Translation unavailable';statusEl.textContent='Translation service error. Speech transcription is still active.'}
}

async function createMicrophonePcmStream(){
  mediaStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  audioContext=new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000,latencyHint:'interactive'});if(audioContext.state==='suspended')await audioContext.resume();
  sourceNode=audioContext.createMediaStreamSource(mediaStream);processorNode=audioContext.createScriptProcessor(4096,1,1);muteNode=audioContext.createGain();muteNode.gain.value=0;
  const pcmStream=new ReadableStream({start(controller){audioController=controller;processorNode.onaudioprocess=e=>{if(!isListening||!audioController)return;const pcm=floatTo16BitPCM(resampleTo24k(e.inputBuffer.getChannelData(0),audioContext.sampleRate));try{controller.enqueue(pcm)}catch{}}},cancel(){audioController=null}});
  sourceNode.connect(processorNode);processorNode.connect(muteNode);muteNode.connect(audioContext.destination);return pcmStream;
}

async function cleanupAudio(){
  isListening=false;
  if(processorNode){processorNode.onaudioprocess=null;try{processorNode.disconnect()}catch{}}
  if(sourceNode){try{sourceNode.disconnect()}catch{}}
  if(muteNode){try{muteNode.disconnect()}catch{}}
  if(audioController){try{audioController.close()}catch{}audioController=null}
  if(mediaStream){mediaStream.getTracks().forEach(t=>t.stop());mediaStream=null}
  if(audioContext){try{await audioContext.close()}catch{}audioContext=null}
  sourceNode=processorNode=muteNode=null;
}

function browserSpeechSupported(){
  return Boolean(window.SpeechRecognition||window.webkitSpeechRecognition);
}

function startBrowserFallback(){
  if(!wantsListening||usingBrowserFallback||!browserSpeechSupported()){setDiagnostic('fallback','error','Browser speech fallback unavailable');return false;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  browserRecognition=new Recognition();
  browserRecognition.continuous=true;
  browserRecognition.interimResults=true;
  browserRecognition.lang=input.value;
  usingBrowserFallback=true;
  setDiagnostic('fallback','ok');

  speechState.textContent='Listening';
  statusEl.innerHTML='<span class="liveDot"></span>Listening — compatibility mode';

  browserRecognition.onresult=(event)=>{
    let interim='';
    let finalChunk='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const text=event.results[i][0]?.transcript||'';
      if(event.results[i].isFinal)finalChunk+=text+' ';
      else interim+=text;
    }
    if(finalChunk){
      committedTranscript=normalizeSpaces(committedTranscript+' '+finalChunk);
      interimTranscript='';
      const visible=currentTranscript();setTranscript(visible);scheduleTranslation(visible,true);
    }else{
      interimTranscript=interim;
      const visible=currentTranscript();setTranscript(visible);scheduleTranslation(visible);
    }
  };

  browserRecognition.onerror=(event)=>{
    console.warn('Browser speech fallback error:',event.error);
    if(event.error==='not-allowed'||event.error==='service-not-allowed'){
      wantsListening=false;
      usingBrowserFallback=false;
      speechState.textContent='Microphone blocked';
      statusEl.textContent='Microphone access is blocked. Allow microphone permission in your browser settings.';
      mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');
    }
  };

  browserRecognition.onend=()=>{
    if(usingBrowserFallback&&wantsListening){
      try{browserRecognition.start()}catch{}
    }
  };

  try{
    browserRecognition.start();
    return true;
  }catch(error){
    console.warn('Could not start browser fallback:',error);
    usingBrowserFallback=false;
    browserRecognition=null;
    setDiagnostic('fallback','error',error?.message||'Browser fallback failed');
    return false;
  }
}

function stopBrowserFallback(){
  usingBrowserFallback=false;
  if(browserRecognition){
    try{browserRecognition.onend=null;browserRecognition.stop()}catch{}
    browserRecognition=null;
  }
}

function scheduleReconnect(){
  if(!wantsListening)return;
  if(!navigator.onLine){
    speechState.textContent='Waiting for internet';
    statusEl.textContent='Connection lost — listening will resume automatically';
    return;
  }
  if(reconnectAttempts>=MAX_RECONNECTS){
    if(startBrowserFallback())return;
    wantsListening=false;
    mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');
    speechState.textContent='Disconnected';
    statusEl.textContent='Speech connection failed. Tap the microphone to try again.';
    return;
  }
  reconnectAttempts+=1;
  speechState.textContent='Reconnecting…';
  statusEl.textContent='Restoring microphone connection…';
  clearTimeout(reconnectTimer);
  reconnectTimer=setTimeout(()=>startListening(true),Math.min(600*reconnectAttempts,1800));
}

async function startListening(isReconnect=false){
  if(isListening||!wantsListening)return;
  if(!navigator.mediaDevices?.getUserMedia){wantsListening=false;statusEl.textContent='Microphone capture is not supported in this browser.';return}
  if(!navigator.onLine){setDiagnostic('network','error','Device is offline');scheduleReconnect();return}
  setDiagnostic('network','ok');

  const sessionId=++transcriptionSession;
  isListening=true;
  mic.classList.add('listening');mic.setAttribute('aria-label','Stop listening');mic.textContent='■';
  statusEl.innerHTML='<span class="liveDot"></span>'+(isReconnect?'Reconnecting…':'Starting microphone…');
  speechState.textContent=isReconnect?'Reconnecting…':'Connecting';

  if(!isReconnect){
    reconnectAttempts=0;
    clearTimeout(sessionLimitTimer);
    sessionLimitTimer=setTimeout(async()=>{
      if(!wantsListening)return;
      await stopListening(true);
      statusEl.textContent='30-minute session finished. Tap the microphone to start a new session.';
    },MAX_SESSION_MS);
  }

  let failureStage='token';
  try{
    setDiagnostic('token','pending');
    const tokenResponse=await fetch('/api/transcription-token',{method:'POST'});
    const tokenData=await tokenResponse.json().catch(()=>({}));
    if(!tokenResponse.ok||!tokenData.token)throw new Error((tokenData.error||'Speech service unavailable')+' (HTTP '+tokenResponse.status+')');
    setDiagnostic('token','ok');
    if(!wantsListening||sessionId!==transcriptionSession)return;

    failureStage='microphone';
    setDiagnostic('microphone','pending');
    const microphoneStream=await createMicrophonePcmStream();
    setDiagnostic('microphone','ok');
    const gateway=createGateway({apiKey:tokenData.token});
    failureStage='realtime';
    setDiagnostic('realtime','pending');
    const result=streamTranscribe({
      model:gateway.transcriptionModel('openai/gpt-realtime-whisper'),
      audio:microphoneStream,
      inputAudioFormat:{type:'audio/pcm',rate:24000}
    });

    reconnectAttempts=0;
    let receivedRealtimeEvent=false;
    statusEl.innerHTML='<span class="liveDot"></span>Listening — tap again to stop';
    speechState.textContent='Listening';
    noteUse(input.value);

    for await(const part of result.fullStream){
      if(!receivedRealtimeEvent){receivedRealtimeEvent=true;setDiagnostic('realtime','ok')}
      if(!wantsListening||sessionId!==transcriptionSession)break;
      if(part.type==='transcript-delta'){
        interimTranscript+=part.delta||'';
        const visible=currentTranscript();setTranscript(visible);
        speechState.textContent='Hearing you…';scheduleTranslation(visible);
      }
      if(part.type==='transcript-final'){
        const finalText=normalizeSpaces(part.text||interimTranscript);
        if(finalText)committedTranscript=normalizeSpaces(committedTranscript+' '+finalText);
        interimTranscript='';
        const visible=currentTranscript();setTranscript(visible);
        speechState.textContent='Captured';scheduleTranslation(visible,true);
      }
      if(part.type==='error')throw new Error(part.error?.message||part.message||'Speech connection interrupted');
    }

    if(wantsListening&&sessionId===transcriptionSession){
      if(!receivedRealtimeEvent)setDiagnostic('realtime','error','Realtime stream ended before any transcript event');
      await cleanupAudio();
      scheduleReconnect();
    }
  }catch(error){
    if(sessionId!==transcriptionSession)return;
    console.error('Speech session error:',error);
    setDiagnostic(failureStage,'error',error?.message||'Unknown speech error');
    await cleanupAudio();

    const name=error?.name||'';
    const message=String(error?.message||'').toLowerCase();
    const permissionDenied =
      name==='NotAllowedError' ||
      name==='SecurityError' ||
      message.includes('permission') ||
      message.includes('not allowed');

    const noMic =
      name==='NotFoundError' ||
      message.includes('no microphone') ||
      message.includes('requested device not found');

    if(permissionDenied){
      wantsListening=false;
      clearTimeout(reconnectTimer);
      mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');
      speechState.textContent='Microphone blocked';
      statusEl.textContent='Microphone access is blocked. On iPhone, open this page in Safari and allow microphone access.';
      return;
    }

    if(noMic){
      wantsListening=false;
      mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');
      speechState.textContent='No microphone';
      statusEl.textContent='No microphone was found on this device.';
      return;
    }

    if(wantsListening)scheduleReconnect();
  }
}

async function stopListening(updateUi=true){
  wantsListening=false;
  clearTimeout(reconnectTimer);clearTimeout(sessionLimitTimer);
  ++transcriptionSession;
  stopBrowserFallback();
  await cleanupAudio();
  mic.classList.remove('listening');mic.setAttribute('aria-label','Start listening');mic.textContent='🎤';
  if(updateUi){
    speechState.textContent=committedTranscript?'Stopped':'';
    statusEl.textContent='Stopped — tap the microphone to continue';
    const text=currentTranscript();if(text)scheduleTranslation(text,true);
  }
}

mic.onclick=async()=>{
  if(wantsListening){await stopListening(true);return}
  wantsListening=true;
  usingBrowserFallback=false;
  reconnectAttempts=0;
  resetDiagnostics();
  await startListening(false);
};
document.getElementById('swap').onclick=async()=>{const resumeListening=wantsListening;if(resumeListening)await stopListening(false);const a=input.value;input.value=output.value;output.value=a;updateLanguageButtons();noteUse(input.value);noteUse(output.value);const text=currentTranscript();if(text){lastRequestedText='';scheduleTranslation(text,true)}if(resumeListening){wantsListening=true;reconnectAttempts=0;await startListening(false)}};
document.getElementById('clear').onclick=()=>{committedTranscript='';interimTranscript='';lastRequestedText='';++translateSequence;clearTimeout(translateTimer);if(translateController)translateController.abort();setTranscript('');setTranslation('');translationState.textContent='';speechState.textContent=isListening?'Listening':'';statusEl.textContent=isListening?'Listening — tap the microphone to stop':'Tap the microphone and start speaking'};
copyBtn.onclick=async()=>{if(translationEl.classList.contains('placeholder'))return;try{await navigator.clipboard.writeText(translationEl.textContent);statusEl.textContent='Translation copied'}catch{statusEl.textContent='Copy failed'}};
speakBtn.onclick=()=>{if(translationEl.classList.contains('placeholder'))return;const u=new SpeechSynthesisUtterance(translationEl.textContent);u.lang=output.value;speechSynthesis.cancel();speechSynthesis.speak(u)};
window.addEventListener('offline',()=>{
  setDiagnostic('network','error','Device went offline');
  if(wantsListening){
    statusEl.textContent='Connection lost — listening will resume automatically';
    speechState.textContent='Waiting for internet';
  }else{
    statusEl.textContent='You are offline. Internet is required for speech and translation.';
  }
});
window.addEventListener('online',()=>{
  setDiagnostic('network','ok');
  if(wantsListening&&!isListening){reconnectAttempts=0;scheduleReconnect()}
  else if(!wantsListening)statusEl.textContent='Back online — ready to listen';
});
window.addEventListener('beforeunload',()=>{if(mediaStream)mediaStream.getTracks().forEach(t=>t.stop())});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));

applyTheme(store.get('vt-theme','calm'));
updateLanguageButtons();
