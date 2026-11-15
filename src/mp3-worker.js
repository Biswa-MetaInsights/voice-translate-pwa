import {createMp3Encoder} from './mp3-encoder.js';
let encoder;
self.onmessage=({data:{id,type,sampleRate,samples}})=>{
  try{
    if(type==='init')encoder=createMp3Encoder(sampleRate);
    else if(type==='encode')encoder.add(samples);
    else if(type==='finish'){
      const parts=encoder.finish();
      self.postMessage({id,parts},parts.map(part=>part.buffer));return;
    }
    self.postMessage({id});
  }catch{self.postMessage({id,error:'Could not encode the conversation audio'});}
};
