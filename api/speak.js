import { generateSpeech } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { getVercelOidcToken } from '@vercel/oidc';

const buckets=new Map();
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
  const text=typeof req.body?.text==='string'?req.body.text.trim():'';
  if(!text||text.length>3000)return res.status(400).json({error:'Provide between 1 and 3000 characters'});
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
  const now=Date.now();
  for(const [key,bucket] of buckets)if(now-bucket.start>60_000)buckets.delete(key);
  const bucket=buckets.get(ip)||{start:now,count:0};buckets.set(ip,bucket);
  if(++bucket.count>40)return res.status(429).json({error:'Voice is busy. Please wait a moment.'});
  const controller=new AbortController();
  res.on?.('close',()=>{if(!res.writableEnded)controller.abort()});
  try{
    const apiKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||await getVercelOidcToken({
      project:'prj_RCmmAHDK2I3nIzx2ah6QzHpYQkOT',team:'team_jCrTWcpxHy5Bdmnr30kl9Bp4'
    });
    if(!apiKey)return res.status(503).json({error:'Natural voice is temporarily unavailable'});
    const gateway=createGateway({apiKey});
    const result=await generateSpeech({model:gateway.speech('openai/tts-1'),text,voice:'alloy',outputFormat:'mp3',maxRetries:0,
      abortSignal:AbortSignal.any([controller.signal,AbortSignal.timeout(10_000)])});
    res.setHeader('Content-Type','audio/mpeg');
    res.setHeader('X-Content-Type-Options','nosniff');
    return res.status(200).send(Buffer.from(result.audio.uint8Array));
  }catch(error){
    console.error('Speech playback unavailable',error?.name||'Error');
    if(!res.destroyed)return res.status(502).json({error:'Natural voice is unavailable. Try a device voice.'});
  }
}
