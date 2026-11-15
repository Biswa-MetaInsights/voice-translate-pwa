import { detectAll, supportedLanguages, toISO2 } from 'tinyld/heavy';
import { franc } from 'franc-min';

const supported = new Set(supportedLanguages.map(toISO2));
const baseLanguage = code => code?.split('-')[0] === 'fil' ? 'tl' : code?.split('-')[0];
const words = text => text.match(/\p{L}+/gu) || [];

// This is a conservative rejection check, not a guarantee of language or
// meaning. Short names, numbers and ambiguous/shared words must remain usable.
export function assertTranslationLanguage(translation, {text, sourceLanguage, targetLanguage}) {
  const target = baseLanguage(targetLanguage), source = baseLanguage(sourceLanguage);
  if (!supported.has(target)) return;
  const copied = translation.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    === text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const segments = [translation, ...translation.split(/(?<=[.!?。！？])\s+|\n+/u)];
  for (const segment of new Set(segments)) {
    const count = words(segment).length;
    if (!count) continue;
    const [best, second] = detectAll(segment);
    if (!best || best.lang === target) continue;
    // Names and loanwords can dominate one detector. Treat disagreement from
    // an independent detector as uncertainty rather than rejecting valid text.
    if (count >= 3 && toISO2(franc(segment, {minLength:12})) === target) continue;
    const margin = best.accuracy - (second?.accuracy || 0);
    const clearSentence = count >= 3 && best.accuracy >= 0.1 && margin >= 0.05;
    const clearShortPhrase = best.accuracy >= 0.5 && margin >= 0.3;
    const copiedSource = copied && source !== target && best.lang === source
      && best.accuracy >= 0.1 && margin >= 0.05;
    if (clearSentence || clearShortPhrase || copiedSource) {
      const error = new Error('Translation did not use the requested output language');
      error.name = 'TranslationLanguageError';
      throw error;
    }
  }
}
