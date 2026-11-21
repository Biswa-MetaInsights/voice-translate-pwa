import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { OrderedTranslationQueue, requestTranslation, splitPhrases } from './translation-client.js';
import { createConversationMp3 } from './conversation-export.js';
import { createLiveText } from './live-text.js';
import { shouldRecover } from './audio-health.js';
import { createPcmBuffer } from './pcm-buffer.js';
import { LIVE_TRANSCRIBE_MODEL, WHISPER_MODEL, speechProviderOptions } from '../lib/speech-models.js';
import { guessSourceLanguage } from './source-language.js';
import { setupTwoPersonConversation } from './two-person-conversation.js';

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
let sourceLanguageSample='',sourceLanguageVersion=0;

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
const renderTranscript=createLiveText(transcriptEl,'Your speech will appear here.');
const renderTranslation=createLiveText(translationEl,'Your translation will appear here.');
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
const conversationSourceBtn=document.getElementById('conversationSourceBtn');
const sourceHint=document.getElementById('sourceHint');

let isListening=false, committedTranscript='', interimTranscript='';
let microphoneBuffer=null, mediaStream=null, audioContext=null, sourceNode=null, processorNode=null, muteNode=null;
let translateTimer=null, translateController=null, translateSequence=0, lastRequestedText='', transcriptionSession=0;
let pickerTarget='input';
let wantsListening=false, reconnectAttempts=0, reconnectTimer=null, sessionLimitTimer=null;
let diagnosticState={network:'idle',token:'idle',microphone:'idle',realtime:'idle',fallback:'idle',error:''};
let liveVoiceEnabled=false;
let liveVoiceGeneration=0;
let liveVoiceQueue=Promise.resolve();
let translatedCommitted='',translatedInterim='',lastInterimText='',finalPhraseQueue=Promise.resolve(),translationEpoch=0,lastPreviewAt=0;
let conversationTurns=[],mp3Controller=null,mp3Url=null;
const downloadMp3Btn=document.getElementById('downloadMp3');
let liveVoicePauseTimer=null;
let lastLiveVoiceSource='';
let audioSourceMode='mic';
let speechController=null,healthTimer=null,healthStartedAt=0,lastAudioAt=0,lastVoiceAt=0,lastTranscriptAt=0,voiceMs=0;
let speechRecoveryRunning=false;
let preferWhisper=false;
let previewText='';
const speechSegments=new Map();
let turnDrain=null, switchingAudioSource=false;
const conversation=setupTwoPersonConversation({
  document,languages:LANGUAGES,status:statusEl,capture:beginListening,finishCapture:finishConversationCapture,
  play:(text,lang,replace,feedback)=>{
    if(speakText(text,{lang,replace,feedback}))return liveVoiceQueue;
  },
  stopVoice:cancelVoice,onExportChange:updateMp3Availability,resetExport:clearMp3Download,
  setCaptureActive:active=>{
    micSourceBtn.disabled=active;
    meetingSourceBtn.disabled=active||!navigator.mediaDevices?.getDisplayMedia;
  }
});

function activeSpeechLanguage(){
  return conversation.sourceLanguage||input.value;
}

function commitCapturedSpeech(text){
  if(conversation.sourceLanguage)conversation.addSpeech(text);
  else{
    committedTranscript=normalizeSpaces(committedTranscript+' '+text);
    queueFinalTranslation(text);
  }
}

function failConversationCapture(){
  if(conversation.sourceLanguage&&!conversation.isFinishing){
    const warning=statusEl.textContent;
    clearTimeout(sessionLimitTimer);
    stopBrowserFallback();
    preserveInterimSpeech();
    conversation.completeTurn(warning);
  }
}

async function finishConversationCapture(){
  const session=transcriptionSession;
  let incomplete=Boolean(interimTranscript&&!usingBrowserFallback&&!speechController);
  if(usingBrowserFallback||microphoneBuffer&&speechController){
    let timer;
    const drained=new Promise(resolve=>{
      turnDrain={session,resolve};
      timer=setTimeout(()=>resolve(false),3500);
    });
    clearTimeout(reconnectTimer);
    clearInterval(healthTimer);
    if(usingBrowserFallback){
      try{browserRecognition.stop()}catch{turnDrain.resolve(false)}
    }else{
      // Stop recording immediately, but let queued audio and the final recognition event drain.
      mediaStream?.getTracks().forEach(track=>track.stop());
      microphoneBuffer.finish();
    }
    incomplete=!(await drained);
    clearTimeout(timer);
    turnDrain=null;
  }
  const warning=diagnosticState.audioGap?'Some microphone audio was lost. Check the captured text.'
    : incomplete?'Speech did not finish processing. Check the captured text.':'';
  await stopListening(false);
  return warning;
}

