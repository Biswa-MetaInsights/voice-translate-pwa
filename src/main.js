import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { OrderedTranslationQueue, requestTranslation, splitPhrases } from './translation-client.js';
import { createConversationMp3 } from './conversation-export.js';
import { createLiveText } from './live-text.js';
import { shouldRecover } from './audio-health.js';
import { createPcmBuffer } from './pcm-buffer.js';
import { LIVE_TRANSCRIBE_MODEL, WHISPER_MODEL, speechProviderOptions } from '../lib/speech-models.js';
import { guessSourceLanguage } from './source-language.js';

const LANGUAGES = [
  {code:'en-US',name:'English',region:'Western Europe'},
  {code:'fr-FR',name:'French',region:'Western Europe'},
  {code:'nl-NL',name:'Dutch',region:'Western Europe'},
  {code:'de-DE',name:'German',region:'Western Europe'},
  {code:'lb-LU',name:'Luxembourgish',region:'Western Europe'},
  {code:'ga-IE',name:'Irish',region:'Western Europe'},
  {code:'da-DK',name:'Danish',region:'Northern Europe'},
  {code:'sv-SE',name:'Swedish',region:'Northern Europe'},
  {code:'no-NO',name:'Norwegian',region:'Northern Europe'},
  {code:'fi-FI',name:'Finnish',region:'Northern Europe'},
  {code:'is-IS',name:'Icelandic',region:'Northern Europe'},
  {code:'et-EE',name:'Estonian',region:'Northern Europe'},
  {code:'lv-LV',name:'Latvian',region:'Northern Europe'},
  {code:'lt-LT',name:'Lithuanian',region:'Northern Europe'},
  {code:'pl-PL',name:'Polish',region:'Central Europe'},
  {code:'cs-CZ',name:'Czech',region:'Central Europe'},
  {code:'sk-SK',name:'Slovak',region:'Central Europe'},
  {code:'hu-HU',name:'Hungarian',region:'Central Europe'},
  {code:'ro-RO',name:'Romanian',region:'Central Europe'},
  {code:'rm-CH',name:'Romansh',region:'Central Europe'},
  {code:'it-IT',name:'Italian',region:'Southern Europe'},
  {code:'es-ES',name:'Spanish',region:'Southern Europe'},
  {code:'pt-PT',name:'Portuguese',region:'Southern Europe'},
  {code:'el-GR',name:'Greek',region:'Southern Europe'},
  {code:'mt-MT',name:'Maltese',region:'Southern Europe'},
  {code:'ca-ES',name:'Catalan',region:'Southern Europe'},
  {code:'bg-BG',name:'Bulgarian',region:'Eastern Europe & Balkans'},
  {code:'hr-HR',name:'Croatian',region:'Eastern Europe & Balkans'},
  {code:'sl-SI',name:'Slovenian',region:'Eastern Europe & Balkans'},
  {code:'sr-RS',name:'Serbian',region:'Eastern Europe & Balkans'},
  {code:'bs-BA',name:'Bosnian',region:'Eastern Europe & Balkans'},
  {code:'sq-AL',name:'Albanian',region:'Eastern Europe & Balkans'},
  {code:'mk-MK',name:'Macedonian',region:'Eastern Europe & Balkans'},
  {code:'uk-UA',name:'Ukrainian',region:'Eastern Europe & Balkans'},
  {code:'ru-RU',name:'Russian',region:'Eastern Europe & Balkans'},
  {code:'tr-TR',name:'Turkish',region:'Middle East & Asia'},
  {code:'eu-ES',name:'Basque',region:'Regional European Languages'},
  {code:'gl-ES',name:'Galician',region:'Regional European Languages'},
  {code:'cy-GB',name:'Welsh',region:'Regional European Languages'},
  {code:'gd-GB',name:'Scottish Gaelic',region:'Regional European Languages'},
  {code:'br-FR',name:'Breton',region:'Regional European Languages'},
  {code:'oc-FR',name:'Occitan',region:'Regional European Languages'},
  {code:'co-FR',name:'Corsican',region:'Regional European Languages'},
  {code:'fy-NL',name:'Western Frisian',region:'Regional European Languages'},
  {code:'fo-FO',name:'Faroese',region:'Regional European Languages'},
  {code:'se-NO',name:'Northern Sami',region:'Regional European Languages'},
  {code:'be-BY',name:'Belarusian',region:'Eastern Europe & Balkans'},
  {code:'hy-AM',name:'Armenian',region:'Eastern Europe & Balkans'},
  {code:'ka-GE',name:'Georgian',region:'Eastern Europe & Balkans'},
  {code:'he-IL',name:'Hebrew',region:'Middle East & Asia'},
  {code:'fa-IR',name:'Persian (Farsi)',region:'Middle East & Asia'},
  {code:'ar-SA',name:'Arabic (Standard)',region:'Middle East & Asia'},
  {code:'ar-EG',name:'Arabic (Egyptian)',region:'Middle East & Asia'},
  {code:'ar-MA',name:'Arabic (Moroccan)',region:'Middle East & Asia'},
  {code:'ar-AE',name:'Arabic (Gulf)',region:'Middle East & Asia'},
  {code:'zh-CN',name:'Chinese (Mandarin, Simplified)',region:'East Asia'},
  {code:'zh-TW',name:'Chinese (Traditional)',region:'East Asia'},
  {code:'yue-HK',name:'Cantonese',region:'East Asia'},
  {code:'ja-JP',name:'Japanese',region:'East Asia'},
  {code:'ko-KR',name:'Korean',region:'East Asia'},
  {code:'hi-IN',name:'Hindi',region:'South Asia'},
  {code:'ml-IN',name:'Malayalam',region:'South Asia'},
  {code:'ta-IN',name:'Tamil',region:'South Asia'},
  {code:'te-IN',name:'Telugu',region:'South Asia'},
  {code:'kn-IN',name:'Kannada',region:'South Asia'},
  {code:'fil-PH',name:'Filipino (Tagalog)',region:'Southeast Asia'}
];
const AUTO_LANGUAGE={code:'auto',name:'Auto-detect',region:'Automatic'};
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
const conversationControls=document.getElementById('conversationControls');
const conversationAction=document.getElementById('conversationAction');
const conversationEnd=document.getElementById('conversationEnd');
const conversationHistory=document.getElementById('conversationHistory');
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
let conversationLanguages=['en-US','fr-FR'];
let regularLanguages=null,conversationPhase='idle',conversationSpeaker=0,conversationEnding=false;
let conversationTurnOffset=0,conversationLastPlayback=null,changingAudioSource=false;
let speechController=null,healthTimer=null,healthStartedAt=0,lastAudioAt=0,lastVoiceAt=0,lastTranscriptAt=0,voiceMs=0;
let speechRecoveryRunning=false;
let preferWhisper=false;
let previewText='';
const speechSegments=new Map();

