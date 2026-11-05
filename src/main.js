import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { OrderedTranslationQueue, requestTranslation, splitPhrases } from './translation-client.js';
import { shouldRecover, speechProviderOptions } from './audio-health.js';

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
  {code:'eu-ES',name:'Basque',flag:'🇪🇸',region:'Regional European Languages'},
  {code:'gl-ES',name:'Galician',flag:'🇪🇸',region:'Regional European Languages'},
  {code:'cy-GB',name:'Welsh',flag:'🏴',region:'Regional European Languages'},
  {code:'gd-GB',name:'Scottish Gaelic',flag:'🏴',region:'Regional European Languages'},
  {code:'br-FR',name:'Breton',flag:'🇫🇷',region:'Regional European Languages'},
  {code:'oc-FR',name:'Occitan',flag:'🇫🇷',region:'Regional European Languages'},
  {code:'co-FR',name:'Corsican',flag:'🇫🇷',region:'Regional European Languages'},
  {code:'fy-NL',name:'Western Frisian',flag:'🇳🇱',region:'Regional European Languages'},
  {code:'fo-FO',name:'Faroese',flag:'🇫🇴',region:'Regional European Languages'},
  {code:'se-NO',name:'Northern Sami',flag:'🇳🇴',region:'Regional European Languages'},
  {code:'be-BY',name:'Belarusian',flag:'🇧🇾',region:'Eastern Europe & Balkans'},
  {code:'hy-AM',name:'Armenian',flag:'🇦🇲',region:'Eastern Europe & Balkans'},
  {code:'ka-GE',name:'Georgian',flag:'🇬🇪',region:'Eastern Europe & Balkans'},
  {code:'he-IL',name:'Hebrew',flag:'🇮🇱',region:'Middle East & Asia'},
  {code:'fa-IR',name:'Persian (Farsi)',flag:'🇮🇷',region:'Middle East & Asia'},
  {code:'ar-SA',name:'Arabic (Standard)',flag:'🇸🇦',region:'Middle East & Asia'},
  {code:'ar-EG',name:'Arabic (Egyptian)',flag:'🇪🇬',region:'Middle East & Asia'},
  {code:'ar-MA',name:'Arabic (Moroccan)',flag:'🇲🇦',region:'Middle East & Asia'},
  {code:'ar-AE',name:'Arabic (Gulf)',flag:'🇦🇪',region:'Middle East & Asia'},
  {code:'zh-CN',name:'Chinese (Mandarin, Simplified)',flag:'🇨🇳',region:'East Asia'},
  {code:'zh-TW',name:'Chinese (Traditional)',flag:'🇹🇼',region:'East Asia'},
  {code:'yue-HK',name:'Cantonese',flag:'🇭🇰',region:'East Asia'},
  {code:'ja-JP',name:'Japanese',flag:'🇯🇵',region:'East Asia'},
  {code:'ko-KR',name:'Korean',flag:'🇰🇷',region:'East Asia'},
  {code:'hi-IN',name:'Hindi',flag:'🇮🇳',region:'South Asia'},
  {code:'ml-IN',name:'Malayalam',flag:'🇮🇳',region:'South Asia'},
  {code:'ta-IN',name:'Tamil',flag:'🇮🇳',region:'South Asia'},
  {code:'te-IN',name:'Telugu',flag:'🇮🇳',region:'South Asia'},
  {code:'kn-IN',name:'Kannada',flag:'🇮🇳',region:'South Asia'},
  {code:'fil-PH',name:'Filipino (Tagalog)',flag:'🇵🇭',region:'Southeast Asia'}
];
const AUTO_LANGUAGE={code:'auto',name:'Auto-detect',flag:'🌐',region:'Automatic'};
let detectedInputLanguage=null;

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
const liveVoiceToggle=document.getElementById('liveVoiceToggle');
const liveVoiceState=document.getElementById('liveVoiceState');
const micSourceBtn=document.getElementById('micSourceBtn');
const meetingSourceBtn=document.getElementById('meetingSourceBtn');
const sourceHint=document.getElementById('sourceHint');