function preserveInterimSpeech(){
  const tail=normalizeSpaces(interimTranscript);
  if(tail){
    commitCapturedSpeech(tail);
    interimTranscript='';
    setTranscript();
  }
  speechSegments.clear();
}

async function recoverSpeech(restartCapture=false){
  if(speechRecoveryRunning||!wantsListening||usingBrowserFallback||conversation.isFinishing)return;
  speechRecoveryRunning=true;
  ++transcriptionSession;
  if(conversation.sourceLanguage&&voiceMs)diagnosticState.audioGap=true;
  preserveInterimSpeech();
  setDiagnostic('realtime','error','Speech stalled; restoring the connection');
  const recoverySession=transcriptionSession;
  await cleanupAudio({keepCapture:!restartCapture});speechRecoveryRunning=false;
  if(recoverySession===transcriptionSession)scheduleReconnect();
}

function startAudioHealth(){
  healthStartedAt=lastAudioAt=lastTranscriptAt=Date.now();lastVoiceAt=voiceMs=0;
  clearInterval(healthTimer);
  healthTimer=setInterval(()=>{
    if(!wantsListening||usingBrowserFallback)return;
    const now=Date.now(),suspended=audioContext?.state==='suspended';
    if(shouldRecover({now,lastAudioAt,lastVoiceAt,voiceMs,lastTranscriptAt,startedAt:healthStartedAt,
      suspended,hidden:document.hidden}))recoverSpeech(suspended||now-lastAudioAt>8000);
  },2000);
}

