import test from 'node:test';
import assert from 'node:assert/strict';
import { admitMobileRequest, mobileRpc } from '../../lib/mobile/controls.js';
import { createReportHandler } from '../../lib/mobile/report.js';
import { withMobileAccess, withMobileUpload } from '../../lib/mobile/access.js';
const env = { MOBILE_LIMIT_KEY:'test-key-not-a-real-secret-'.repeat(2) };
test('distributed admission rotates pseudonyms and never sends IP addresses or content', async () => {
  const calls = []; const rpc = async (...args) => { calls.push(args); return true; };
  for (const time of [60000,120000]) assert.equal(await admitMobileRequest({ 'x-vercel-forwarded-for':'192.0.2.1' },{ env,rpc,now:()=>time }), null);
  assert.notEqual(calls[0][1].p_fingerprint,calls[1][1].p_fingerprint);
  assert.match(calls[0][1].p_fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(calls).includes('192.0.2.1'),false);
});
test('admission fails closed without secrets/trusted ingress or on service failure', async () => {
  for (const [headers, options] of [ [{},{env}], [{'x-forwarded-for':'192.0.2.1'},{env}],
    [{'x-vercel-forwarded-for':'192.0.2.1'},{env:{}}],
    [{'x-vercel-forwarded-for':'192.0.2.1'},{env,rpc:async()=>{throw new Error('secret transcript token');}}],
    [{'x-vercel-forwarded-for':'192.0.2.1'},{env,rpc:async()=>({invalid:true})}] ]) {
    const result = await admitMobileRequest(headers,options); assert.equal(result.status,503); assert.doesNotMatch(JSON.stringify(result),/secret transcript/);
  }
});
test('rate exhaustion returns retry guidance without contacting speech providers',async()=>{
  assert.equal((await admitMobileRequest({'x-vercel-forwarded-for':'2001:db8::1'},{env,rpc:async()=>false})).status,429);
  let calls=0; const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;}};
  await withMobileAccess(()=>{calls++;},{MOBILE_API_ENABLED:'true'},{admit:async()=>({status:429,retry:'60',error:'busy'})})({method:'POST',headers:{origin:'https://localhost'}},res);
  assert.equal(res.code,429); assert.equal(res.headers['Retry-After'],'60'); assert.equal(calls,0);
  const upload=await withMobileUpload(()=>{calls++;},{MOBILE_API_ENABLED:'true'},{admit:async()=>({status:503,retry:'60',error:'busy'})})(new Request('https://test.example/upload',{method:'POST',headers:{origin:'https://localhost'}}));
  assert.equal(upload.status,503); assert.equal(calls,0);
});
test('control RPC forbids unsafe hosts/redirects and keeps service keys server-side',async()=>{
  let seen;
  const config={MOBILE_SUPABASE_URL:'https://testref.supabase.co',MOBILE_SUPABASE_SECRET_KEY:'sb_secret_test_only'};
  await mobileRpc('vt_mobile_report',{}, {env:config,fetchImpl:async(url,options)=>{seen={url,options};return Response.json('id');}});
  assert.equal(seen.options.redirect,'error'); assert.equal(seen.options.headers.Authorization,undefined); assert.equal(seen.options.headers.apikey,config.MOBILE_SUPABASE_SECRET_KEY);
  for(const url of ['http://testref.supabase.co','https://evil.example','https://testref.supabase.co@evil.example','https://testref.supabase.co/path']) await assert.rejects(mobileRpc('vt_mobile_report',{}, {env:{...config,MOBILE_SUPABASE_URL:url}}));
});
test('reports require explicit inclusion of user-entered text and never echo content',async()=>{
  let seen; const rpc=async(name,body)=>{seen=body;return '12345678-1234-1234-1234-123456789abc';};
  const res={status(n){this.code=n;return this;},json(body){this.body=body;}};
  const handler=createReportHandler({rpc});
  await handler({body:{category:'unsafe',feature:'voice-note',details:'private sample'}},res); assert.equal(res.code,400); assert.equal(seen,undefined);
  await handler({body:{category:'unsafe',feature:'voice-note',details:'private sample',includeDetails:true}},res);
  assert.equal(res.code,201); assert.equal(seen.p_details,'private sample'); assert.equal(JSON.stringify(res.body).includes('private sample'),false);
  await handler({body:{category:'other',feature:'speak'}},res); assert.equal(seen.p_details,'');
});
test('invalid/failed reports do not pretend to have been saved or expose upstream details',async()=>{
  const res={status(n){this.code=n;return this;},json(body){this.body=body;}};
  const handler=createReportHandler({rpc:async()=>{throw new Error('credential audio transcript');}});
  for(const body of [{category:'bad',feature:'speak'},{category:'other',feature:'speak',details:'x'.repeat(1001),includeDetails:true}]) {await handler({body},res);assert.equal(res.code,400);}
  await handler({body:{category:'other',feature:'speak'}},res); assert.equal(res.code,503); assert.doesNotMatch(JSON.stringify(res.body),/credential|audio|transcript/);
});
