import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readCompletionStream} from '../lib/translation-stream.js';
import {requestTranslation} from '../src/translation-client.js';
import {measure,measureFetch,safeMetrics,summarize} from '../scripts/benchmark-lib.mjs';

function openStream(text,onCancel){
  return new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(text));},cancel:onCancel});
}
test('provider DONE finishes and cancels without waiting for transport EOF',{timeout:1000},async()=>{
  let cancelled=false;
  const body=openStream('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',()=>{cancelled=true;});
  assert.equal(await readCompletionStream(body,()=>{}),'Hello');assert.equal(cancelled,true);
});
test('client done commits and cancels without waiting for transport EOF',{timeout:1000},async()=>{
  let cancelled=false;
  const result=await requestTranslation({}, {fetchImpl:async()=>new Response(openStream(
    '{"type":"start","metrics":{"authMs":0}}\n{"type":"progress","translation":"Hello"}\n{"type":"done","result":{"translation":"Hello"}}\n',()=>{cancelled=true;}),
    {headers:{'Content-Type':'application/x-ndjson'}})});
  assert.equal(result.translation,'Hello');assert.equal(cancelled,true);
});
test('benchmark records stages without source, translation, error text or secrets',{timeout:5000},async()=>{
  const server=createServer((req,res)=>{
    req.resume();
    res.setHeader('Content-Type','application/x-ndjson');
    res.write('{"type":"start","metrics":{"handlerSetupMs":1}}\n');
    setTimeout(()=>{
      res.write('{"type":"progress","translation":"SECRET_CONTENT"}\n');
      res.end('{"type":"done","result":{"translation":"SECRET_CONTENT","metrics":{"firstTokenMs":2,"totalMs":3,"credential":"SECRET_KEY","attempts":[{"headersMs":1,"outcome":"success"}]}}}\n');
    },25);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/api/translate`;
    const row=await measure(url,{text:'PRIVATE_SOURCE'});
    const pooled=await measureFetch(url,{text:'PRIVATE_SOURCE'});
    assert.equal(pooled.ok,true);assert.equal(pooled.connection,null);
    assert.doesNotMatch(JSON.stringify(pooled),/SECRET|PRIVATE/);
    assert.equal(row.ok,true);
    assert.ok(row.firstBodyMs<=row.firstTextMs);assert.ok(row.firstTextMs<=row.doneMs);
    assert.equal(row.connection.connects,1);assert.equal(row.connection.status,200);
    assert.equal(row.server.attempts[0].outcome,'success');
    assert.doesNotMatch(JSON.stringify(row),/SECRET|PRIVATE/);
    assert.equal(summarize([row]).successes,1);
    assert.equal(safeMetrics({authMs:4,token:'SECRET'}).authMs,4);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