function renderDiagnostics(){
  if(!diagnosticEl||!diagnosticBody)return;
  const icon=(v)=>v==='ok'?'✓':v==='pending'?'…':v==='error'?'✕':'–';
  diagnosticEl.classList.toggle('show',diagnosticState.audioGap||Object.values(diagnosticState).some(value=>value==='error'));
  diagnosticBody.innerHTML=
    'Network '+icon(diagnosticState.network)+' · '+
    'Token '+icon(diagnosticState.token)+' · '+
    'Microphone '+icon(diagnosticState.microphone)+' · '+
    'Realtime '+icon(diagnosticState.realtime)+' · '+
    'Fallback '+icon(diagnosticState.fallback)+
    (diagnosticState.error?'<div class="diagError">Last failure: '+diagnosticState.error.replace(/[<>&]/g,'')+'</div>':'')+
    (diagnosticState.audioGap?'<div class="diagError">The connection was slow and some audio could not be sent.</div>':'');
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
  set(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
};

let favorites=store.get('vt-favorites',['en-US','fr-FR']);
let recents=store.get('vt-recents',['en-US','fr-FR']);
let counts=store.get('vt-counts',{});
liveVoiceEnabled=store.get('vt-live-voice',false);
audioSourceMode=store.get('vt-audio-source','mic');

function language(code){return code==='auto'?AUTO_LANGUAGE:LANGUAGES.find(l=>l.code===code)||LANGUAGES[0]}
function showDetectedLanguage(code,provisional=false){
  detectedInputLanguage=code==='mixed'||LANGUAGES.some(l=>l.code===code)?code:null;
  const label=document.getElementById('detectedLanguage');
  if(label)label.textContent=input.value!=='auto'?'':detectedInputLanguage==='mixed'?'Detected: mixed languages':detectedInputLanguage?(provisional?'Likely: ':'Detected: ')+language(detectedInputLanguage).name:'Language will be detected as you speak';
}

function detectSourceWhileSpeaking(text){
  if(input.value!=='auto'||!text)return;
  const sample=text.slice(-180);
  if(sample===sourceLanguageSample||
    (sample.startsWith(sourceLanguageSample)&&sample.length-sourceLanguageSample.length<6))return;
  sourceLanguageSample=sample;
  const guess=guessSourceLanguage(sample,LANGUAGES);
  if(guess&&guess!==detectedInputLanguage){
    sourceLanguageVersion++;
    showDetectedLanguage(guess,true);
  }
}
function normalizeSpaces(v){return v.replace(/\s+/g,' ').trim()}
function setTranscript(){
  if(conversation.sourceLanguage)conversation.setDraft(interimTranscript);
  else renderTranscript(committedTranscript,interimTranscript,/^(ar|he|fa|ur)(-|$)/.test(input.value)?'rtl':'auto');
}
function setTranslation(text='',draft=''){renderTranslation(text,draft,/^(ar|he|fa|ur)(-|$)/.test(output.value)?'rtl':'auto')}
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
function deviceSpeak(text,lang,feedback){
  const voice=chooseSpeechVoice(lang);
  if(!voice||!('SpeechSynthesisUtterance' in window)){
    const message='No matching device voice. Select Natural voice or another translation language.';
    if(feedback)feedback.onUnavailable(message);
    else statusEl.textContent=message;
    return Promise.resolve();
  }
  return new Promise(resolve=>{
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang=lang;utterance.voice=voice;
    utterance.onstart=()=>feedback?.onPlaying();
    utterance.onend=resolve;
    utterance.onerror=()=>{
      feedback?.onUnavailable('Audio unavailable. Tap Play translation to retry.');
      resolve();
    };
    speechSynthesis.resume();speechSynthesis.speak(utterance);
  });
}
function speakText(text,{replace=false,lang=output.value,feedback}={}){
  const clean=normalizeSpaces(text||'');if(!clean)return false;
  if(replace){cancelVoice();primeNaturalVoice()}
  const generation=liveVoiceGeneration;
  const natural=document.getElementById('voiceQuality').value!=='device';
  const chunks=splitPhrases(clean);
  queuedVoiceCount+=chunks.length;
  if(queuedVoiceCount>3)liveVoiceState.textContent='Catching up';
  for(const chunk of chunks)liveVoiceQueue=liveVoiceQueue.catch(()=>{}).then(async()=>{
    if(generation!==liveVoiceGeneration)return;
    try{
      if(!natural){await deviceSpeak(chunk,lang,feedback);return}
      const requestController=new AbortController();voiceRequestController=requestController;
      const timeout=setTimeout(()=>requestController.abort(),12_000);
      let blob;
      try{
        const response=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({text:chunk}),signal:requestController.signal});
        if(!response.ok)throw new Error('Natural voice unavailable');
        blob=await response.blob();
      }finally{clearTimeout(timeout);if(voiceRequestController===requestController)voiceRequestController=null}
      if(generation!==liveVoiceGeneration)return;
      const url=URL.createObjectURL(blob),player=naturalVoicePlayer||new Audio();player.src=url;activeVoiceAudio=player;
      try{
        await new Promise((resolve,reject)=>{
          player.onended=resolve;
          player.onerror=reject;
          player.play().then(()=>{if(generation===liveVoiceGeneration)feedback?.onPlaying();}).catch(reject);
        });
      }finally{URL.revokeObjectURL(url);if(activeVoiceAudio===player)activeVoiceAudio=null}
    }catch(error){
      if(generation!==liveVoiceGeneration)return;
      if(error?.name==='NotAllowedError'){
        liveVoiceEnabled=false;renderLiveVoice();
        if(feedback)feedback.onUnavailable('Tap Play translation to allow audio on this device.');
        else statusEl.textContent='Tap Speak to allow translated voice playback on this device';
        return;
      }
      if(!feedback)statusEl.textContent='Natural voice unavailable — using a matching device voice when available';
      await deviceSpeak(chunk,lang,feedback);
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

async function setAudioSource(next){
  if(next===audioSourceMode||switchingAudioSource||conversation.sourceLanguage)return;
  switchingAudioSource=true;
  try{
    const previous=audioSourceMode;
    clearMp3Download();
    const resume=wantsListening&&next!=='conversation';
    if(wantsListening||isListening)await stopListening(false);
    if(previous==='conversation')conversation.close();
    if(next==='conversation'){
      cancelVoice();
      resetDiagnostics();
      conversation.validatePair();
    }else if(previous==='conversation'){
      statusEl.textContent='Tap the microphone and start speaking';
      resetDiagnostics();
    }
    audioSourceMode=next;
    if(next!=='conversation')store.set('vt-audio-source',audioSourceMode);
    renderAudioSource();
    if(resume){
      wantsListening=true;
      reconnectAttempts=0;
      void startListening(false);
    }
  }finally{
    switchingAudioSource=false;
  }
}

function renderAudioSource(){
  if(!micSourceBtn||!meetingSourceBtn||!sourceHint)return;
  for(const [mode,button] of [['mic',micSourceBtn],['meeting',meetingSourceBtn],['conversation',conversationSourceBtn]]){
    const selected=audioSourceMode===mode;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  const twoPerson=audioSourceMode==='conversation';
  for(const id of ['singleLanguageRow','singleTranslationPanels','detectedLanguage','mic']){
    document.getElementById(id).hidden=twoPerson;
  }
  document.getElementById('twoPersonConversation').hidden=!twoPerson;
  document.getElementById('micWrap').classList.toggle('conversationMode',twoPerson);
  document.getElementById(twoPerson?'conversationStatusSlot':'micStatusSlot').append(statusEl);
  const exportHost=document.getElementById('conversationExport');
  if(twoPerson)exportHost.append(downloadMp3Btn);
  else document.getElementById('singleTranslationActions').insertBefore(downloadMp3Btn,document.getElementById('clear'));
  (twoPerson?exportHost:document.getElementById('mp3OptionsSlot')).append(document.getElementById('mp3Options'));
  updateMp3Availability();
  document.getElementById('singleTranslationQuality').hidden=twoPerson;
  sourceHint.textContent=twoPerson?'Take turns speaking into one microphone.'
    : audioSourceMode==='meeting'
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
    conversationTurns.push({source:job.text,translation:error?'':result.translation});
    updateMp3Availability();
    if(error){
      translationFailures=true;
      translatedCommitted=normalizeSpaces(translatedCommitted+' ⟦Translation unavailable⟧');
      translationState.textContent='Some speech needs retrying';
      document.getElementById('retryTranslation').hidden=false;
    }else{
      translatedCommitted=normalizeSpaces(translatedCommitted+' '+result.translation);
      if(job.sourceLanguage==='auto'&&job.sourceLanguageVersion===sourceLanguageVersion&&result.detectedLanguage){
        showDetectedLanguage(result.detectedLanguage);
      }
      translationState.textContent=(result.needsReview?'Check unclear phrase · ':'Live · ')+result.endToEndMs+'ms';
      if(liveVoiceEnabled&&job.voiceGeneration===liveVoiceGeneration)speakText(result.translation);
    }
    showTranslatedText();
  }
});
function showTranslatedText(){setTranslation(translatedCommitted,translatedInterim)}
function resetTranslationPipeline(retranslateHistory=false){
  ++translationEpoch;++translateSequence;cancelVoice();
  clearTimeout(translateTimer);translateTimer=null;previewText='';sourceLanguageSample='';sourceLanguageVersion++;
  if(translateController)translateController.abort();
  translateController=null;finalTranslations.clear();
  recentSourcePhrases=[];translationFailures=false;
  conversationTurns=[];updateMp3Availability();
  document.getElementById('retryTranslation').hidden=true;
  translatedCommitted='';translatedInterim='';lastInterimText='';lastRequestedText='';lastPreviewAt=0;
  showDetectedLanguage(null);showTranslatedText();translationState.textContent='';
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(retranslateHistory&&committedTranscript)queueFinalTranslation(committedTranscript,{speak:false});
  if(retranslateHistory&&interimTranscript)scheduleTranslation(interimTranscript);
}
function scheduleTranslation(text){
  if(conversation.sourceLanguage)return;
  previewText=normalizeSpaces(text||'');
  if(!previewText||pendingTranslations||previewText===lastInterimText||translateTimer!==null)return;
  // Keep the first timer while words arrive and translate the newest snapshot.
  const untilReady=Math.max(0,1500-(Date.now()-lastPreviewAt));
  translateTimer=setTimeout(()=>{
    translateTimer=null;
    translateText(previewText);
  },Math.max(180,untilReady));
}
async function translateText(text){
  if(!text||text===lastInterimText||pendingTranslations)return;
  const epoch=translationEpoch,seq=++translateSequence;
  const detectionVersion=sourceLanguageVersion;
  if(translateController)translateController.abort();
  const controller=new AbortController();translateController=controller;
  lastInterimText=text;lastPreviewAt=Date.now();
  try{
    const data=await requestTranslation({text:text.slice(-2400),sourceLanguage:input.value,targetLanguage:output.value,quality:'fast',context:recentSourcePhrases},
      {signal:controller.signal,onProgress:translation=>{
        if(epoch===translationEpoch&&seq===translateSequence&&!pendingTranslations){translatedInterim=translation;showTranslatedText()}
      }});
    if(epoch!==translationEpoch||seq!==translateSequence||pendingTranslations)return;
    if(input.value==='auto'&&detectionVersion===sourceLanguageVersion&&data.detectedLanguage){
      showDetectedLanguage(data.detectedLanguage);
    }
    translatedInterim=normalizeSpaces(data.translation||'');showTranslatedText();translationState.textContent='Preview';
  }catch(error){if(error.name!=='AbortError'&&epoch===translationEpoch&&seq===translateSequence)lastInterimText=''}
}
function queueFinalTranslation(phrase,{speak=true}={}){
  const text=normalizeSpaces(phrase||'');if(!text)return;
  detectSourceWhileSpeaking(text);
  ++translateSequence;clearTimeout(translateTimer);translateTimer=null;previewText='';
  if(translateController)translateController.abort();translateController=null;
  // Keep the current preview/stream visible while another phrase is queued.
  lastInterimText='';
  for(const chunk of splitPhrases(text)){
    finalTranslations.push({text:chunk,sourceLanguage:input.value,targetLanguage:output.value,
      quality:document.getElementById('translationQuality').value||'accurate',context:[...recentSourcePhrases],
      sourceLanguageVersion,capturedAt:performance.now(),voiceGeneration:speak?liveVoiceGeneration:-1});
    recentSourcePhrases=[...recentSourcePhrases,chunk].slice(-3);
  }
}
document.getElementById('retryTranslation').onclick=()=>resetTranslationPipeline(true);

function mp3Turns(){
  return audioSourceMode==='conversation'?conversation.exportTurns():conversationTurns;
}

function updateMp3Availability(){
  if(downloadMp3Btn)downloadMp3Btn.disabled=Boolean(mp3Controller)||!mp3Turns().length;
}

function clearMp3Download(){
  if(mp3Controller)mp3Controller.abort();
  if(mp3Url){URL.revokeObjectURL(mp3Url);mp3Url=null;}
  const link=document.getElementById('mp3Save');if(link){link.hidden=true;link.removeAttribute('href')}
}
if(downloadMp3Btn)downloadMp3Btn.onclick=async()=>{
  const snapshot=mp3Turns().map(turn=>({...turn}));
  if(mp3Controller||!snapshot.length)return;
  clearMp3Download();
  const controller=new AbortController();mp3Controller=controller;
  const status=document.getElementById('mp3Status'),cancel=document.getElementById('cancelMp3');
  downloadMp3Btn.disabled=true;cancel.hidden=false;
  try{
    const blob=await createConversationMp3(snapshot,{mode:document.getElementById('mp3Content').value||'both',signal:controller.signal,
      onProgress:({completed,total})=>{status.textContent='Preparing MP3 · '+Math.round(completed/total*100)+'%';}});
    controller.signal.throwIfAborted();
    mp3Url=URL.createObjectURL(blob);
    const link=document.getElementById('mp3Save');link.href=mp3Url;
    link.download='voicetranslator-conversation-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp3';
    link.hidden=false;status.textContent='MP3 ready. Includes completed conversation text when you started the download.';link.click();
  }catch(error){status.textContent=error.name==='AbortError'?'MP3 download cancelled.':error.message||'Could not prepare the MP3.';}
  finally{if(mp3Controller===controller)mp3Controller=null;cancel.hidden=true;updateMp3Availability();}
};
const cancelMp3Btn=document.getElementById('cancelMp3');
if(cancelMp3Btn)cancelMp3Btn.onclick=()=>mp3Controller?.abort();


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
  const captureContext=new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000,latencyHint:'interactive'});
  audioContext=captureContext;if(captureContext.state==='suspended')await captureContext.resume();
  if(!wantsListening||sessionId!==transcriptionSession){
    capturedStream.getTracks().forEach(t=>t.stop());
    try{await captureContext.close()}catch{}
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
  const buffer=createPcmBuffer(()=>{
    diagnosticState.audioGap=true;
    renderDiagnostics();
  });
  microphoneBuffer=buffer;
  const receive=samples=>{
    if(!wantsListening||microphoneBuffer!==buffer||conversation.isFinishing)return;
    lastAudioAt=Date.now();
    let energy=0;
    for(const sample of samples)energy+=sample*sample;
    if(lastAudioAt-lastVoiceAt>1200)voiceMs=0;
    if(Math.sqrt(energy/samples.length)>0.015){
      lastVoiceAt=lastAudioAt;
      voiceMs+=samples.length*1000/captureContext.sampleRate;
    }
    buffer.push(floatTo16BitPCM(resampleTo24k(samples,captureContext.sampleRate)));
  };
  if(processorNode.port)processorNode.port.onmessage=e=>receive(e.data);
  else processorNode.onaudioprocess=e=>receive(e.inputBuffer.getChannelData(0));
  mediaStream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{
    if(!wantsListening||microphoneBuffer!==buffer||conversation.isFinishing)return;
    if(isListening)recoverSpeech(true);
    else void cleanupAudio();
  },{once:true}));
  sourceNode.connect(processorNode);processorNode.connect(muteNode);muteNode.connect(audioContext.destination);
  return buffer;
}