let isListening=false, committedTranscript='', interimTranscript='';
let audioController=null, mediaStream=null, audioContext=null, sourceNode=null, processorNode=null, muteNode=null;
let translateTimer=null, translateController=null, translateSequence=0, lastRequestedText='', transcriptionSession=0;
let pickerTarget='input';
let wantsListening=false, reconnectAttempts=0, reconnectTimer=null, sessionLimitTimer=null;
let diagnosticState={network:'idle',token:'idle',microphone:'idle',realtime:'idle',fallback:'idle',error:''};
let liveVoiceEnabled=false;
let liveVoiceGeneration=0;
let liveVoiceQueue=Promise.resolve();
let translatedCommitted='',translatedInterim='',lastInterimText='',finalPhraseQueue=Promise.resolve(),translationEpoch=0,lastPreviewAt=0;
let liveVoicePauseTimer=null;
let lastLiveVoiceSource='';
let audioSourceMode='mic';
let speechController=null,healthTimer=null,healthStartedAt=0,lastAudioAt=0,lastVoiceAt=0,lastTranscriptAt=0;
let speechRecoveryRunning=false;

async function recoverSpeech(){
  if(speechRecoveryRunning||!wantsListening||usingBrowserFallback)return;
  speechRecoveryRunning=true;
  ++transcriptionSession;
  // Keep the most recent partial phrase rather than losing it on recovery.
  const tail=normalizeSpaces(interimTranscript);
  if(tail){committedTranscript=normalizeSpaces(committedTranscript+' '+tail);interimTranscript='';queueFinalTranslation(tail);setTranscript(currentTranscript())}
  setDiagnostic('realtime','error','Speech stalled; restoring the connection');
  await cleanupAudio();speechRecoveryRunning=false;scheduleReconnect();
}

function startAudioHealth(){
  healthStartedAt=lastAudioAt=lastTranscriptAt=Date.now();lastVoiceAt=0;
  clearInterval(healthTimer);
  healthTimer=setInterval(()=>{
    if(!wantsListening||usingBrowserFallback)return;
    if(shouldRecover({now:Date.now(),lastAudioAt,lastVoiceAt,lastTranscriptAt,startedAt:healthStartedAt,
      suspended:audioContext?.state==='suspended',hidden:document.hidden}))recoverSpeech();
  },2000);
}

function renderDiagnostics(){
  if(!diagnosticEl||!diagnosticBody)return;
  const icon=(v)=>v==='ok'?'✓':v==='pending'?'…':v==='error'?'✕':'–';
  diagnosticEl.classList.toggle('show',Object.values(diagnosticState).some(value=>value==='error'));
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
const MAX_RECONNECTS=3;

const store={
  get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},
  set(key,value){localStorage.setItem(key,JSON.stringify(value))}
};

let favorites=store.get('vt-favorites',['en-US','fr-FR']);
let recents=store.get('vt-recents',['en-US','fr-FR']);
let counts=store.get('vt-counts',{});
liveVoiceEnabled=store.get('vt-live-voice',false);
audioSourceMode=store.get('vt-audio-source','mic');

function language(code){return code==='auto'?AUTO_LANGUAGE:LANGUAGES.find(l=>l.code===code)||LANGUAGES[0]}
function showDetectedLanguage(code){
  detectedInputLanguage=code==='mixed'||LANGUAGES.some(l=>l.code===code)?code:null;
  const label=document.getElementById('detectedLanguage');
  if(label)label.textContent=input.value!=='auto'?'':detectedInputLanguage==='mixed'?'Detected: mixed languages':detectedInputLanguage?'Detected: '+language(detectedInputLanguage).name:'Language will be detected as you speak';
}
function normalizeSpaces(v){return v.replace(/\s+/g,' ').trim()}
function setTranscript(text){transcriptEl.textContent=text||'Your speech will appear here.';transcriptEl.className=text?'textBox':'textBox placeholder';transcriptEl.dir=/^(ar|he|fa|ur)(-|$)/.test(input.value)?'rtl':'auto'}
function setTranslation(text){translationEl.textContent=text||'Your translation will appear here.';translationEl.className=text?'textBox':'textBox placeholder';translationEl.dir=/^(ar|he|fa|ur)(-|$)/.test(output.value)?'rtl':'auto'}
function currentTranscript(){return normalizeSpaces(committedTranscript+' '+interimTranscript)}

