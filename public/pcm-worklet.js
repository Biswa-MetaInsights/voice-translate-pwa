// Audio capture runs independently of rendering and UI work. 480 samples at
// 24 kHz is 20 ms, instead of the previous 4096-sample (~171 ms) buffer.
class PcmCapture extends AudioWorkletProcessor {
  constructor(){super();this.buffer=new Float32Array(480);this.offset=0}
  process(inputs){
    const input=inputs[0]?.[0];
    if(input)for(const sample of input){
      this.buffer[this.offset++]=sample;
      if(this.offset===this.buffer.length){
        this.port.postMessage(this.buffer,[this.buffer.buffer]);
        this.buffer=new Float32Array(480);this.offset=0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture',PcmCapture);