async function cleanupAudio({keepCapture=false}={}){
  // Detach synchronously: an awaited close must never erase a newer session.
  isListening=false;
  clearInterval(healthTimer);healthTimer=null;
  const speech=speechController;
  speechController=null;
  microphoneBuffer?.disconnect();
  speech?.abort();
  if(keepCapture&&microphoneBuffer&&audioContext?.state==='running'&&
    mediaStream.getAudioTracks().some(track=>track.readyState==='live'))return;
  const owned={processor:processorNode,source:sourceNode,mute:muteNode,stream:mediaStream,context:audioContext};
  processorNode=sourceNode=muteNode=microphoneBuffer=mediaStream=audioContext=null;
  if(owned.processor?.port){owned.processor.port.onmessage=null;owned.processor.port.close()}
  if(owned.processor){owned.processor.onaudioprocess=null;try{owned.processor.disconnect()}catch{}}
  if(owned.source){try{owned.source.disconnect()}catch{}}
  if(owned.mute){try{owned.mute.disconnect()}catch{}}
  if(owned.stream)owned.stream.getTracks().forEach(t=>t.stop());
  if(owned.context){try{await owned.context.close()}catch{}}
}

function browserSpeechSupported(){
  return Boolean(window.SpeechRecognition||window.webkitSpeechRecognition);
}

