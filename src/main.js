import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createGateway } from '@ai-sdk/gateway';

const mic = document.getElementById('mic');
const statusEl = document.getElementById('status');
const speechState = document.getElementById('speechState');
const translationState = document.getElementById('translationState');
const transcriptEl = document.getElementById('transcript');
const translationEl = document.getElementById('translation');
const input = document.getElementById('inputLang');
const output = document.getElementById('outputLang');
const copyBtn = document.getElementById('copy');
const speakBtn = document.getElementById('speak');
const engineBadge = document.getElementById('engineBadge');

let isListening = false;
let committedTranscript = '';
let interimTranscript = '';
let audioController = null;
let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let processorNode = null;
let muteNode = null;
let translateTimer = null;
let translateController = null;
let translateSequence = 0;
let lastRequestedText = '';
let transcriptionSession = 0;

function normalizeSpaces(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function setTranscript(text) {
  if (!text) {
    transcriptEl.textContent = 'Your speech will appear here.';
    transcriptEl.className = 'textBox placeholder';
    return;
  }
  transcriptEl.textContent = text;
  transcriptEl.className = 'textBox';
}

function setTranslation(text) {
  if (!text) {
    translationEl.textContent = 'Your translation will appear here.';
    translationEl.className = 'textBox placeholder';
    return;
  }
  translationEl.textContent = text;
  translationEl.className = 'textBox';
}

function currentTranscript() {
  return normalizeSpaces(committedTranscript + ' ' + interimTranscript);
}

function floatTo16BitPCM(float32) {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function resampleTo24k(inputSamples, inputRate) {
  const outputRate = 24000;
  if (inputRate === outputRate) return inputSamples;

  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(inputSamples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, inputSamples.length - 1);
    const fraction = position - left;
    output[i] = inputSamples[left] * (1 - fraction) + inputSamples[right] * fraction;
  }

  return output;
}

function scheduleTranslation(text, immediate = false) {
  const clean = normalizeSpaces(text);
  clearTimeout(translateTimer);

  if (!clean) {
    lastRequestedText = '';
    setTranslation('');
    translationState.textContent = '';
    return;
  }

  translateTimer = setTimeout(() => translateText(clean), immediate ? 0 : 750);
}

async function translateText(text) {
  if (text === lastRequestedText && !translationEl.classList.contains('placeholder')) return;
  lastRequestedText = text;
  const sequence = ++translateSequence;

  if (translateController) translateController.abort();
  translateController = new AbortController();
  translationState.textContent = 'Translating…';

  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: translateController.signal,
      body: JSON.stringify({
        text,
        sourceLanguage: input.value,
        targetLanguage: output.value,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.error || 'Translation request failed');
    }
    if (sequence !== translateSequence) return;

    setTranslation(data.translation || '');
    translationState.textContent = isListening ? 'Live' : 'Ready';
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Translation error:', error);
    translationState.textContent = 'Translation unavailable';
    statusEl.textContent = 'Translation service error. Speech transcription is still active.';
  }
}

async function createMicrophonePcmStream() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 24000,
    latencyHint: 'interactive',
  });

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  muteNode = audioContext.createGain();
  muteNode.gain.value = 0;

  const pcmStream = new ReadableStream({
    start(controller) {
      audioController = controller;
      processorNode.onaudioprocess = (event) => {
        if (!isListening || !audioController) return;

        const sourceSamples = event.inputBuffer.getChannelData(0);
        const samples24k = resampleTo24k(sourceSamples, audioContext.sampleRate);
        const pcm = floatTo16BitPCM(samples24k);

        try {
          controller.enqueue(pcm);
        } catch {
          // Stream was closed while an audio callback was still in flight.
        }
      };
    },
    cancel() {
      audioController = null;
    },
  });

  sourceNode.connect(processorNode);
  processorNode.connect(muteNode);
  muteNode.connect(audioContext.destination);

  return pcmStream;
}

