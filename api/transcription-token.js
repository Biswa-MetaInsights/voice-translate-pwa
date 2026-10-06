import { gateway } from '@ai-sdk/gateway';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, url } = await gateway.experimental_transcription.getToken({
      model: 'openai/gpt-realtime-whisper',
    });

    return res.status(200).json({ token, url });
  } catch (error) {
    console.error('Failed to create transcription token:', error);
    return res.status(500).json({
      error: 'Could not start realtime transcription',
      detail: String(error?.message || error).slice(0, 300),
    });
  }
}
