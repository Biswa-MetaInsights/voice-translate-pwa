import { detectAll } from 'tinyld/light';

const distinctScripts = [
  ['ml', /\p{Script=Malayalam}/gu],
  ['ta', /\p{Script=Tamil}/gu],
  ['te', /\p{Script=Telugu}/gu],
  ['kn', /\p{Script=Kannada}/gu],
];

// A preliminary UI hint only. The translation service still confirms the
// language independently and can report mixed or uncertain speech.
export function guessSourceLanguage(text, languages) {
  const sample = text.slice(-180);
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 6) return null;
  for (const [code, script] of distinctScripts) {
    if ((sample.match(script)?.length ?? 0) >= letters * 0.8) {
      return languages.find(language => language.code.startsWith(code + '-'))?.code ?? null;
    }
  }
  if (letters < 14 || (sample.match(/\p{L}+/gu)?.length ?? 0) < 3) return null;
  const [best, next] = detectAll(sample);
  if (!best || best.accuracy < 0.35 || best.accuracy - (next?.accuracy ?? 0) < 0.2) return null;
  const matches = languages.filter(language => language.code.startsWith(best.lang + '-'));
  return matches.length === 1 ? matches[0].code : null;
}
