import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const script=readFileSync(new URL('../public/voice-note-share.js',import.meta.url),'utf8');
function worker() {
  const listeners={}, timers=[], self={location:{origin:'https://voicetranslator.eu'},addEventListener:(k,v)=>listeners[k]=v};
  vm.runInNewContext(script,{self,URL,Response,Request,Blob,File,FormData,Date,crypto:webcrypto,setTimeout:fn=>timers.push(fn)});
  return {self,listeners,timers};
}
function post(files=[new File([Buffer.alloc(100)],'Arabic.opus',{type:'audio/ogg'})]) {
  const f=new FormData();for(const file of files)f.append('audio',file);
  return new Request('https://voicetranslator.eu/voice-note.html',{method:'POST',body:f});
}
function claim(w,token,source='https://voicetranslator.eu/voice-note.html') {
  let result;w.listeners.message({data:{type:'voice-note-share',token},source:{url:source},ports:[{postMessage:value=>result=value}]});return result;
}
test('share target hands one file to the receiving page once, without a network upload',async()=>{
  const w=worker(),r=await w.self.receiveVoiceNoteShare(post());assert.equal(r.status,303);
  const u=new URL(r.headers.get('location')),token=new URLSearchParams(u.hash.slice(1)).get('share');assert.ok(token);
  assert.equal(claim(w,token,'https://evil.example/voice-note.html'),undefined);
  assert.equal(claim(w,token).file.name,'Arabic.opus');assert.equal(claim(w,token).error,'expired');
});
test('expired and invalid shares use the saved-file fallback',async()=>{
  const w=worker(),r=await w.self.receiveVoiceNoteShare(post());const token=new URLSearchParams(new URL(r.headers.get('location')).hash.slice(1)).get('share');
  w.timers[0]();assert.equal(claim(w,token).error,'expired');
  const multi=await w.self.receiveVoiceNoteShare(post([new File(['a'],'one'),new File(['b'],'two')]));assert.match(multi.headers.get('location'),/share-error=invalid/);
  const bad=await w.self.receiveVoiceNoteShare(new Request('https://voicetranslator.eu/voice-note.html',{method:'POST',body:'not audio'}));assert.match(bad.headers.get('location'),/share-error=invalid/);
});
test('share handoff has a strict byte limit and bounded queue',async()=>{
  const w=worker();const huge=await w.self.receiveVoiceNoteShare(post([new File([new Uint8Array(4_000_001)],'too-big.opus')]));assert.match(huge.headers.get('location'),/share-error/);
  const tokens=[];for(let i=0;i<4;i++){const r=await w.self.receiveVoiceNoteShare(post());tokens.push(new URLSearchParams(new URL(r.headers.get('location')).hash.slice(1)).get('share'));}
  assert.equal(claim(w,tokens[0]).error,'expired');assert.ok(claim(w,tokens[3]).file);
});
test('service worker removes sharing tokens before static-page fetch and caching, while leaving API requests alone',async()=>{
  const root=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),listeners={},seen=[],cached=[];
  const self={location:{origin:'https://voicetranslator.eu'},addEventListener:(k,v)=>listeners[k]=v,skipWaiting(){},clients:{claim(){}}};
  vm.runInNewContext(root,{self,Request,URL,Response,importScripts(){},fetch:async request=>{seen.push(request.url);return new Response('static page');},caches:{open:async()=>({put:async(request)=>cached.push(request.url)})}});
  let result;listeners.fetch({request:new Request('https://voicetranslator.eu/voice-note.html#share=PRIVATE'),respondWith:r=>result=r});
  await result;await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(seen,['https://voicetranslator.eu/voice-note.html']);assert.deepEqual(cached,seen);
  let intercepted=false;listeners.fetch({request:new Request('https://voicetranslator.eu/api/translate'),respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
