import {Mp3Encoder} from '@breezystack/lamejs';

// One encoder for the whole conversation gives a single continuous MP3 stream.
export function createMp3Encoder(sampleRate){
  const encoder=new Mp3Encoder(1,sampleRate,128),parts=[];
  return {
    add(samples){
      const pcm=new Int16Array(samples.length);
      for(let i=0;i<samples.length;i++){
        const value=Math.max(-1,Math.min(1,samples[i]));
        pcm[i]=value<0?value*0x8000:value*0x7fff;
      }
      for(let i=0;i<pcm.length;i+=1152){
        const bytes=encoder.encodeBuffer(pcm.subarray(i,i+1152));
        if(bytes.length)parts.push(new Uint8Array(bytes));
      }
    },
    finish(){const bytes=encoder.flush();if(bytes.length)parts.push(new Uint8Array(bytes));return parts;}
  };
}
