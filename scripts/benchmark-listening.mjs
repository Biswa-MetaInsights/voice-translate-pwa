import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { LIVE_TRANSCRIBE_MODEL, WHISPER_MODEL, speechProviderOptions } from '../lib/speech-models.js';

const [audioPath, referencePath, language = 'auto'] = process.argv.slice(2);
const tokenEndpoint = process.env.TRANSCRIPTION_TOKEN_URL;
if (!audioPath || !referencePath || !tokenEndpoint) {
  throw new Error('Set TRANSCRIPTION_TOKEN_URL to the preview token endpoint and pass a 24 kHz mono PCM16LE file, reference text file and optional source language.');
}
const pcm = await readFile(audioPath);
const reference = tokenize(await readFile(referencePath, 'utf8'));
if (!reference.length || !pcm.length || pcm.length > 60 * 48_000 || pcm.length % 2) {
  throw new Error('Use a nonempty reference and up to 60 seconds of raw PCM.');
}

function tokenize(text) {
  const segmenter = new Intl.Segmenter(language === 'auto' ? undefined : language, { granularity: 'word' });
  return [...segmenter.segment(text.normalize('NFC').toLowerCase())]
    .filter(item => item.isWordLike).map(item => item.segment);
}

function wordErrors(expected, actual) {
  let row = Array.from({ length: actual.length + 1 }, (_, index) => ({ errors: index, missing: 0 }));
  for (const [index, word] of expected.entries()) {
    const next = [{ errors: index + 1, missing: index + 1 }];
    for (const [j, recognized] of actual.entries()) {
      const replace = { ...row[j], errors: row[j].errors + Number(recognized !== word) };
      const omit = { errors: row[j + 1].errors + 1, missing: row[j + 1].missing + 1 };
      const insert = { ...next[j], errors: next[j].errors + 1 };
      next.push([replace, omit, insert].sort((a, b) => a.errors - b.errors || a.missing - b.missing)[0]);
    }
    row = next;
  }
  return row.at(-1);
}

async function measure(model) {
  const signal = AbortSignal.timeout(95_000);
  const url = new URL(tokenEndpoint);
  if (model === WHISPER_MODEL) url.searchParams.set('model', 'whisper');
  else url.searchParams.delete('model');
  const started = performance.now();
  const response = await fetch(url, { method: 'POST', signal, redirect: 'error' });
  if (!response.ok) throw new Error('Token endpoint HTTP ' + response.status);
  const { token, model: selected } = await response.json();
  if (!token || selected !== model) throw new Error('Token endpoint did not select the requested model');
  const tokenMs = Math.round(performance.now() - started);
  let offset = 0;
  let firstTextMs;
  let firstAudioAt;
  const audio = new ReadableStream({
    async pull(controller) {
      if (offset === pcm.length) {
        controller.close();
        return;
      }
      firstAudioAt ??= performance.now();
      await wait(Math.max(0, offset / 48 + firstAudioAt - performance.now()), undefined, { signal });
      controller.enqueue(pcm.subarray(offset, offset + 960));
      offset = Math.min(offset + 960, pcm.length);
    },
  }, { highWaterMark: 0 });
  const gateway = createGateway({ apiKey: token });
  const result = streamTranscribe({
    model: gateway.transcriptionModel(model),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24_000 },
    providerOptions: speechProviderOptions(language, model),
    abortSignal: signal,
  });
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw new Error('Transcription stream failed');
    if ((part.text || part.delta)?.trim()) firstTextMs ??= Math.round(performance.now() - started);
  }
  const actual = tokenize(await result.text);
  const { errors, missing } = wordErrors(reference, actual);
  return { model, tokenMs, firstTextMs, wordErrorRate: errors / reference.length, missingWords: missing, referenceWords: reference.length };
}

for (const model of [WHISPER_MODEL, LIVE_TRANSCRIBE_MODEL]) {
  try {
    console.log(JSON.stringify(await measure(model)));
  } catch (error) {
    console.error(JSON.stringify({ model, error: error.message.startsWith('Token endpoint') ? error.message : 'Benchmark request failed' }));
    process.exitCode = 1;
  }
}
