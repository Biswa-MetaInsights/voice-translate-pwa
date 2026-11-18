export function shouldRecover({now,lastAudioAt,lastVoiceAt,voiceMs,lastTranscriptAt,startedAt,suspended,hidden}) {
  if(hidden)return false;
  if(now-startedAt<15_000)return false;
  if(suspended||now-lastAudioAt>8_000)return true;
  // A long pause followed by a new sentence isn't a stall. Count the actual
  // voiced audio since the last transcript, resetting across quiet gaps.
  return voiceMs>=6000&&now-lastVoiceAt<1500&&now-lastTranscriptAt>8000;
}