function chooseSpeechVoice(lang){
  if(!('speechSynthesis' in window))return null;
  const voices=speechSynthesis.getVoices();
  if(!voices.length)return null;
  const exact=voices.find(v=>v.lang?.toLowerCase()===lang.toLowerCase());
  if(exact)return exact;
  const base=lang.split('-')[0].toLowerCase();
  return voices.find(v=>v.lang?.toLowerCase().startsWith(base))||null;
}

let activeVoiceAudio=null,voiceRequestController=null,queuedVoiceCount=0;
let naturalVoicePlayer=null;
function primeNaturalVoice(){
  if(typeof Audio==='undefined')return;
  if(!naturalVoicePlayer)naturalVoicePlayer=new Audio();
  naturalVoicePlayer.src='data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';
  naturalVoicePlayer.play().catch(()=>{});
}
function cancelVoice(){
  ++liveVoiceGeneration;queuedVoiceCount=0;
  if(voiceRequestController)voiceRequestController.abort();
  if(activeVoiceAudio){activeVoiceAudio.pause();activeVoiceAudio.dispatchEvent(new Event('ended'));activeVoiceAudio=null}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  liveVoiceQueue=Promise.resolve();
}
function deviceSpeak(text,lang){
  const voice=chooseSpeechVoice(lang);
  if(!voice||!('SpeechSynthesisUtterance' in window)){
    statusEl.textContent='No matching device voice. Select Natural voice or another translation language.';return Promise.resolve();
  }
  return new Promise(resolve=>{
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang=lang;utterance.voice=voice;
    utterance.onend=resolve;utterance.onerror=resolve;
    speechSynthesis.resume();speechSynthesis.speak(utterance);
  });
}
function speakText(text,{replace=false}={}){
  const clean=normalizeSpaces(text||'');if(!clean)return false;
  if(replace){cancelVoice();primeNaturalVoice()}
  const generation=liveVoiceGeneration,lang=output.value;
  const natural=document.getElementById('voiceQuality').value!=='device';
  queuedVoiceCount++;
  if(queuedVoiceCount>3)liveVoiceState.textContent='Catching up';
  for(const chunk of splitPhrases(clean))liveVoiceQueue=liveVoiceQueue.catch(()=>{}).then(async()=>{
    if(generation!==liveVoiceGeneration)return;
    try{
      if(!natural){await deviceSpeak(chunk,lang);return}
      voiceRequestController=new AbortController();
      const timeout=setTimeout(()=>voiceRequestController?.abort(),12_000);
      let response;
      try{response=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:chunk}),signal:voiceRequestController.signal})}finally{clearTimeout(timeout)}
      if(!response.ok)throw new Error('Natural voice unavailable');
      const blob=await response.blob();
      if(generation!==liveVoiceGeneration)return;
      const url=URL.createObjectURL(blob),player=naturalVoicePlayer||new Audio();player.src=url;activeVoiceAudio=player;
      try{
        await new Promise((resolve,reject)=>{player.onended=resolve;player.onerror=reject;player.play().catch(reject)});
      }finally{URL.revokeObjectURL(url);if(activeVoiceAudio===player)activeVoiceAudio=null}
    }catch(error){
      if(generation!==liveVoiceGeneration)return;
      if(error?.name==='NotAllowedError'){
        liveVoiceEnabled=false;renderLiveVoice();
        statusEl.textContent='Tap Speak to allow translated voice playback on this device';return;
      }
      statusEl.textContent='Natural voice unavailable — using a matching device voice when available';
      await deviceSpeak(chunk,lang);
    }finally{
      if(generation===liveVoiceGeneration){queuedVoiceCount=Math.max(0,queuedVoiceCount-1);renderLiveVoice()}
    }
  });
  return true;
}

function primeSpeechSynthesis(){
  if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))return;
  try{
    speechSynthesis.resume();
    const u=new SpeechSynthesisUtterance(' ');
    u.volume=0;
    u.lang=output.value;
    speechSynthesis.speak(u);
  }catch{}
}