function preserveInterimSpeech(){
  const tail=normalizeSpaces(interimTranscript);
  if(tail){
    committedTranscript=normalizeSpaces(committedTranscript+' '+tail);
    interimTranscript='';
    queueFinalTranslation(tail);
    setTranscript();
  }
  speechSegments.clear();
}

async function recoverSpeech(restartCapture=false){
  if(speechRecoveryRunning||!wantsListening||usingBrowserFallback)return;
  speechRecoveryRunning=true;
  ++transcriptionSession;
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
audioSourceMode=store.get('vt-audio-source','mic')==='meeting'?'meeting':'mic';

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
function setTranscript(){renderTranscript(committedTranscript,interimTranscript,/^(ar|he|fa|ur)(-|$)/.test(input.value)?'rtl':'auto')}
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
let retryVoicePlayback=null;
const speakStatus=document.getElementById('speakStatus');
function primeNaturalVoice(){
  if(typeof Audio==='undefined')return;
  if(!naturalVoicePlayer)naturalVoicePlayer=new Audio();
  naturalVoicePlayer.src='data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';
  naturalVoicePlayer.play().catch(()=>{});
}
function cancelVoice(){
  ++liveVoiceGeneration;queuedVoiceCount=0;
  if(voiceRequestController)voiceRequestController.abort();
  if(activeVoiceAudio){
    const player=activeVoiceAudio;activeVoiceAudio=null;
    player.pause();player.onended?.();player.onended=null;player.onerror=null;
  }
  if('speechSynthesis' in window)speechSynthesis.cancel();
  retryVoicePlayback?.cancel();retryVoicePlayback=null;
  speakBtn.textContent='🔊 Speak';speakStatus.textContent='';
  liveVoiceQueue=Promise.resolve();
}
function deviceSpeak(text,lang,onError=()=>{}){
  const voice=chooseSpeechVoice(lang);
  if(!voice||!('SpeechSynthesisUtterance' in window)){
    onError('No matching device voice. Select Natural voice.');return Promise.resolve();
  }
  return new Promise(resolve=>{
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang=lang;utterance.voice=voice;
    utterance.onend=resolve;
    utterance.onerror=event=>{if(!['canceled','interrupted'].includes(event.error))onError('Device voice could not play. Try Natural voice.');resolve()};
    speechSynthesis.resume();speechSynthesis.speak(utterance);
  });
}
function speakText(text,{replace=false,lang=output.value}={}){
  const clean=normalizeSpaces(text||'');if(!clean)return false;
  const natural=document.getElementById('voiceQuality').value!=='device';
  if(replace){cancelVoice();if(natural)primeNaturalVoice()}
  const generation=liveVoiceGeneration;
  const report=message=>{if(generation===liveVoiceGeneration)speakStatus.textContent=message};
  const chunks=splitPhrases(clean,natural&&replace?600:2400);
  if(replace)report(natural?'Preparing voice…':'Playing device voice…');
  let failed=false;
  const reportFailure=message=>{failed=true;report(message)};
  const immediateDevice=replace&&!natural?deviceSpeak(chunks[0],lang,reportFailure):null;
  queuedVoiceCount+=chunks.length;
  if(queuedVoiceCount>3)liveVoiceState.textContent='Catching up';
  for(const [index,chunk] of chunks.entries())liveVoiceQueue=liveVoiceQueue.catch(()=>{}).then(async()=>{
    if(generation!==liveVoiceGeneration)return;
    try{
      if(!natural){await (index===0&&immediateDevice?immediateDevice:deviceSpeak(chunk,lang,reportFailure));return}
      const requestController=new AbortController();voiceRequestController=requestController;
      const timeout=setTimeout(()=>requestController.abort(),12_000);
      let blob;
      try{
        const response=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({text:chunk}),signal:requestController.signal});
        if(!response.ok||!response.headers.get('content-type')?.includes('audio/'))throw new Error('Natural voice unavailable');
        blob=await response.blob();
        if(!blob.size)throw new Error('Natural voice returned empty audio');
      }finally{clearTimeout(timeout);if(voiceRequestController===requestController)voiceRequestController=null}
      if(generation!==liveVoiceGeneration)return;
      const url=URL.createObjectURL(blob),player=naturalVoicePlayer||new Audio();player.src=url;activeVoiceAudio=player;
      try{
        await new Promise((resolve,reject)=>{
          player.onended=resolve;player.onerror=reject;
          const play=()=>player.play().then(()=>{
            if(generation!==liveVoiceGeneration)return;
            retryVoicePlayback=null;speakBtn.textContent='🔊 Speak';report('Playing voice…');
          }).catch(error=>{
            if(replace&&error.name==='NotAllowedError'&&generation===liveVoiceGeneration){
              retryVoicePlayback={play,cancel:resolve};speakBtn.textContent='▶ Play voice';report('Voice ready. Tap Play voice.');
            }else reject(error);
          });
          play();
        });
      }finally{
        URL.revokeObjectURL(url);
        if(activeVoiceAudio===player){
          activeVoiceAudio=null;player.onended=null;player.onerror=null;
        }
        if(generation===liveVoiceGeneration){retryVoicePlayback=null;speakBtn.textContent='🔊 Speak'}
      }
    }catch(error){
      if(generation!==liveVoiceGeneration)return;
      if(error?.name==='NotAllowedError'){
        liveVoiceEnabled=false;renderLiveVoice();
        reportFailure('Tap Speak to allow translated voice playback on this device.');return;
      }
      report('Natural voice unavailable. Trying device voice…');
      await deviceSpeak(chunk,lang,reportFailure);
    }finally{
      if(generation===liveVoiceGeneration){
        queuedVoiceCount=Math.max(0,queuedVoiceCount-1);renderLiveVoice();
        if(replace&&index===chunks.length-1&&!failed)report('');
      }
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
  if(mode===audioSourceMode||changingAudioSource)return;
  changingAudioSource=true;
  try{
    const previous=audioSourceMode;
    const conversationChange=mode==='conversation'||previous==='conversation';
    const resume=wantsListening;
    if(resume||isListening)await stopListening(false);
    if(previous==='conversation'){
      [input.value,output.value]=regularLanguages;
      conversationPhase='idle';
      clearConversationView();
    }
    if(mode==='conversation'){
      regularLanguages=[input.value,output.value];
      const first=input.value==='auto'?'en-US':input.value;
      const second=output.value===first?(first==='fr-FR'?'en-US':'fr-FR'):output.value;
      conversationLanguages=[first,second];
      clearConversationView();
      statusEl.textContent='Choose both languages, then start.';
    }
    audioSourceMode=mode;
    if(mode!=='conversation')store.set('vt-audio-source',mode);
    updateLanguageButtons();renderAudioSource();
    if(conversationChange&&mode!=='conversation')statusEl.textContent='Tap the microphone and start speaking';
    if(resume&&!conversationChange){
      wantsListening=true;
      reconnectAttempts=0;
      await startListening(false);
    }
  }finally{changingAudioSource=false}
}

function renderAudioSource(){
  for(const [mode,button] of [['mic',micSourceBtn],['meeting',meetingSourceBtn],['conversation',conversationSourceBtn]]){
    const selected=audioSourceMode===mode;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  sourceHint.textContent={
    meeting:'Meeting audio captures sound from a shared tab/screen. When prompted, share the meeting and enable audio.',
    mic:'Microphone mode listens to your voice.',
    conversation:'Share one microphone. Finish your turn, then pass the phone to the other person.',
  }[audioSourceMode];
  renderConversationControls();
}

function renderConversationControls(){
  const inConversation=audioSourceMode==='conversation';
  const busy=['stopping','finishing'].includes(conversationPhase);
  const active=conversationPhase!=='idle';
  conversationControls.hidden=conversationHistory.hidden=!inConversation;
  mic.hidden=inConversation;
  conversationAction.disabled=busy||conversationLanguages[0]===conversationLanguages[1];
  conversationAction.textContent=busy?'Finishing turn…':conversationPhase==='listening'?'Finish turn':
    active?'Person '+(conversationSpeaker+1)+' · Speak':'Start conversation';
  conversationEnd.hidden=!active;
  conversationEnd.disabled=busy;
  document.getElementById('inputPicker').disabled=inConversation&&active;
  document.getElementById('outputPicker').disabled=inConversation&&active;
}

function clearConversationView(){
  clearMp3Download();
  conversationHistory.replaceChildren();
  conversationLastPlayback=null;
  conversationEnding=false;
  committedTranscript=interimTranscript='';
  speechSegments.clear();
  resetTranslationPipeline();
  setTranscript();
}

async function startConversationTurn(){
  if(changingAudioSource||!['idle','ready'].includes(conversationPhase)||conversationLanguages[0]===conversationLanguages[1])return;
  if(conversationPhase==='idle'){
    clearConversationView();
    conversationSpeaker=0;
  }else{
    cancelVoice();
    committedTranscript=interimTranscript=translatedCommitted=translatedInterim='';
    lastInterimText='';lastPreviewAt=0;
    recentSourcePhrases=[];
    setTranscript();showTranslatedText();
  }
  input.value=conversationLanguages[conversationSpeaker];
  output.value=conversationLanguages[1-conversationSpeaker];
  conversationTurnOffset=conversationTurns.length;
  conversationLastPlayback=null;
  conversationPhase='listening';
  renderConversationControls();
  if(liveVoiceEnabled){primeNaturalVoice();primeSpeechSynthesis()}
  await beginListening();
  if(conversationPhase==='listening'&&!wantsListening){
    conversationPhase=conversationHistory.children.length?'ready':'idle';
    renderConversationControls();
  }
}

function finishConversationTurn(){
  if(conversationPhase!=='finishing'||pendingTranslations)return;
  const turns=conversationTurns.slice(conversationTurnOffset);
  const source=turns.map(turn=>turn.source).join(' ');
  const translation=turns.map(turn=>turn.translation).filter(Boolean).join(' ');
  if(source){
    const row=document.createElement('li');row.className='conversationTurn';row.dataset.person=String(conversationSpeaker+1);
    const heading=document.createElement('strong');heading.textContent='Person '+(conversationSpeaker+1)+' · '+language(input.value).name+' → '+language(output.value).name;
    const original=document.createElement('p');original.textContent=source;original.lang=input.value;original.dir='auto';
    const translated=document.createElement('p');translated.textContent=translation||'Translation unavailable';translated.lang=output.value;translated.dir='auto';
    row.append(heading,original,translated);
    if(translation){
      const playback={text:translation,lang:output.value};
      conversationLastPlayback=playback;
      const play=document.createElement('button');play.type='button';play.className='btn';play.textContent='▶ Play translation';
      play.onclick=()=>{if(conversationPhase==='ready'||conversationPhase==='idle')speakText(playback.text,{replace:true,lang:playback.lang})};
      row.append(play);
      if(liveVoiceEnabled)speakText(playback.text,{lang:playback.lang});
    }
    conversationHistory.append(row);
    conversationSpeaker=1-conversationSpeaker;
  }
  conversationPhase=conversationEnding?'idle':'ready';
  statusEl.textContent=conversationEnding?'Conversation ended. You can play or download it.':
    source?'Pass the phone to Person '+(conversationSpeaker+1)+'.':'No speech captured. Try this turn again.';
  renderConversationControls();
}

async function endConversationTurn(end=false){
  if(conversationPhase==='ready'&&end){
    conversationPhase='idle';statusEl.textContent='Conversation ended. You can play or download it.';renderConversationControls();return;
  }
  if(conversationPhase!=='listening')return;
  conversationEnding=end;
  conversationPhase='stopping';
  renderConversationControls();
  await stopListening(false);
  if(conversationPhase!=='stopping')return;
  conversationPhase='finishing';
  finishConversationTurn();
}

const flagRegions = {'en-US':'gb','ca-ES':'es-ct','cy-GB':'gb-wls','gd-GB':'gb-sct'};

function renderLanguageFlag(element, code){
  if(code==='auto'){
    delete element.dataset.flag;
    element.textContent='🌐';
    return;
  }
  element.dataset.flag=flagRegions[code]||code.split('-')[1].toLowerCase();
  element.textContent='';
}

function updateLanguageButtons(){
  const inConversation=audioSourceMode==='conversation';
  document.getElementById('languageRow').classList.toggle('conversationPair',inConversation);
  const [a,b]=(inConversation?conversationLanguages:[input.value,output.value]).map(language);
  document.getElementById('inputRole').textContent=inConversation?'PERSON 1':'FROM';
  document.getElementById('outputRole').textContent=inConversation?'PERSON 2':'TO';
  renderLanguageFlag(document.getElementById('inputFlag'),a.code);
  renderLanguageFlag(document.getElementById('outputFlag'),b.code);
  document.getElementById('inputName').textContent=a.name;
  document.getElementById('outputName').textContent=b.name;
  const swap=document.getElementById('swap');
  swap.hidden=inConversation;
  swap.disabled=inConversation||input.value==='auto';
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
  const available=pickerTarget==='input'&&audioSourceMode!=='conversation'?[AUTO_LANGUAGE,...LANGUAGES]:LANGUAGES;
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
      const flag=document.createElement('span');flag.className='flag';
      flag.setAttribute('aria-hidden','true');
      renderLanguageFlag(flag,l.code);
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
  if(audioSourceMode==='conversation'){
    if(conversationPhase!=='idle'||code==='auto')return;
    conversationLanguages[pickerTarget==='input'?0:1]=code;
    noteUse(code);updateLanguageButtons();renderConversationControls();closeSheet('languageSheet');
    statusEl.textContent=conversationLanguages[0]===conversationLanguages[1]?'Choose a different language for each person.':'Choose both languages, then start.';
    return;
  }
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
  if(audioSourceMode==='conversation'&&conversationPhase!=='idle')return;
  pickerTarget=target;
  document.getElementById('sheetTitle').textContent=audioSourceMode==='conversation'?'Choose Person '+(target==='input'?1:2)+'’s language':target==='input'?'Choose input language':'Choose translation language';
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
    if(!count)finishConversationTurn();
  },
  onCommit:({job,result,error})=>{
    translatedInterim='';
    conversationTurns.push({source:job.text,translation:error?'':result.translation});
    if(downloadMp3Btn)downloadMp3Btn.disabled=Boolean(mp3Controller);
    if(error){
      translationFailures=true;
      translatedCommitted=normalizeSpaces(translatedCommitted+' ⟦Translation unavailable⟧');
      translationState.textContent='Some speech needs retrying';
      document.getElementById('retryTranslation').hidden=audioSourceMode==='conversation';
    }else{
      translatedCommitted=normalizeSpaces(translatedCommitted+' '+result.translation);
      if(job.sourceLanguage==='auto'&&job.sourceLanguageVersion===sourceLanguageVersion&&result.detectedLanguage){
        showDetectedLanguage(result.detectedLanguage);
      }
      translationState.textContent=(result.needsReview?'Check unclear phrase · ':'Live · ')+result.endToEndMs+'ms';
      if(audioSourceMode!=='conversation'&&liveVoiceEnabled&&job.voiceGeneration===liveVoiceGeneration)speakText(result.translation,{lang:job.targetLanguage});
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
  conversationTurns=[];if(downloadMp3Btn)downloadMp3Btn.disabled=true;
  document.getElementById('retryTranslation').hidden=true;
  translatedCommitted='';translatedInterim='';lastInterimText='';lastRequestedText='';lastPreviewAt=0;
  showDetectedLanguage(null);showTranslatedText();translationState.textContent='';
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(retranslateHistory&&committedTranscript)queueFinalTranslation(committedTranscript,{speak:false});
  if(retranslateHistory&&interimTranscript)scheduleTranslation(interimTranscript);
}
function scheduleTranslation(text){
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
document.getElementById('retryTranslation').onclick=()=>{if(audioSourceMode!=='conversation')resetTranslationPipeline(true)};

function clearMp3Download(){
  if(mp3Controller)mp3Controller.abort();
  if(mp3Url){URL.revokeObjectURL(mp3Url);mp3Url=null;}
  const link=document.getElementById('mp3Save');if(link){link.hidden=true;link.removeAttribute('href')}
}
if(downloadMp3Btn)downloadMp3Btn.onclick=async()=>{
  if(mp3Controller)return;
  clearMp3Download();
  const controller=new AbortController();mp3Controller=controller;
  const status=document.getElementById('mp3Status'),cancel=document.getElementById('cancelMp3');
  downloadMp3Btn.disabled=true;cancel.hidden=false;status.textContent='Preparing MP3…';
  const snapshot=conversationTurns.map(turn=>({...turn}));
  try{
    const blob=await createConversationMp3(snapshot,{mode:document.getElementById('mp3Content').value||'both',signal:controller.signal,
      onProgress:({completed,total})=>{status.textContent='Preparing MP3 · '+Math.round(completed/total*100)+'%';}});
    controller.signal.throwIfAborted();
    mp3Url=URL.createObjectURL(blob);
    const link=document.getElementById('mp3Save');link.href=mp3Url;
    link.download='voicetranslator-conversation-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp3';
    link.hidden=false;status.textContent='MP3 ready. Tap Save conversation MP3.';
  }catch(error){status.textContent=error.name==='AbortError'?'MP3 download cancelled.':error.message||'Could not prepare the MP3.';}
  finally{if(mp3Controller===controller)mp3Controller=null;cancel.hidden=true;downloadMp3Btn.disabled=!conversationTurns.length;}
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
    if(!wantsListening||microphoneBuffer!==buffer)return;
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
    if(!wantsListening||microphoneBuffer!==buffer)return;
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
  if(input.value==='auto'){
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
  browserRecognition.lang=input.value;
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
      committedTranscript=normalizeSpaces(committedTranscript+' '+finalPhrase);
      interimTranscript=interim;
      setTranscript();queueFinalTranslation(finalPhrase);
    }else{
      interimTranscript=interim;
      setTranscript();scheduleTranslation(interimTranscript);
    }
  };

  browserRecognition.onerror=(event)=>{
    if(!current())return;
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
    if(current()){
      preserveInterimSpeech();
      try{recognition.start()}catch{}
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
    try{browserRecognition.onend=null;browserRecognition.onresult=null;browserRecognition.onerror=null;browserRecognition.stop()}catch{}
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
    void cleanupAudio();
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
  if(audioSourceMode!=='meeting'&&!navigator.mediaDevices?.getUserMedia){wantsListening=false;statusEl.textContent='Microphone capture is not supported in this browser.';return}
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
      if(audioSourceMode==='conversation'){await endConversationTurn();return}
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
      providerOptions:speechProviderOptions(input.value,speechModel),
      abortSignal:sessionController.signal
    });

    statusEl.innerHTML='<span class="liveDot"></span>Listening — tap again to stop';
    speechState.textContent='Listening';
    noteUse(input.value);

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
          committedTranscript=normalizeSpaces(committedTranscript+' '+text);
          queueFinalTranslation(text);
        }
      }
      interimTranscript=normalizeSpaces([...speechSegments.values()].map(segment=>segment.text).join(' '));
      setTranscript();
      speechState.textContent=interimTranscript?'Hearing you…':'Captured';
      if(interimTranscript){
        detectSourceWhileSpeaking(interimTranscript);
        scheduleTranslation(interimTranscript);
      }
    }

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
      return;
    }

    if(noMic){
      wantsListening=false;
      mic.classList.remove('listening');mic.textContent='🎤';mic.setAttribute('aria-label','Start listening');mic.setAttribute('aria-pressed','false');
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

async function beginListening(){
  wantsListening=true;
  usingBrowserFallback=false;
  preferWhisper=false;
  reconnectAttempts=0;
  resetDiagnostics();
  await startListening(false);
}
mic.onclick=async()=>{
  if(wantsListening){await stopListening(true);return}
  if(liveVoiceEnabled){primeNaturalVoice();primeSpeechSynthesis()}
  await beginListening();
};
conversationAction.onclick=()=>conversationPhase==='listening'?endConversationTurn():startConversationTurn();
conversationEnd.onclick=()=>endConversationTurn(true);
document.getElementById('swap').onclick=async()=>{const resumeListening=wantsListening;if(resumeListening)await stopListening(false);const a=input.value;input.value=output.value;output.value=a;updateLanguageButtons();noteUse(input.value);noteUse(output.value);resetTranslationPipeline(true);if(resumeListening){wantsListening=true;reconnectAttempts=0;await startListening(false)}};
document.getElementById('clear').onclick=()=>{if(audioSourceMode==='conversation'&&['stopping','finishing'].includes(conversationPhase))return;if(audioSourceMode==='conversation'){conversationHistory.replaceChildren();conversationLastPlayback=null;conversationTurnOffset=0;}clearMp3Download();speechSegments.clear();committedTranscript='';interimTranscript='';lastRequestedText='';lastLiveVoiceSource='';cancelVoice();resetTranslationPipeline();clearTimeout(liveVoicePauseTimer);if('speechSynthesis' in window)speechSynthesis.cancel();setTranscript();setTranslation('');translationState.textContent='';speechState.textContent=isListening?'Listening':'';statusEl.textContent=isListening?'Listening — tap the microphone to stop':'Tap the microphone and start speaking'};
copyBtn.onclick=async()=>{if(translationEl.classList.contains('placeholder'))return;try{await navigator.clipboard.writeText(translationEl.textContent);statusEl.textContent='Translation copied'}catch{statusEl.textContent='Copy failed'}};
speakBtn.onclick=()=>{
  if(audioSourceMode==='conversation'&&['listening','stopping','finishing'].includes(conversationPhase)){speakStatus.textContent='Finish the speaking turn before playing audio.';return}
  if(retryVoicePlayback){retryVoicePlayback.play();return}
  if(audioSourceMode==='conversation'&&conversationLastPlayback){speakText(conversationLastPlayback.text,{replace:true,lang:conversationLastPlayback.lang});return}
  if(translationEl.classList.contains('placeholder')){speakStatus.textContent='Start a translation to play it here.';return}
  speakText(translationEl.textContent,{replace:true});
};
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
    if(isListening&&!usingBrowserFallback)void recoverSpeech();
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
  else if(healthTimer&&Date.now()-lastAudioAt>8000)recoverSpeech(true);
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
conversationSourceBtn.onclick=()=>setAudioSource('conversation');
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