function startBrowserFallback(){
  if(activeSpeechLanguage()==='auto'){
    setDiagnostic('fallback','error','Automatic detection needs the realtime speech service');
    return false;
  }
  if(audioSourceMode==='meeting'){setDiagnostic('fallback','error','Meeting audio requires realtime capture');return false;}
  if(!wantsListening||usingBrowserFallback||!browserSpeechSupported()){setDiagnostic('fallback','error','Browser speech fallback unavailable');return false;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const recognition=new Recognition();
  browserRecognition=recognition;
  const current=()=>usingBrowserFallback&&wantsListening&&browserRecognition===recognition;
  browserRecognition.continuous=true;
  browserRecognition.interimResults=true;
  browserRecognition.lang=activeSpeechLanguage();
  usingBrowserFallback=true;
  setDiagnostic('fallback','ok');

  speechState.textContent='Listening';
  statusEl.innerHTML='<span class="liveDot"></span>Listening — compatibility mode';

  browserRecognition.onresult=(event)=>{
    if(!current())return;
    let interim='';
    let finalChunk='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const text=event.results[i][0]?.transcript||'';
      if(event.results[i].isFinal)finalChunk+=text+' ';
      else interim+=text;
    }
    if(finalChunk){
      const finalPhrase=normalizeSpaces(finalChunk);
      commitCapturedSpeech(finalPhrase);
      interimTranscript=interim;
      setTranscript();
    }else{
      interimTranscript=interim;
      setTranscript();scheduleTranslation(interimTranscript);
    }
  };

  browserRecognition.onerror=(event)=>{
    if(!current())return;
    if(turnDrain?.session===transcriptionSession){turnDrain.resolve(false);return}
    console.warn('Browser speech fallback error:',event.error);
    if(event.error==='not-allowed'||event.error==='service-not-allowed'){
      wantsListening=false;
      usingBrowserFallback=false;
      speechState.textContent='Microphone blocked';
      statusEl.textContent='Microphone access is blocked. Allow microphone permission in your browser settings.';
      mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');
      failConversationCapture();
    }
  };

  browserRecognition.onend=()=>{
    if(!current())return;
    if(turnDrain?.session===transcriptionSession){turnDrain.resolve(true);return}
    preserveInterimSpeech();
    try{recognition.start()}catch{}
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
    try{browserRecognition.onend=null;browserRecognition.onresult=null;browserRecognition.onerror=null;browserRecognition.stop()}catch{}
    browserRecognition=null;
  }
}