function renderLiveVoice(){
  if(!liveVoiceToggle||!liveVoiceState)return;
  const supported=typeof Audio!=='undefined'||(('speechSynthesis' in window)&&('SpeechSynthesisUtterance' in window));
  liveVoiceToggle.disabled=!supported;
  liveVoiceToggle.checked=supported&&liveVoiceEnabled;
  liveVoiceState.textContent=!supported?'Unavailable':liveVoiceEnabled?'On':'Off';
}

// Translated voice now reuses finalized phrase translations from the main pipeline.
// No secondary translation call or one-second speech delay is necessary.

async function setAudioSource(mode){
  const next=mode==='meeting'?'meeting':'mic';
  if(next===audioSourceMode)return;
  const resume=wantsListening;
  if(resume)await stopListening(false);
  audioSourceMode=next;
  store.set('vt-audio-source',audioSourceMode);
  renderAudioSource();
  if(resume){
    wantsListening=true;
    reconnectAttempts=0;
    await startListening(false);
  }
}

function renderAudioSource(){
  if(!micSourceBtn||!meetingSourceBtn||!sourceHint)return;
  micSourceBtn.classList.toggle('active',audioSourceMode==='mic');
  meetingSourceBtn.classList.toggle('active',audioSourceMode==='meeting');
  sourceHint.textContent=audioSourceMode==='meeting'
    ? 'Meeting audio captures sound from a shared tab/screen. When prompted, share the meeting and enable audio.'
    : 'Microphone mode listens to your voice.';
}

function updateLanguageButtons(){
  const a=language(input.value),b=language(output.value);
  document.getElementById('inputFlag').textContent=a.flag;document.getElementById('inputName').textContent=a.name;
  document.getElementById('outputFlag').textContent=b.flag;document.getElementById('outputName').textContent=b.name;
  const swap=document.getElementById('swap');
  swap.disabled=input.value==='auto';
  swap.title=input.value==='auto'?'Choose an input language to swap':'Swap languages';
  showDetectedLanguage(detectedInputLanguage);
}

function noteUse(code){
  if(code==='auto')return;
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
  const available=pickerTarget==='input'?[AUTO_LANGUAGE,...LANGUAGES]:LANGUAGES;
  const filtered=available.filter(l=>!q||l.name.toLowerCase().includes(q)||l.region.toLowerCase().includes(q));
  const sections=[];
  const automatic=filtered.filter(l=>l.code==='auto');
  if(automatic.length)sections.push(['Automatic',automatic]);
  if(!q){
    const fav=filtered.filter(l=>favorites.includes(l.code));
    const recent=recents.filter(code=>available.some(l=>l.code===code)).map(language).filter((l,i,a)=>a.findIndex(x=>x.code===l.code)===i && !favorites.includes(l.code));
    const frequent=[...filtered].filter(l=>(counts[l.code]||0)>0&&!favorites.includes(l.code)&&!recents.includes(l.code)).sort((a,b)=>(counts[b.code]||0)-(counts[a.code]||0)).slice(0,5);
    if(fav.length)sections.push(['Favorites',fav]);
    if(recent.length)sections.push(['Recent',recent]);
    if(frequent.length)sections.push(['Frequently used',frequent]);
  }
  const regions=[...new Set(filtered.filter(l=>l.code!=='auto').map(l=>l.region))];
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
      if(l.code==='auto'){star.disabled=true;star.textContent='';star.removeAttribute('aria-label')}
      row.append(flag,choose,star);list.appendChild(row);
    });
    host.appendChild(list);
  }
  if(!host.children.length){const empty=document.createElement('div');empty.className='groupTitle';empty.textContent='No languages found';host.appendChild(empty)}
}

