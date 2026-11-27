// Creates a separately deployable backend. Never deploy the web project's root
// just to enable mobile: original web API routes would bypass mobile admission.
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const out=resolve(root,'mobile/backend-dist');
await rm(out,{recursive:true,force:true}); await mkdir(out,{recursive:true});
await cp(resolve(root,'lib'),resolve(out,'lib'),{recursive:true});
await mkdir(resolve(out,'services'));
for(const name of ['translate','transcription-token','speak','conversation-summary']) await cp(resolve(root,`api/${name}.js`),resolve(out,`services/${name}.js`));
await cp(resolve(root,'api/mobile'),resolve(out,'api/mobile'),{recursive:true});
for(const name of await readdir(resolve(out,'api/mobile/v1'))) {
  const path=resolve(out,'api/mobile/v1',name);
  let text=await readFile(path,'utf8');
  for(const service of ['translate','transcription-token','speak','conversation-summary']) text=text.replace(`'../../${service}.js'`,`'../../../services/${service}.js'`);
  await writeFile(path,text);
}
const pkg=JSON.parse(await readFile(resolve(root,'package.json')));pkg.scripts={};
await writeFile(resolve(out,'package.json'),JSON.stringify(pkg,null,2)+'\n');
await cp(resolve(root,'mobile/locks/shared-package-lock.json'),resolve(out,'package-lock.json'));
await mkdir(resolve(out,'public'));
await cp(resolve(root,'mobile/dist/privacy.html'),resolve(out,'public/privacy.html'));
await writeFile(resolve(out,'vercel.json'),JSON.stringify({version:2,buildCommand:'',outputDirectory:'public',functions:{'api/mobile/v1/transcribe-audio.js':{maxDuration:45}}},null,2)+'\n');
console.log('Prepared mobile/backend-dist. No deployment performed. Only versioned mobile API routes are exposed.');
