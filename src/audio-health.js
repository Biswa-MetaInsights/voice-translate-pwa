export function shouldRecover({now,lastAudioAt,lastVoiceAt,lastTranscriptAt,startedAt,suspended,hidden}) {
  if(hidden)return false;
  if(now-startedAt<15_000)return false;
  if(suspended||now-lastAudioAt>8_000)return true;
  // Silence alone is healthy. Only suspect a recognition stall after recent
  // microphone activity and a sustained lack of transcript updates.
  return lastVoiceAt>lastTranscriptAt&&now-lastVoiceAt<3_000&&now-lastTranscriptAt>18_000;
}

export function speechProviderOptions(code) {
  const base=code==='auto'?null:code==='yue-HK'?'yue':code==='fil-PH'?'tl':code.split('-')[0];
  return {openai:{...(base?{language:base}:{}),streaming:{delay:'low'}}};
}
