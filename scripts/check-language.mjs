// Synthetic regression samples only. No microphone or private user data.
// Usage: node scripts/check-language.mjs https://www.voicetranslator.eu
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {assertTranslationLanguage} from '../lib/translation-language.js';
const base=new URL(process.argv[2]);
if(!['https:','http:'].includes(base.protocol)||base.username||base.password||base.search)throw Error('Expected an HTTP(S) origin');
const samples=JSON.parse(readFileSync(new URL('../tests/language-cases.json',import.meta.url),'utf8'));
const jobs=samples.flatMap(sample=>['fr-FR','auto'].flatMap(sourceLanguage=>['accurate','fast'].map(quality=>({
  ...sample,sourceLanguage,targetLanguage:'en-US',quality,context:['Nous discutons du projet en français.']
}))));
jobs.push(
 {id:'wrong-source-label',sourceLanguage:'en-US',targetLanguage:'en-US',text:'Le rendez-vous est demain matin.',expect:['appointment','tomorrow morning']},
 {id:'english-preserved',sourceLanguage:'en-US',targetLanguage:'en-US',text:'The appointment is tomorrow morning.',expect:['appointment','tomorrow morning']},
 {id:'names',sourceLanguage:'fr-FR',targetLanguage:'en-US',text:'Le rendez-vous avec Jean Dupont est à Paris.',expect:['Jean Dupont','Paris']},
 {id:'accented-names',sourceLanguage:'fr-FR',targetLanguage:'en-US',text:'Je m’appelle François et j’habite à Leuven.',expect:['François','Leuven']},
 {id:'numbers',sourceLanguage:'fr-FR',targetLanguage:'en-US',text:'La réunion est reportée au 12 novembre à 15 h 30.',expect:['12','November','15:30|3:30']},
 {id:'english-to-french',sourceLanguage:'en-US',targetLanguage:'fr-FR',text:'The meeting is tomorrow morning at nine.',expect:['réunion','demain','neuf|9']},
 {id:'french-to-dutch',sourceLanguage:'fr-FR',targetLanguage:'nl-NL',text:'La réunion est demain matin à neuf heures.',expect:['vergadering','morgen','negen|9']},
 {id:'german-to-english',sourceLanguage:'de-DE',targetLanguage:'en-US',text:'Es sind nicht fünfzehn, sondern fünfzig Euro.',expect:['not','fifteen|15','fifty|50']},
 {id:'dutch-to-english',sourceLanguage:'nl-NL',targetLanguage:'en-US',text:'Ik kom niet vandaag, maar morgen om half drie.',expect:['not|won.t','today','tomorrow','2:30|half past two|two.thirty']}
);
async function run(job){
 const started=performance.now();
 const {id,expect,...payload}=job;
 const child=spawn('curl',['--silent','--show-error','--location','--no-buffer','--max-time','35','--request','POST','--header','Content-Type: application/json','--data-binary','@-',new URL('/api/translate',base).href],{stdio:['pipe','pipe','pipe']});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({...payload,stream:true}));
 let body='',buffer='',firstTextMs=null,firstTextLength=0,doneMs=null;
 child.stdout.setEncoding('utf8');child.stdout.on('data',c=>{
   body+=c;buffer+=c;let newline;
   while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);try{
     const event=JSON.parse(line);
     if(event.type==='progress'&&event.translation&&firstTextMs===null){firstTextMs=Math.round(performance.now()-started);firstTextLength=event.translation.length;}
     if(event.type==='done')doneMs=Math.round(performance.now()-started);
   }catch{}}
 });child.stderr.resume();
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});
 let status='pass',detail='',result,events=[];
 try{
  if(code!==0)throw Error('Transport failed');
  events=body.trim().split('\n').map(JSON.parse);
  result=events.find(e=>e.type==='done')?.result;
  if(!result||events.some(e=>e.type==='error'))throw Error('API did not finish successfully');
  if(result.targetLanguage!==job.targetLanguage)throw Error('Target metadata mismatch');
  for(const e of events.filter(e=>e.type==='progress'))if(e.targetLanguage!==job.targetLanguage)throw Error('Streaming target metadata mismatch');
  assertTranslationLanguage(result.translation,payload);
  for(const pattern of expect)if(!new RegExp(pattern,'iu').test(result.translation))throw Error('Meaning check failed: '+pattern);
  if(job.id==='unfinished'&&result.translation.trim().toLowerCase()!=='if you could send me the')throw Error('Unfinished thought was completed');
 }catch(e){status='fail';detail=e.message;}
 return {id,source:job.sourceLanguage,target:job.targetLanguage,quality:job.quality||'accurate',status,detail,ms:Math.round(performance.now()-started),attempts:result?.metrics?.attempts?.length,firstTextMs,doneMs,incremental:Boolean(result&&firstTextLength<result.translation.length)};
}
const results=[];let next=0;
await Promise.all(Array.from({length:4},async()=>{while(next<jobs.length){const result=await run(jobs[next++]);results.push(result);console.log(JSON.stringify(result));}}));
const failures=results.filter(x=>x.status==='fail');
console.log(JSON.stringify({summary:true,cases:results.length,passed:results.length-failures.length,failed:failures.length,incremental:results.filter(x=>x.incremental).length,microphoneIncluded:false}));
if(failures.length)process.exitCode=1;