async function selectLanguage(code){
  if(code==='auto'&&pickerTarget!=='input')return;
  showDetectedLanguage(null);
  const resumeListening=wantsListening&&pickerTarget==='input';
  if(resumeListening)await stopListening(false);
  if(pickerTarget==='input')input.value=code;else output.value=code;
  noteUse(code);updateLanguageButtons();closeSheet('languageSheet');
  resetTranslationPipeline(true)
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


// Session content stays in memory. Only the last three source phrases are sent
// as context; the entire growing conversation is never repeatedly translated.
let recentSourcePhrases=[],pendingTranslations=0,translationFailures=false;
const finalTranslations=new OrderedTranslationQueue({
  run:async(job,signal,onProgress)=>{
    const started=performance.now();
    const result=await requestTranslation(job,{signal,onProgress});
    return {...result,endToEndMs:Math.round(performance.now()-job.capturedAt),requestMs:Math.round(performance.now()-started)};
  },
  onProgress:text=>{translatedInterim=normalizeSpaces(text);showTranslatedText()},
  onPending:count=>{
    pendingTranslations=count;
    const el=document.getElementById('queueState');
    if(el)el.textContent=count>2?'Catching up · '+count+' phrases':count?'Translating…':'';
  },
  onCommit:({job,result,error})=>{
    translatedInterim='';
    if(error){
      translationFailures=true;
      translatedCommitted=normalizeSpaces(translatedCommitted+' ⟦Translation unavailable⟧');
      translationState.textContent='Some speech needs retrying';
      document.getElementById('retryTranslation').hidden=false;
    }else{
      translatedCommitted=normalizeSpaces(translatedCommitted+' '+result.translation);
      if(job.sourceLanguage==='auto')showDetectedLanguage(result.detectedLanguage);
      translationState.textContent=(result.needsReview?'Check unclear phrase · ':'Live · ')+result.endToEndMs+'ms';
      if(liveVoiceEnabled&&job.voiceGeneration===liveVoiceGeneration)speakText(result.translation);
    }
    showTranslatedText();
  }
});
function showTranslatedText(){setTranslation(normalizeSpaces(translatedCommitted+' '+translatedInterim))}
function resetTranslationPipeline(retranslateHistory=false){
  ++translationEpoch;++translateSequence;cancelVoice();
  clearTimeout(translateTimer);
  if(translateController)translateController.abort();
  translateController=null;finalTranslations.clear();
  recentSourcePhrases=[];translationFailures=false;
  document.getElementById('retryTranslation').hidden=true;
  translatedCommitted='';translatedInterim='';lastInterimText='';lastRequestedText='';lastPreviewAt=0;
  showDetectedLanguage(null);showTranslatedText();translationState.textContent='';
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(retranslateHistory&&committedTranscript)queueFinalTranslation(committedTranscript,{speak:false});
  if(retranslateHistory&&interimTranscript)scheduleTranslation(interimTranscript);
}
function scheduleTranslation(text,immediate=false){
  const clean=normalizeSpaces(text||'');clearTimeout(translateTimer);
  if(!clean||pendingTranslations||clean===lastInterimText)return;
  // Previews are optional and never compete with completed phrases.
  const untilReady=Math.max(0,1500-(Date.now()-lastPreviewAt));
  translateTimer=setTimeout(()=>translateText(clean),Math.max(immediate?0:300,untilReady));
}
async function translateText(text){
  if(!text||text===lastInterimText||pendingTranslations)return;
  const epoch=translationEpoch,seq=++translateSequence;
  if(translateController)translateController.abort();
  const controller=new AbortController();translateController=controller;
  lastInterimText=text;lastPreviewAt=Date.now();
  try{
    const data=await requestTranslation({text:text.slice(-2400),sourceLanguage:input.value,targetLanguage:output.value,quality:'fast',context:recentSourcePhrases},
      {signal:controller.signal,onProgress:translation=>{
        if(epoch===translationEpoch&&seq===translateSequence&&!pendingTranslations){translatedInterim=translation;showTranslatedText()}
      }});
    if(epoch!==translationEpoch||seq!==translateSequence||pendingTranslations)return;
    translatedInterim=normalizeSpaces(data.translation||'');showTranslatedText();translationState.textContent='Preview';
  }catch(error){if(error.name!=='AbortError'&&epoch===translationEpoch&&seq===translateSequence)lastInterimText=''}
}
function queueFinalTranslation(phrase,{speak=true}={}){
  const text=normalizeSpaces(phrase||'');if(!text)return;
  ++translateSequence;clearTimeout(translateTimer);
  if(translateController)translateController.abort();translateController=null;
  lastInterimText='';translatedInterim='';showTranslatedText();
  for(const chunk of splitPhrases(text)){
    finalTranslations.push({text:chunk,sourceLanguage:input.value,targetLanguage:output.value,
      quality:document.getElementById('translationQuality').value||'accurate',context:[...recentSourcePhrases],
      capturedAt:performance.now(),voiceGeneration:speak?liveVoiceGeneration:-1});
    recentSourcePhrases=[...recentSourcePhrases,chunk].slice(-3);
  }
}
document.getElementById('retryTranslation').onclick=()=>resetTranslationPipeline(true);

async function createMicrophonePcmStream(sessionId){
  // Request capture before awaiting the network token: iOS requires a user gesture.
  let capturedStream;
  if(audioSourceMode==='meeting'){
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Meeting audio capture is not supported in this browser. Use Chrome or Edge on desktop.');
    capturedStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,systemAudio:'include',surfaceSwitching:'include'});
    if(!capturedStream.getAudioTracks().length){
      capturedStream.getTracks().forEach(t=>t.stop());
      throw new Error('No meeting audio was shared. Choose the meeting tab/screen and enable Share audio.');
    }
  }else{
    capturedStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,
      autoGainControl:document.getElementById('audioProfile').value!=='nearby'},video:false});
  }
  // A delayed permission prompt must not revive a stopped recording.
  if(!wantsListening||sessionId!==transcriptionSession){
    capturedStream.getTracks().forEach(t=>t.stop());
    const cancelled=new Error('Microphone capture cancelled');
    cancelled.name='AbortError';
    throw cancelled;
  }
  mediaStream=capturedStream;
  audioContext=new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000,latencyHint:'interactive'});if(audioContext.state==='suspended')await audioContext.resume();
  if(!wantsListening||sessionId!==transcriptionSession){
    await cleanupAudio();
    const cancelled=new Error('Microphone capture cancelled');
    cancelled.name='AbortError';
    throw cancelled;
  }
  sourceNode=audioContext.createMediaStreamSource(mediaStream);
  if(audioContext.audioWorklet&&typeof AudioWorkletNode!=='undefined'){
    await audioContext.audioWorklet.addModule('/pcm-worklet.js');
    if(!wantsListening||sessionId!==transcriptionSession)throw new DOMException('Capture cancelled','AbortError');
    processorNode=new AudioWorkletNode(audioContext,'pcm-capture');
  }else processorNode=audioContext.createScriptProcessor(1024,1,1);
  muteNode=audioContext.createGain();muteNode.gain.value=0;
  const pcmStream=new ReadableStream({start(controller){
    audioController=controller;
    const receive=samples=>{
      if(!isListening||!audioController||sessionId!==transcriptionSession)return;
      lastAudioAt=Date.now();
      let energy=0;for(const sample of samples)energy+=sample*sample;
      if(Math.sqrt(energy/samples.length)>0.015)lastVoiceAt=lastAudioAt;
      const pcm=floatTo16BitPCM(resampleTo24k(samples,audioContext.sampleRate));
      // Bound pre-connection buffering to about two seconds.
      if(controller.desiredSize<-100)return;
      try{controller.enqueue(pcm)}catch{}
    };
    if(processorNode.port)processorNode.port.onmessage=e=>receive(e.data);
    else processorNode.onaudioprocess=e=>receive(e.inputBuffer.getChannelData(0));
  },cancel(){audioController=null}});
  mediaStream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{
    if(wantsListening&&sessionId===transcriptionSession)recoverSpeech();
  },{once:true}));
  sourceNode.connect(processorNode);processorNode.connect(muteNode);muteNode.connect(audioContext.destination);return pcmStream;
}

