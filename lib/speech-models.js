export const WHISPER_MODEL = 'openai/gpt-realtime-whisper';
export const LIVE_TRANSCRIBE_MODEL = 'openai/gpt-live-transcribe';

export function speechProviderOptions(code, model = WHISPER_MODEL) {
  const base = code === 'auto' ? null : code === 'yue-HK' ? 'yue'
    : code === 'fil-PH' ? 'tl' : code.split('-')[0];
  const live = model === LIVE_TRANSCRIBE_MODEL;
  const hint = base ? (live ? { languages: [base] } : { language: base }) : {};
  return { openai: { ...hint, streaming: { delay: 'low' } } };
}
