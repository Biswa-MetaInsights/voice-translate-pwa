import { createGateway } from '@ai-sdk/gateway';
import { getVercelOidcToken } from '@vercel/oidc';
import { transcribe } from 'ai';
export async function transcribeVoiceNote(audio, { sourceLanguage, signal, env = process.env } = {}) {
  const apiKey = env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || await getVercelOidcToken({
    project: 'prj_RCmmAHDK2I3nIzx2ah6QzHpYQkOT', team: 'team_jCrTWcpxHy5Bdmnr30kl9Bp4',
  });
  if (!apiKey) throw new Error('speech_not_configured');
  const gateway = createGateway({ apiKey });
  const result = await transcribe({ model: gateway.transcription(env.VOICE_NOTE_TRANSCRIPTION_MODEL || 'openai/whisper-1'), audio,
    providerOptions: sourceLanguage === 'auto' ? {} : { openai: { language: sourceLanguage.split('-')[0] } },
    maxRetries: 0, abortSignal: signal,
  });
  if (result.durationInSeconds > 300) throw new Error('voice_note_too_long');
  return { text: result.text, language: result.language || null };
}
