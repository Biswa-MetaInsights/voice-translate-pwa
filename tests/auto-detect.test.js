import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const backend=readFileSync(new URL('../api/translate.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/,'').replace('export default async function handler','async function handler');

async function request(sourceLanguage, replies, text='Bonjour', targetLanguage='en-US'){
  const calls=[];
  const context=vm.createContext({console,process:{env:{AI_GATEWAY_API_KEY:'test'}},AbortSignal,
    fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({choices:[{message:{content:replies.shift()}}]})}}});
  vm.runInContext(backend,context);
  const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
  await context.handler({method:'POST',headers:{'x-forwarded-for':'test'},body:{text,sourceLanguage,targetLanguage}},res);
  return {res,calls};
}

test('auto source returns translation and language in one model call',async()=>{
  const {res,calls}=await request('auto',['{"translation":"Hello","detectedLanguage":"fr-FR"}']);
  assert.equal(res.statusCode,200);assert.equal(res.body.translation,'Hello');
  assert.equal(res.body.detectedLanguage,'fr-FR');assert.equal(calls.length,1);
  assert.match(calls[0].messages[0].content,/Detect the source language/);
});
test('mixed languages and uncertain detection are accepted',async()=>{
  for(const detectedLanguage of ['mixed',null,'unsupported']){
    const {res}=await request('auto',[JSON.stringify({translation:'Hello',detectedLanguage})]);
    assert.equal(res.body.detectedLanguage,detectedLanguage==='unsupported'?null:detectedLanguage);
  }
});
test('malformed auto result retries the existing fallback',async()=>{
  const {res,calls}=await request('auto',['not JSON','{"translation":"Hello","detectedLanguage":"fr-FR"}']);
  assert.equal(res.statusCode,200);assert.equal(calls.length,2);
});
test('manual source keeps its plain-text response contract',async()=>{
  const {res,calls}=await request('fr-FR',['Hello']);
  assert.equal(res.body.translation,'Hello');assert.equal(res.body.detectedLanguage,undefined);
  assert.match(calls[0].messages[0].content,/Translate from French to English/);
});
test('auto is rejected as a target and same-language manual input skips the model',async()=>{
  const invalid=await request('fr-FR',[],'Bonjour','auto');assert.equal(invalid.res.statusCode,400);
  const same=await request('en-US',[],'Hello');assert.equal(same.res.body.translation,'Hello');assert.equal(same.calls.length,0);
});

test('input picker offers auto, output excludes it, and detection updates per phrase',()=>{
  const elements=new Map();
  const element=()=>({value:'',textContent:'',children:[],dataset:{},classList:{toggle(){},add(){},remove(){}},
    append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},
    setAttribute(){},removeAttribute(){},addEventListener(){},set innerHTML(value){this.children=[]},get innerHTML(){return ''}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},
    createElement:element,querySelectorAll:()=>[],documentElement:{dataset:{}}};
  document.getElementById('inputLang').value='auto';document.getElementById('outputLang').value='en-US';
  const context=vm.createContext({document,navigator:{onLine:true,mediaDevices:{}},window:{addEventListener(){}},
    localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,console});
  const frontend=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  vm.runInContext(frontend,context);
  vm.runInContext("pickerTarget='input';renderLanguagePicker('auto')",context);
  assert.equal(document.getElementById('languageResults').children.length,2);
  vm.runInContext("pickerTarget='output';renderLanguagePicker('auto')",context);
  assert.equal(document.getElementById('languageResults').children.length,1);
  assert.equal(document.getElementById('swap').disabled,true);
  vm.runInContext("showDetectedLanguage('fr-FR')",context);
  assert.equal(document.getElementById('detectedLanguage').textContent,'Detected: French');
  vm.runInContext("showDetectedLanguage('nl-NL')",context);
  assert.equal(document.getElementById('detectedLanguage').textContent,'Detected: Dutch');
  assert.equal(vm.runInContext('startBrowserFallback()',context),false);
});