async function cleanupAudio(){
  isListening=false;
  clearInterval(healthTimer);healthTimer=null;
  if(speechController){speechController.abort();speechController=null}
  if(processorNode?.port){processorNode.port.onmessage=null;processorNode.port.close()}
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
  if(input.value==='auto'){
    setDiagnostic('fallback','error','Automatic detection needs the realtime speech service');
    return false;
  }
  if(audioSourceMode==='meeting'){setDiagnostic('fallback','error','Meeting audio requires realtime capture');return false;}
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
      const finalPhrase=normalizeSpaces(finalChunk);
      committedTranscript=normalizeSpaces(committedTranscript+' '+finalPhrase);
      interimTranscript='';
      const visible=currentTranscript();setTranscript(visible);queueFinalTranslation(finalPhrase);
    }else{
      interimTranscript=interim;
      const visible=currentTranscript();setTranscript(visible);scheduleTranslation(interimTranscript);
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
    statusEl.textContent=input.value==='auto'
      ?'Automatic detection is unavailable. Try again or choose an input language for compatibility mode.'
      :'Speech connection failed. Tap the microphone to try again.';
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
  if(audioSourceMode==='mic'&&!navigator.mediaDevices?.getUserMedia){wantsListening=false;statusEl.textContent='Microphone capture is not supported in this browser.';return}
  if(audioSourceMode==='meeting'&&!navigator.mediaDevices?.getDisplayMedia){wantsListening=false;statusEl.textContent='Meeting audio works in supported desktop browsers such as Chrome and Edge.';return}
  if(!navigator.onLine){setDiagnostic('network','error','Device is offline');scheduleReconnect();return}
  setDiagnostic('network','ok');

  const sessionId=++transcriptionSession;
  isListening=true;
  mic.classList.add('listening');mic.setAttribute('aria-label','Stop listening');mic.setAttribute('aria-pressed','true');mic.textContent='■';
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

  let failureStage='microphone';
  try{
    setDiagnostic('microphone','pending');
    const microphoneStream=await createMicrophonePcmStream(sessionId);
    if(!wantsListening||sessionId!==transcriptionSession)return;
    setDiagnostic('microphone','ok');

    failureStage='token';
    setDiagnostic('token','pending');
    speechController=new AbortController();
    const tokenTimeout=setTimeout(()=>speechController?.abort(),20_000);
    let tokenResponse;
    try{tokenResponse=await fetch('/api/transcription-token',{method:'POST',signal:speechController.signal})}finally{clearTimeout(tokenTimeout)}
    const tokenData=await tokenResponse.json().catch(()=>({}));
    if(!wantsListening||sessionId!==transcriptionSession)return;
    if(!tokenResponse.ok||!tokenData.token){const detail=tokenData.detail?': '+tokenData.detail:'';throw new Error((tokenData.error||'Speech service unavailable')+detail+' (HTTP '+tokenResponse.status+')');}
    setDiagnostic('token','ok');
    const gateway=createGateway({apiKey:tokenData.token});
    failureStage='realtime';
    setDiagnostic('realtime','pending');
    startAudioHealth();
    const result=streamTranscribe({
      model:gateway.transcriptionModel('openai/gpt-realtime-whisper'),
      audio:microphoneStream,
      inputAudioFormat:{type:'audio/pcm',rate:24000},
      providerOptions:speechProviderOptions(input.value),
      abortSignal:speechController.signal
    });

    let receivedRealtimeEvent=false;
    statusEl.innerHTML='<span class="liveDot"></span>Listening — tap again to stop';
    speechState.textContent='Listening';
    noteUse(input.value);

    for await(const part of result.fullStream){
      if(!receivedRealtimeEvent&&(part.type==='transcript-delta'||part.type==='transcript-final')){
        receivedRealtimeEvent=true;
        reconnectAttempts=0;
        setDiagnostic('realtime','ok');
      }
      if(!wantsListening||sessionId!==transcriptionSession)break;
      if(part.type==='transcript-delta'||part.type==='transcript-partial'||part.type==='transcript-final')lastTranscriptAt=Date.now();
      if(part.type==='transcript-delta'){
        interimTranscript+=part.delta||'';
        const visible=currentTranscript();setTranscript(visible);
        speechState.textContent='Hearing you…';scheduleTranslation(interimTranscript);
      }
      if(part.type==='transcript-final'){
        const finalText=normalizeSpaces(part.text||interimTranscript);
        if(finalText)committedTranscript=normalizeSpaces(committedTranscript+' '+finalText);
        interimTranscript='';
        const visible=currentTranscript();setTranscript(visible);
        speechState.textContent='Captured';queueFinalTranslation(finalText);
      }
      if(part.type==='transcript-partial'){
        interimTranscript=part.text||'';setTranscript(currentTranscript());scheduleTranslation(interimTranscript);
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
  mic.classList.remove('listening');mic.setAttribute('aria-label','Start listening');mic.setAttribute('aria-pressed','false');mic.textContent='🎤';
  if(updateUi){
    speechState.textContent=committedTranscript?'Stopped':'';
    statusEl.textContent='Stopped — tap the microphone to continue';
    if(interimTranscript){const tail=normalizeSpaces(interimTranscript);committedTranscript=normalizeSpaces(committedTranscript+' '+tail);interimTranscript='';setTranscript(currentTranscript());queueFinalTranslation(tail)}
  }
}

mic.onclick=async()=>{
  if(wantsListening){await stopListening(true);return}
  if(liveVoiceEnabled){primeNaturalVoice();primeSpeechSynthesis()}
  wantsListening=true;
  usingBrowserFallback=false;
  reconnectAttempts=0;
  resetDiagnostics();
  await startListening(false);
};
document.getElementById('swap').onclick=async()=>{const resumeListening=wantsListening;if(resumeListening)await stopListening(false);const a=input.value;input.value=output.value;output.value=a;updateLanguageButtons();noteUse(input.value);noteUse(output.value);resetTranslationPipeline(true);if(resumeListening){wantsListening=true;reconnectAttempts=0;await startListening(false)}};
document.getElementById('clear').onclick=()=>{committedTranscript='';interimTranscript='';lastRequestedText='';lastLiveVoiceSource='';cancelVoice();resetTranslationPipeline();clearTimeout(liveVoicePauseTimer);if('speechSynthesis' in window)speechSynthesis.cancel();setTranscript('');setTranslation('');translationState.textContent='';speechState.textContent=isListening?'Listening':'';statusEl.textContent=isListening?'Listening — tap the microphone to stop':'Tap the microphone and start speaking'};
copyBtn.onclick=async()=>{if(translationEl.classList.contains('placeholder'))return;try{await navigator.clipboard.writeText(translationEl.textContent);statusEl.textContent='Translation copied'}catch{statusEl.textContent='Copy failed'}};
speakBtn.onclick=()=>{if(translationEl.classList.contains('placeholder'))return;speakText(translationEl.textContent,{replace:true})};
if(liveVoiceToggle){
  liveVoiceToggle.onchange=()=>{
    liveVoiceEnabled=Boolean(liveVoiceToggle.checked);
    store.set('vt-live-voice',liveVoiceEnabled);
    cancelVoice();
    lastLiveVoiceSource=currentTranscript();
    clearTimeout(liveVoicePauseTimer);
    if(liveVoiceEnabled){primeSpeechSynthesis();primeNaturalVoice()}
    else if('speechSynthesis' in window)speechSynthesis.cancel();
    renderLiveVoice();
    statusEl.textContent=liveVoiceEnabled?'Live translated voice is on — pause briefly after each phrase':'Live translated voice is off';
  };
}
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
document.addEventListener('visibilitychange',async()=>{
  if(document.hidden||!wantsListening||usingBrowserFallback)return;
  if(audioContext?.state==='suspended')try{await audioContext.resume()}catch{}
  if(!isListening){reconnectAttempts=0;scheduleReconnect()}
  else if(Date.now()-lastAudioAt>8000)recoverSpeech();
});
for(const [id,key,fallback] of [['translationQuality','vt-quality','accurate'],['voiceQuality','vt-voice-quality','natural'],['audioProfile','vt-audio-profile','standard']]){
  const control=document.getElementById(id);
  control.value=store.get(key,fallback);
  control.onchange=async()=>{
    store.set(key,control.value);
    if(id==='voiceQuality')cancelVoice();
    if(id==='audioProfile'&&wantsListening){
      await stopListening(true);wantsListening=true;reconnectAttempts=0;await startListening(false);
    }
  };
}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));

if(micSourceBtn)micSourceBtn.onclick=()=>setAudioSource('mic');
if(meetingSourceBtn)meetingSourceBtn.onclick=()=>setAudioSource('meeting');
applyTheme(store.get('vt-theme','calm'));
updateLanguageButtons();
renderAudioSource();
renderLiveVoice();
if('speechSynthesis' in window)speechSynthesis.onvoiceschanged=renderLiveVoice;
if(!navigator.mediaDevices?.getDisplayMedia&&meetingSourceBtn){
  meetingSourceBtn.disabled=true;
  meetingSourceBtn.title='Meeting audio capture is available on supported desktop browsers';
  if(audioSourceMode==='meeting'){audioSourceMode='mic';renderAudioSource();}
}

