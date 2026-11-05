import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { readCompletionStream,translationPrefix } from '../lib/translation-stream.js';

const code=readFileSync(new URL('../api/translate.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
async function streamRequest({replies,context=[],quality='accurate',sourceLanguage='auto',targetLanguage='en-US'}){
  const calls=[],lines=[];
  const sandbox=vm.createContext({console,process:{env:{AI_GATEWAY_API_KEY:'test'}},AbortController,AbortSignal,readCompletionStream,translationPrefix,
    fetch:async(url,options)=>{
      calls.push(JSON.parse(options.body));const reply=replies.shift();
      if(reply instanceof Error)throw reply;
      const chunks=typeof reply==='string'?[reply]:reply;
      const sse=chunks.map(content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n').join('')+'data: [DONE]\n\n';
      return new Response(sse);
    }});
  vm.runInContext(code,sandbox);
  const res={statusCode:200,setHeader(){},flushHeaders(){},on(){},write(line){lines.push(JSON.parse(line))},end(){this.writableEnded=true},
    status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
  await sandbox.handler({method:'POST',headers:{},body:{text:'Bonjour',sourceLanguage,targetLanguage,context,quality,stream:true}},res);
  return {calls,lines,res};
}
test('streamed API emits readable progress before completion and caps context',async()=>{
  const {calls,lines,res}=await streamRequest({replies:[['{"translation":"Hel','lo","detectedLanguage":"fr-FR","needsReview":false}']],context:['ignored','a'.repeat(900),'b','c']});
  assert.equal(res.writableEnded,true);
  assert.equal(lines[0].type,'progress');assert.equal(lines[0].translation,'Hel');
  assert.equal(lines.at(-1).type,'done');assert.equal(lines.at(-1).result.translation,'Hello');
  assert.equal(calls[0].model,'openai/gpt-5.6-sol');
  const prior=JSON.parse(calls[0].messages[1].content).previousTranscript;
  assert.equal(prior.length,3);assert.equal(prior[0].length,600);
  assert.ok(lines.at(-1).result.metrics.totalMs>=0);
});
test('fast mode selects a faster model and invalid primary resets partial output',async()=>{
  const {calls,lines}=await streamRequest({quality:'fast',replies:['{"translation":"unfinished','{"translation":"Hello","detectedLanguage":"fr-FR"}']});
  assert.equal(calls[0].model,'openai/gpt-5.4-mini');assert.equal(calls[1].model,'openai/gpt-5.6-sol');
  assert.ok(lines.some(x=>x.type==='reset'));assert.equal(lines.at(-1).result.translation,'Hello');
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