function scheduleReconnect(){
  if(!wantsListening||conversation.isFinishing)return;
  if(!navigator.onLine){
    speechState.textContent='Waiting for internet';
    statusEl.textContent='Connection lost — listening will resume automatically';
    return;
  }
  if(reconnectAttempts>=MAX_RECONNECTS){
    void cleanupAudio();
    if(startBrowserFallback())return;
    wantsListening=false;
    mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');
    speechState.textContent='Disconnected';
    statusEl.textContent=activeSpeechLanguage()==='auto'
      ?'Automatic detection is unavailable. Try again or choose an input language for compatibility mode.'
      :conversation.sourceLanguage?'Speech connection failed. Tap a speaker to try again.'
      :'Speech connection failed. Tap the microphone to try again.';
    failConversationCapture();
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
  if(audioSourceMode!=='meeting'&&!navigator.mediaDevices?.getUserMedia){wantsListening=false;statusEl.textContent='Microphone capture is not supported in this browser.';failConversationCapture();return}
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
      if(conversation.sourceLanguage){await conversation.finish('The recording time limit was reached.');return}
      await stopListening(true);
      statusEl.textContent='30-minute session finished. Tap the microphone to start a new session.';
    },MAX_SESSION_MS);
  }

  let failureStage='microphone';
  let speechModel=WHISPER_MODEL;
  let receivedRealtimeEvent=false;
  try{
    const sessionController=new AbortController();speechController=sessionController;
    setDiagnostic('microphone','pending');
    // Prompt for capture from the tap, while the service token loads in parallel.
    const captureTask=microphoneBuffer||createMicrophonePcmStream(sessionId);
    setDiagnostic('token','pending');
    const tokenTimeout=setTimeout(()=>sessionController.abort(),20_000);
    const compareWithWhisper=new URLSearchParams(window.location?.search).get('speech')==='whisper';
    const tokenUrl='/api/transcription-token'+(preferWhisper||compareWithWhisper?'?model=whisper':'');
    const tokenTask=fetch(tokenUrl,{method:'POST',signal:sessionController.signal})
      .then(async response=>({response,data:await response.json().catch(()=>({}))}))
      .catch(error=>({error})).finally(()=>clearTimeout(tokenTimeout));
    const capture=await captureTask;
    if(!wantsListening||sessionId!==transcriptionSession)return;
    setDiagnostic('microphone','ok');

    failureStage='token';
    const {response:tokenResponse,data:tokenData,error:tokenError}=await tokenTask;
    if(!wantsListening||sessionId!==transcriptionSession)return;
    if(tokenError)throw tokenError;
    if(!tokenResponse.ok||!tokenData.token){const detail=tokenData.detail?': '+tokenData.detail:'';throw new Error((tokenData.error||'Speech service unavailable')+detail+' (HTTP '+tokenResponse.status+')');}
    setDiagnostic('token','ok');
    speechModel=tokenData.model===LIVE_TRANSCRIBE_MODEL?LIVE_TRANSCRIBE_MODEL:WHISPER_MODEL;
    const gateway=createGateway({apiKey:tokenData.token});
    failureStage='realtime';
    setDiagnostic('realtime','pending');
    startAudioHealth();
    const result=streamTranscribe({
      model:gateway.transcriptionModel(speechModel),
      audio:capture.open(),
      inputAudioFormat:{type:'audio/pcm',rate:24000},
      providerOptions:speechProviderOptions(activeSpeechLanguage(),speechModel),
      abortSignal:sessionController.signal
    });

    if(!conversation.isFinishing)statusEl.innerHTML='<span class="liveDot"></span>'+(
      conversation.sourceLanguage?'Listening — tap Finish speaking when done':'Listening — tap again to stop');
    speechState.textContent='Listening';
    noteUse(activeSpeechLanguage());

    for await(const part of result.fullStream){
      if(!wantsListening||sessionId!==transcriptionSession)break;
      if(part.type==='error')throw new Error(part.error?.message||part.message||'Speech connection interrupted');
      if(!['transcript-delta','transcript-partial','transcript-final'].includes(part.type))continue;
      if(!receivedRealtimeEvent){
        receivedRealtimeEvent=true;
        reconnectAttempts=0;
        setDiagnostic('realtime','ok');
      }
      lastTranscriptAt=Date.now();voiceMs=0;
      const segment=speechSegments.get(part.id)||{text:'',final:false};
      if(segment.final)continue;
      if(part.type==='transcript-delta')segment.text+=part.delta||'';
      else if(part.type==='transcript-partial')segment.text=part.text||'';
      else{
        segment.text=normalizeSpaces(part.text)||segment.text;
        segment.final=true;
      }
      speechSegments.set(part.id,segment);

      for(const [id,current] of speechSegments){
        if(!current.final)break;
        speechSegments.delete(id);
        const text=normalizeSpaces(current.text);
        if(text){
          commitCapturedSpeech(text);
        }
      }
      interimTranscript=normalizeSpaces([...speechSegments.values()].map(segment=>segment.text).join(' '));
      setTranscript();
      speechState.textContent=interimTranscript?'Hearing you…':'Captured';
      if(interimTranscript&&!conversation.sourceLanguage){
        detectSourceWhileSpeaking(interimTranscript);
        scheduleTranslation(interimTranscript);
      }
    }

    if(turnDrain?.session===sessionId){turnDrain.resolve(true);return}
    if(wantsListening&&sessionId===transcriptionSession){
      if(!receivedRealtimeEvent){
        if(speechModel===LIVE_TRANSCRIBE_MODEL)preferWhisper=true;
        setDiagnostic('realtime','error','Realtime stream ended before any transcript event');
      }
      preserveInterimSpeech();
      await cleanupAudio({keepCapture:true});
      if(sessionId===transcriptionSession)scheduleReconnect();
    }
  }catch(error){
    if(sessionId!==transcriptionSession)return;
    if(turnDrain?.session===sessionId){turnDrain.resolve(false);return}
    console.error('Speech session error:',error?.name||'Error');
    setDiagnostic(failureStage,'error',error?.message||'Unknown speech error');

    const name=error?.name||'';
    const message=String(error?.message||'').toLowerCase();
    const permissionDenied =
      failureStage==='microphone'&&(name==='NotAllowedError'||name==='SecurityError'||
      message.includes('permission')||message.includes('not allowed'));

    const noMic =
      failureStage==='microphone'&&(name==='NotFoundError'||message.includes('no microphone')||
      message.includes('requested device not found'));

    if(speechModel===LIVE_TRANSCRIBE_MODEL&&!receivedRealtimeEvent)preferWhisper=true;
    preserveInterimSpeech();
    await cleanupAudio({keepCapture:failureStage!=='microphone'&&!permissionDenied&&!noMic});
    if(sessionId!==transcriptionSession)return;
    if(permissionDenied){
      wantsListening=false;
      clearTimeout(reconnectTimer);
      mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');mic.setAttribute('aria-pressed','false');
      speechState.textContent='Microphone blocked';
      statusEl.textContent='Microphone access is blocked. On iPhone, open this page in Safari and allow microphone access.';
      failConversationCapture();
      return;
    }

    if(noMic){
      wantsListening=false;
      mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');mic.setAttribute('aria-pressed','false');
      speechState.textContent='No microphone';
      statusEl.textContent='No microphone was found on this device.';
      failConversationCapture();
      return;
    }

    if(wantsListening)scheduleReconnect();
  }
}

