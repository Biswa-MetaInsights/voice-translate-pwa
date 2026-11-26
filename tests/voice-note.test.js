import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceNoteHandler, localUploadLimits } from '../lib/voice-note/handler.js';
import { voiceNoteMime, VOICE_NOTE_MAX_BYTES } from '../lib/voice-note-format.js';
import { translateVoiceNote } from '../src/voice-note-client.js';
const ogg = () => { const b = Buffer.alloc(100); b.write('OggS'); b.write('OpusHead', 28); return b; };
const req = (body = ogg(), headers = {}) => new Request('https://voicetranslator.eu/api/transcribe-audio', { method:'POST', body, duplex:'half', headers: { origin:'https://voicetranslator.eu', 'content-type':'audio/ogg', 'x-voicetranslator-consent':'audio-v1', ...headers } });
const handler = (transcribe = async () => ({ text:'الموعد يوم الجمعة الساعة العاشرة والنصف' }), extra = {}) => createVoiceNoteHandler({ transcribe, env:{VOICE_NOTE_UPLOAD_ENABLED:'true'}, ...extra });
test('recognizes WhatsApp Opus independently of filename and rejects non-audio', () => {
  assert.equal(voiceNoteMime(ogg()), 'audio/ogg');
  assert.throws(() => voiceNoteMime(Buffer.from('<html>not a voice note</html>')), /Unsupported/);
  assert.throws(() => voiceNoteMime(ogg(), VOICE_NOTE_MAX_BYTES + 1), /4 MB/);
});
test('upload requires explicit feature enablement, origin and agreement before provider use', async () => {
  let calls=0;const h=handler(async()=>{calls++;return {text:'test'};});
  assert.equal((await handler(undefined,{env:{}})(req())).status,503);
  assert.equal((await h(req(ogg(),{origin:'https://other.example'}))).status,403);
  assert.equal((await h(req(ogg(),{'x-voicetranslator-consent':''}))).status,400);
  assert.equal((await h(req(ogg(),{'x-source-language':'__proto__'}))).status,400);
  assert.equal((await h(req(ogg(),{'content-encoding':'gzip'}))).status,415);
  assert.equal(calls,0);
});
test('server enforces header and streamed byte limits rather than trusting a filename', async () => {
  let calls=0;const h=handler(async()=>{calls++;return {text:'test'};});
  assert.equal((await h(req(ogg(),{'content-length':String(VOICE_NOTE_MAX_BYTES+1)}))).status,413);
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(VOICE_NOTE_MAX_BYTES));c.enqueue(new Uint8Array(1));c.close();}});
  assert.equal((await h(req(stream))).status,413);
  assert.equal((await h(req(Buffer.from('<html>payload disguised as audio</html>')))).status,415);
  assert.equal((await h(req(ogg(),{'content-type':'audio/mp4'}))).status,415);
  assert.equal(calls,0);
});
test('transcription preserves Arabic and language hints, never caches, and clears its audio buffer', async () => {
  let buffer;
  const r=await handler(async(audio, options)=>{buffer=audio;assert.equal(options.sourceLanguage,'ar-SA');assert.equal(options.mimeType,'audio/ogg');return {text:'الجمعة 10:30'};})(req());
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await r.json()).text,'الجمعة 10:30');assert.ok(buffer.every(v=>v===0));
});
test('empty speech and provider exceptions return useful errors without leaking content', async () => {
  assert.equal((await handler(async()=>({text:'   '}))(req())).status,422);
  const r=await handler(async()=>{throw new Error('SECRET_TOKEN private transcript +32400000000');})(req());
  assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/SECRET_TOKEN|private transcript|32400000000/);
});
test('reading an abandoned upload times out and releases worker capacity', async () => {
  const limits=localUploadLimits(), h=handler(undefined,{limits,timeoutMs:15});
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));}});
  assert.equal((await h(req(stream))).status,504);
  assert.equal((await h(req())).status,200);
});
test('upload rate limits do not alter the existing live translation limiter', async () => {
  const h=handler();for(let i=0;i<6;i++)assert.equal((await h(req())).status,200);
  assert.equal((await h(req())).status,429);
});
test('voice note uses existing translation service and retains dates/times supplied by speech fixture', async () => {
  const calls=[];let original='';
  const fetchImpl=async(url, init)=>{
    calls.push(url);
    if(url==='/api/transcribe-audio'){assert.equal(init.headers['X-Source-Language'],'ar-SA');return Response.json({text:'الموعد يوم الجمعة الساعة 10:30'});}
    assert.equal(url,'/api/translate');const p=JSON.parse(init.body);assert.equal(p.sourceLanguage,'ar-SA');assert.equal(p.targetLanguage,'en-US');assert.deepEqual(p.context,[]);
    return Response.json({translation:'The appointment is on Friday at 10:30.',targetLanguage:'en-US',needsReview:false});
  };
  const result=await translateVoiceNote(new Blob([ogg()]),{consent:true,fetchImpl,onTranscript:t=>original=t});
  assert.match(result.translation,/Friday at 10:30/);assert.match(original,/الجمعة/);assert.deepEqual(calls,['/api/transcribe-audio','/api/translate']);
});
test('selected file is not sent without agreement; ambiguous meaning is not presented as a translation', async () => {
  let calls=0;const file=new Blob([ogg()]);
  await assert.rejects(translateVoiceNote(file,{fetchImpl:async()=>{calls++;}}),/Confirm/);assert.equal(calls,0);
  await assert.rejects(translateVoiceNote(file,{consent:true,fetchImpl:async()=>Response.json({text:'unclear phrase'}),translate:async()=>({translation:'invented',needsReview:true})}),/meaning was unclear/);
});
test('cancelling after transcription prevents the subsequent translation call', async () => {
  const c=new AbortController();let translated=false;
  await assert.rejects(translateVoiceNote(new Blob([ogg()]),{consent:true,signal:c.signal,fetchImpl:async()=>Response.json({text:'sample speech'}),onTranscript:()=>c.abort(),translate:async()=>{translated=true;}}));
  assert.equal(translated,false);
});
test('long transcript is translated in complete chunks and any failure yields no partial success', async () => {
  const transcript='الجمعة 10:30 '.repeat(400), chunks=[];
  const output=await translateVoiceNote(new Blob([ogg()]),{consent:true,fetchImpl:async()=>Response.json({text:transcript}),translate:async p=>{chunks.push(p.text);return {translation:'Friday 10:30'};}});
  assert.ok(chunks.length>1);assert.equal(chunks.join(' ').replace(/\s+/g,' ').trim(),transcript.trim());assert.match(output.translation,/10:30/);
});
test('a failed later translation chunk does not return an apparently complete translation',async()=>{
  let count=0;let value;
  try{value=await translateVoiceNote(new Blob([ogg()]),{consent:true,fetchImpl:async()=>Response.json({text:'Arabic phrase '.repeat(300)}),translate:async()=>{if(++count===2)throw new Error('failed chunk');return {translation:'partial'};}});}catch(error){assert.match(error.message,/failed chunk/);}
  assert.equal(count,2);assert.equal(value,undefined);
});

test('privacy referrer policy may omit Origin on a genuine same-origin browser upload',async()=>{
  const h=handler();
  const same=req(ogg(),{'sec-fetch-site':'same-origin'});same.headers.delete('origin');
  assert.equal((await h(same)).status,200);
  assert.equal((await h(req(ogg(),{origin:'null','sec-fetch-site':'same-origin'}))).status,200);
  assert.equal((await h(req(ogg(),{origin:'https://other.example','sec-fetch-site':'same-origin'}))).status,403);
  assert.equal((await h(req(ogg(),{origin:'null','sec-fetch-site':'cross-site'}))).status,403);
});