async function startListening() {
  if (isListening) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    statusEl.textContent = 'Microphone capture is not supported in this browser.';
    return;
  }

  const sessionId = ++transcriptionSession;
  isListening = true;
  mic.classList.add('listening');
  mic.setAttribute('aria-label', 'Stop listening');
  mic.textContent = '■';
  statusEl.innerHTML = '<span class="liveDot"></span>Starting high-accuracy transcription…';
  speechState.textContent = 'Connecting';
  engineBadge.textContent = 'Realtime Whisper';

  try {
    const tokenResponse = await fetch('/api/transcription-token', { method: 'POST' });
    const tokenData = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokenData.token) {
      throw new Error(tokenData.detail || tokenData.error || 'Could not authorize transcription');
    }

    if (!isListening || sessionId !== transcriptionSession) return;

    const microphoneStream = await createMicrophonePcmStream();
    const gateway = createGateway({ apiKey: tokenData.token });

    const result = streamTranscribe({
      model: gateway.transcriptionModel('openai/gpt-realtime-whisper'),
      audio: microphoneStream,
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    });

    statusEl.innerHTML = '<span class="liveDot"></span>Listening — tap again to stop';
    speechState.textContent = 'Listening';

    for await (const part of result.fullStream) {
      if (!isListening || sessionId !== transcriptionSession) break;

      if (part.type === 'transcript-delta') {
        interimTranscript += part.delta || '';
        const visible = currentTranscript();
        setTranscript(visible);
        speechState.textContent = 'Hearing you…';
        scheduleTranslation(visible);
      }

      if (part.type === 'transcript-final') {
        const finalText = normalizeSpaces(part.text || interimTranscript);
        if (finalText) {
          committedTranscript = normalizeSpaces(committedTranscript + ' ' + finalText);
        }
        interimTranscript = '';
        const visible = currentTranscript();
        setTranscript(visible);
        speechState.textContent = 'Captured';
        scheduleTranslation(visible, true);
      }

      if (part.type === 'error') {
        throw new Error(part.error?.message || part.message || 'Realtime transcription error');
      }
    }
  } catch (error) {
    if (sessionId !== transcriptionSession) return;
    console.error('Realtime transcription failed:', error);
    statusEl.textContent = 'Listening error: ' + (error.message || 'Could not start transcription');
    speechState.textContent = 'Error';
    await stopListening(false);
  }
}

async function stopListening(updateUi = true) {
  if (!isListening && !mediaStream && !audioContext) return;

  isListening = false;
  ++transcriptionSession;

  if (processorNode) {
    processorNode.onaudioprocess = null;
    try { processorNode.disconnect(); } catch {}
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
  }
  if (muteNode) {
    try { muteNode.disconnect(); } catch {}
  }

  if (audioController) {
    try { audioController.close(); } catch {}
    audioController = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    try { await audioContext.close(); } catch {}
    audioContext = null;
  }

  sourceNode = null;
  processorNode = null;
  muteNode = null;

  mic.classList.remove('listening');
  mic.setAttribute('aria-label', 'Start listening');
  mic.textContent = '🎤';

  if (updateUi) {
    speechState.textContent = committedTranscript ? 'Stopped' : '';
    statusEl.textContent = 'Stopped — tap the microphone to continue';
    const text = currentTranscript();
    if (text) scheduleTranslation(text, true);
  }
}

mic.onclick = async () => {
  if (isListening) {
    await stopListening(true);
  } else {
    await startListening();
  }
};

document.getElementById('swap').onclick = () => {
  const currentInput = input.value;
  input.value = output.value;
  output.value = currentInput;

  const text = currentTranscript();
  if (text) {
    lastRequestedText = '';
    scheduleTranslation(text, true);
  }
};

input.onchange = async () => {
  const wasListening = isListening;
  if (wasListening) await stopListening(false);

  const text = currentTranscript();
  if (text) {
    lastRequestedText = '';
    scheduleTranslation(text, true);
  }

  if (wasListening) await startListening();
};

output.onchange = () => {
  const text = currentTranscript();
  if (text) {
    lastRequestedText = '';
    scheduleTranslation(text, true);
  }
};

document.getElementById('clear').onclick = () => {
  committedTranscript = '';
  interimTranscript = '';
  lastRequestedText = '';
  ++translateSequence;
  clearTimeout(translateTimer);
  if (translateController) translateController.abort();
  setTranscript('');
  setTranslation('');
  translationState.textContent = '';
  speechState.textContent = isListening ? 'Listening' : '';
  statusEl.textContent = isListening
    ? 'Listening — tap the microphone to stop'
    : 'Tap the microphone and start speaking';
};

copyBtn.onclick = async () => {
  if (translationEl.classList.contains('placeholder')) return;
  try {
    await navigator.clipboard.writeText(translationEl.textContent);
    statusEl.textContent = 'Translation copied';
  } catch {
    statusEl.textContent = 'Copy failed';
  }
};

speakBtn.onclick = () => {
  if (translationEl.classList.contains('placeholder')) return;
  const utterance = new SpeechSynthesisUtterance(translationEl.textContent);
  utterance.lang = output.value;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
};

window.addEventListener('beforeunload', () => {
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