async function stopListening(updateUi=true){
  wantsListening=false;
  clearTimeout(reconnectTimer);clearTimeout(sessionLimitTimer);
  const stoppedSession=++transcriptionSession;
  stopBrowserFallback();
  preserveInterimSpeech();
  await cleanupAudio();
  if(stoppedSession!==transcriptionSession)return;
  mic.classList.remove('listening');mic.setAttribute('aria-label','Start listening');mic.setAttribute('aria-pressed','false');mic.textContent='🎤';
  if(updateUi){
    speechState.textContent=committedTranscript?'Stopped':'';
    statusEl.textContent='Stopped — tap the microphone to continue';
  }
}

function beginListening(){
  if(liveVoiceEnabled||conversation.sourceLanguage){primeNaturalVoice();primeSpeechSynthesis()}
  wantsListening=true;
  usingBrowserFallback=false;
  preferWhisper=false;
  reconnectAttempts=0;
  resetDiagnostics();
  return startListening(false);
}
mic.onclick=()=>wantsListening?stopListening(true):beginListening();
document.getElementById('swap').onclick=async()=>{const resumeListening=wantsListening;if(resumeListening)await stopListening(false);const a=input.value;input.value=output.value;output.value=a;updateLanguageButtons();noteUse(input.value);noteUse(output.value);resetTranslationPipeline(true);if(resumeListening){wantsListening=true;reconnectAttempts=0;await startListening(false)}};
document.getElementById('clear').onclick=()=>{clearMp3Download();speechSegments.clear();committedTranscript='';interimTranscript='';lastRequestedText='';lastLiveVoiceSource='';cancelVoice();resetTranslationPipeline();clearTimeout(liveVoicePauseTimer);if('speechSynthesis' in window)speechSynthesis.cancel();setTranscript();setTranslation('');translationState.textContent='';speechState.textContent=isListening?'Listening':'';statusEl.textContent=isListening?'Listening — tap the microphone to stop':'Tap the microphone and start speaking'};
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
    if(isListening&&!usingBrowserFallback&&!conversation.isFinishing)void recoverSpeech();
  }else if(audioSourceMode!=='conversation'){
    statusEl.textContent='You are offline. Internet is required for speech and translation.';
  }
});
window.addEventListener('online',()=>{
  setDiagnostic('network','ok');
  if(wantsListening&&!isListening){reconnectAttempts=0;scheduleReconnect()}
  else if(!wantsListening&&audioSourceMode!=='conversation')statusEl.textContent='Back online — ready to listen';
});
window.addEventListener('beforeunload',()=>{if(mediaStream)mediaStream.getTracks().forEach(t=>t.stop())});
document.addEventListener('visibilitychange',async()=>{
  if(document.hidden||!wantsListening||usingBrowserFallback||conversation.isFinishing)return;
  if(audioContext?.state==='suspended')try{await audioContext.resume()}catch{}
  if(!isListening){reconnectAttempts=0;scheduleReconnect()}
  else if(healthTimer&&Date.now()-lastAudioAt>8000)recoverSpeech(true);
});
for(const [id,key,fallback] of [['translationQuality','vt-quality','accurate'],['voiceQuality','vt-voice-quality','natural'],['audioProfile','vt-audio-profile','standard']]){
  const control=document.getElementById(id);
  control.value=store.get(key,fallback);
  control.onchange=async()=>{
    store.set(key,control.value);
    if(id==='voiceQuality'&&audioSourceMode!=='conversation')cancelVoice();
    if(id==='audioProfile'&&wantsListening&&!conversation.sourceLanguage){
      await stopListening(true);wantsListening=true;reconnectAttempts=0;await startListening(false);
    }
  };
}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));

if(micSourceBtn)micSourceBtn.onclick=()=>setAudioSource('mic');
if(meetingSourceBtn)meetingSourceBtn.onclick=()=>setAudioSource('meeting');
if(conversationSourceBtn)conversationSourceBtn.onclick=()=>setAudioSource('conversation');
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

