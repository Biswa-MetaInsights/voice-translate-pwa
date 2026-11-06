import { spawn } from 'node:child_process';

// Explicit allowlist: never persist headers, credentials, source or translated text.
export function safeMetrics(m) {
  if (!m) return null;
  const numbers = ['moduleAgeMs','handlerSetupMs','authMs','firstTokenMs','totalMs','offsetMs','headersMs','httpStatus','firstContentMs','firstByteMs'];
  const out = {};
  for (const key of numbers) if (Number.isFinite(m[key])) out[key] = m[key];
  if (typeof m.firstInvocation === 'boolean') out.firstInvocation = m.firstInvocation;
  if (['success','error','timeout','cancelled'].includes(m.outcome)) out.outcome = m.outcome;
  if (Array.isArray(m.attempts)) out.attempts = m.attempts.map(safeMetrics);
  return out;
}

export async function measure(url, payload) {
  const started = performance.now();
  const row = { headersMs:null, firstBodyMs:null, streamStartMs:null, firstTextMs:null, finalAttemptFirstTextMs:null, doneMs:null, resets:0 };
  // A fresh curl process deliberately measures a new connection every time.
  // curl honors this environment's proxy; timings describe that route, not direct browser TLS.
  const format = JSON.stringify(Object.fromEntries(['time_namelookup','time_connect','time_appconnect','time_pretransfer','time_starttransfer','time_total','num_connects','num_redirects','http_code'].map(k=>[k,`%{${k}}`])));
  const child = spawn('curl',['--silent','--show-error','--no-buffer','--max-time','30',
    '--request','POST','--header','Content-Type: application/json','--data-binary','@-',
    '--write-out',`%{stderr}\nVT_TIMING:${format}\n`,url],{stdio:['pipe','pipe','pipe']});
  let buffer='', stderr='',result=false, parseError=false, errorMetrics;
  const now=()=>Math.round((performance.now()-started)*100)/100;
  const accept=line=>{
    if (!line.trim()) return;
    try {
      const event=JSON.parse(line);
      if(event.type==='start') { row.streamStartMs=now(); row.startMetrics=safeMetrics(event.metrics); }
      if(event.type==='reset') { row.resets++;row.finalAttemptFirstTextMs=null; }
      if(event.type==='progress' && event.translation) {
        row.firstTextMs ??= now(); row.finalAttemptFirstTextMs ??= now();
      }
      if(event.type==='done') { row.doneMs=now();row.server=safeMetrics(event.result?.metrics);result=true; }
      if(event.type==='error') { parseError=true;errorMetrics=safeMetrics(event.metrics); }
      if(event.translation && !event.type) { result=true;row.server=safeMetrics(event.metrics); }
    } catch { parseError=true; }
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    row.firstBodyMs ??=now();buffer+=chunk;
    let newline;while((newline=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}
  });
  child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{stderr+=chunk;});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({...payload,stream:true}));
  await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{row.exitCode=code;resolve();});});
  accept(buffer);
  const timing=stderr.split('\n').find(line=>line.startsWith('VT_TIMING:'));
  if(timing){
    const t=JSON.parse(timing.slice(10)),ms=key=>Math.round(Number(t[key])*100000)/100;
    const diff=(a,b)=>Math.round((ms(a)-ms(b))*100)/100;
    row.connection={dnsMs:ms('time_namelookup'),tcpMs:diff('time_connect','time_namelookup'),
      tlsAndProxyMs:ms('time_appconnect')?diff('time_appconnect','time_connect'):null,
      readyMs:ms('time_pretransfer'),ttfbMs:ms('time_starttransfer'),totalMs:ms('time_total'),
      connects:Number(t.num_connects),redirects:Number(t.num_redirects),status:Number(t.http_code)};
    row.headersMs=row.connection.ttfbMs;
  }
  row.clientTotalMs=now();row.ok=!!(result&&!parseError&&row.exitCode===0&&row.connection?.status===200);
  if(errorMetrics)row.server=errorMetrics;
  if(row.server?.totalMs!=null&&row.connection)row.outsideHandlerMs=Math.round((row.connection.totalMs-row.server.totalMs)*100)/100;
  return row;
}

export function summarize(rows) {
  const values=rows.filter(r=>r.ok&&r.firstTextMs!=null).map(r=>r.firstTextMs).sort((a,b)=>a-b);
  const quantile=q=>values.length?values[Math.ceil(q*values.length)-1]:null;
  return {count:rows.length,successes:rows.filter(r=>r.ok).length,firstTextP50Ms:quantile(.5),firstTextP95Ms:quantile(.95)};
}

// Reused native fetch pool mirrors the old benchmark; connection sub-stages are
// intentionally unavailable here. Use fresh curl mode to resolve those stages.
export async function measureFetch(url,payload) {
  const started=performance.now(),now=()=>Math.round((performance.now()-started)*100)/100;
  const row={headersMs:null,firstBodyMs:null,firstTextMs:null,finalAttemptFirstTextMs:null,streamStartMs:null,doneMs:null,resets:0,connection:null};
  let result=false,failed=false;
  try{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,stream:true}),signal:AbortSignal.timeout(30_000)});
    row.headersMs=now();row.status=response.status;
    if(!response.ok)throw new Error('HTTP failure');
    const accept=line=>{
      if(!line.trim())return;
      const e=JSON.parse(line);
      if(e.type==='start'){row.streamStartMs=now();row.startMetrics=safeMetrics(e.metrics);}
      if(e.type==='reset'){row.resets++;row.finalAttemptFirstTextMs=null;}
      if(e.type==='progress'&&e.translation){row.firstTextMs??=now();row.finalAttemptFirstTextMs??=now();}
      if(e.type==='done'){row.doneMs=now();row.server=safeMetrics(e.result?.metrics);result=true;}
      if(e.type==='error'){row.server=safeMetrics(e.metrics);failed=true;}
      if(e.translation&&!e.type){result=true;row.server=safeMetrics(e.metrics);}
    };
    let buffer='';const decoder=new TextDecoder();
    for await(const chunk of response.body){
      row.firstBodyMs??=now();buffer+=decoder.decode(chunk,{stream:true});let newline;
      while((newline=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}
    }
    buffer+=decoder.decode();accept(buffer);
  }catch{failed=true;}
  row.clientTotalMs=now();row.ok=result&&!failed;
  if(row.server?.totalMs!=null)row.outsideHandlerMs=Math.round((row.clientTotalMs-row.server.totalMs)*100)/100;
  return row;
}
