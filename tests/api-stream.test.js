import {assertTranslationLanguage} from '../lib/translation-language.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { readCompletionStream,translationPrefix } from '../lib/translation-stream.js';

const code=readFileSync(new URL('../api/translate.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
async function streamRequest({replies,context=[],quality='accurate',sourceLanguage='auto',targetLanguage='en-US',text='Bonjour',onEvent=()=>{}}){
  const calls=[],lines=[];
  const sandbox=vm.createContext({console,process:{env:{AI_GATEWAY_API_KEY:'test'}},AbortController,AbortSignal,readCompletionStream,translationPrefix,assertTranslationLanguage,
    fetch:async(url,options)=>{
      assert.equal(lines[0]?.type,'start','send initial body before provider work');
      calls.push(JSON.parse(options.body));const reply=replies.shift();
      if(reply instanceof Error)throw reply;
      if(typeof reply==='function')return reply();
      const chunks=typeof reply==='string'?[reply]:reply;
      const sse=chunks.map(content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n').join('')+'data: [DONE]\n\n';
      return new Response(sse);
    }});
  vm.runInContext(code,sandbox);
  const res={statusCode:200,setHeader(){},flushHeaders(){},on(){},write(line){const event=JSON.parse(line);lines.push(event);onEvent(event)},end(){this.writableEnded=true},
    status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
  await sandbox.handler({method:'POST',headers:{},body:{text,sourceLanguage,targetLanguage,context,quality,stream:true}},res);
  return {calls,lines,res};
}
test('streamed API emits partial words immediately and caps context',async()=>{
  const {calls,lines,res}=await streamRequest({replies:[['{"translation":"Hel','lo","detectedLanguage":"fr-FR","needsReview":false}']],context:['ignored','a'.repeat(900),'b','c']});
  assert.equal(res.writableEnded,true);
  assert.equal(lines[0].type,'start');
  assert.equal(lines[1].type,'progress');assert.equal(lines[1].translation,'Hel');
  assert.equal(lines.at(-1).type,'done');assert.equal(lines.at(-1).result.translation,'Hello');
  assert.equal(calls[0].model,'openai/gpt-5.6-sol');
  const prior=JSON.parse(calls[0].messages[1].content).previousTranscript;
  assert.equal(prior.length,3);assert.equal(prior[0].length,600);
  const metrics=lines.at(-1).result.metrics;
  assert.ok(metrics.totalMs>=0);assert.equal(metrics.firstInvocation,true);
  assert.equal(metrics.attempts.length,1);assert.equal(metrics.attempts[0].outcome,'success');
  assert.ok(metrics.attempts[0].headersMs>=0);assert.ok(metrics.attempts[0].firstContentMs>=0);
  assert.ok(metrics.attempts[0].firstByteMs>=metrics.attempts[0].headersMs);
  assert.ok(metrics.attempts[0].firstContentMs>=metrics.attempts[0].firstByteMs);
  assert.doesNotMatch(JSON.stringify(metrics),/Bonjour|Hello|secret-test/);
});
test('fast mode selects a faster model and invalid primary resets partial output',async()=>{
  const {calls,lines}=await streamRequest({quality:'fast',replies:['{"translation":"unfinished','{"translation":"Hello","detectedLanguage":"fr-FR"}']});
  assert.equal(calls[0].model,'openai/gpt-5.4-mini');assert.equal(calls[1].model,'openai/gpt-5.6-sol');
  assert.ok(lines.some(x=>x.type==='reset'));assert.equal(lines.at(-1).result.translation,'Hello');
  const attempts=lines.at(-1).result.metrics.attempts;
  assert.equal(attempts.length,2);assert.equal(attempts[0].outcome,'error');assert.equal(attempts[1].outcome,'success');
});
test('both provider failures produce a visible stream error, not a silent success',async()=>{
  const {lines}=await streamRequest({replies:[new Error('unavailable'),new Error('unavailable')]});
  assert.equal(lines.at(-1).type,'error');assert.equal(lines.some(x=>x.type==='done'),false);
});
test('inherited object properties cannot be used as language codes',async()=>{
  const {res,calls}=await streamRequest({replies:[],sourceLanguage:'toString'});
  assert.equal(res.statusCode,400);assert.equal(calls.length,0);
});

const speechCode=readFileSync(new URL('../api/speak.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
test('natural voice keeps credentials server-side and returns audio bytes',async()=>{
  let options;
  const sandbox=vm.createContext({console,Buffer,process:{env:{AI_GATEWAY_API_KEY:'secret-test'}},AbortController,AbortSignal,
    createGateway:({apiKey})=>{assert.equal(apiKey,'secret-test');return {speech:model=>model}},
    generateSpeech:async args=>{options=args;return {audio:{uint8Array:new Uint8Array([1,2,3])}}}});
  vm.runInContext(speechCode,sandbox);
  const res={headers:{},on(){},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},send(body){this.body=body},json(body){this.body=body}};
  await sandbox.handler({method:'POST',headers:{},body:{text:'Bonjour'}},res);
  assert.equal(options.model,'openai/tts-1');assert.equal(options.text,'Bonjour');
  assert.equal(res.headers['Content-Type'],'audio/mpeg');assert.deepEqual([...res.body],[1,2,3]);
});

for(const quality of ['accurate','fast'])for(const sourceLanguage of ['fr-FR','auto']){
  test(`${quality}/${sourceLanguage}: wrong-language draft is reset and a valid English fallback is returned`,async()=>{
    const french='Il ne sera pas disponible avant lundi.';
    const {calls,lines}=await streamRequest({quality,sourceLanguage,text:french,replies:[
      ['{"translation":"Il ne sera ', 'pas disponible avant lundi.","detectedLanguage":"fr-FR"}'],
      '{"translation":"He will not be available until Monday.","detectedLanguage":"fr-FR"}'
    ]});
    assert.equal(calls.length,2);
    assert.equal(lines.at(-1).result.translation,'He will not be available until Monday.');
    assert.equal(lines.at(-1).result.targetLanguage,'en-US');
    const reset=lines.findIndex(e=>e.type==='reset');
    assert.ok(reset>0);
    assert.deepEqual(lines.slice(reset+1).filter(e=>e.type==='progress').map(e=>e.translation),['He will not be available until Monday.']);
    assert.equal(lines.at(-1).result.metrics.attempts[0].outcome,'error');
  });
}

test('two wrong-language responses fail visibly without displaying French',async()=>{
  const french='Je voudrais prendre rendez-vous demain matin.';
  const {lines}=await streamRequest({sourceLanguage:'fr-FR',text:french,replies:[1,2].map(()=>JSON.stringify({translation:french,detectedLanguage:'fr-FR'}))});
  assert.equal(lines.at(-1).type,'error');
  assert.equal(lines.some(e=>e.type==='done'),false);
  assert.doesNotMatch(JSON.stringify(lines),/Je voudrais/);
});

test('valid output in a third language is accepted and labeled with the requested target',async()=>{
  const {lines}=await streamRequest({sourceLanguage:'fr-FR',targetLanguage:'nl-NL',replies:[JSON.stringify({translation:'De vergadering is morgen om negen uur.',detectedLanguage:'fr-FR'})]});
  assert.equal(lines.at(-1).result.targetLanguage,'nl-NL');
  assert.equal(lines.at(-1).result.translation,'De vergadering is morgen om negen uur.');
});

test('first translated words reach the client while the provider is still producing the phrase',{timeout:2000},async()=>{
  const encoder=new TextEncoder();let release,resolveFirst,finished=false;
  const first=new Promise(resolve=>resolveFirst=resolve);
  const event=content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n';
  const body=new ReadableStream({start(controller){
    controller.enqueue(encoder.encode(event('{"translation":"Hello')));
    release=()=>{controller.enqueue(encoder.encode(event(', world","detectedLanguage":"fr-FR"}')+'data: [DONE]\n\n'));controller.close()};
  }});
  const handling=streamRequest({replies:[()=>new Response(body)],onEvent:e=>{
    if(e.type==='progress')resolveFirst(e.translation);
    if(e.type==='done')finished=true;
  }});
  try{assert.equal(await first,'Hello');assert.equal(finished,false)}finally{release()}
  const {lines}=await handling;
  assert.equal(lines.at(-1).result.translation,'Hello, world');
});
