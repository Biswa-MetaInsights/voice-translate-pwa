import { OrderedTranslationQueue, requestTranslation, splitPhrases } from './translation-client.js';

export function setupTwoPersonConversation({ document, languages, status, capture, finishCapture, play, stopVoice, setCaptureActive }) {
  const controls = document.getElementById('conversationControls');
  const setup = document.getElementById('conversationSetup');
  const history = document.getElementById('turnHistory');
  const start = document.getElementById('beginConversation');
  const end = document.getElementById('endConversation');
  const autoplay = document.getElementById('conversationAutoplay');
  const selectors = ['personOneLanguage', 'personTwoLanguage'].map(id => document.getElementById(id));
  const speakers = ['personOneTurn', 'personTwoTurn'].map(id => document.getElementById(id));
  const languagesByCode = new Map(languages.map(language => [language.code, language]));

  selectors.forEach((select, person) => {
    for (const language of languages) {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = language.flag + ' ' + language.name;
      select.append(option);
    }
    select.value = person === 0 ? 'en-US' : 'ar-AE';
    select.onchange = validatePair;
  });

  let session = null;
  let active = null;
  let finishing = false;
  const turns = [];

  function validatePair() {
    const same = selectors[0].value === selectors[1].value;
    start.disabled = same;
    status.textContent = same ? 'Choose a different language for each person.' : 'Choose each person’s language, then start.';
  }

  function updateControls() {
    setup.hidden = Boolean(session);
    controls.hidden = !session;
    end.disabled = Boolean(active);
    setCaptureActive(Boolean(active));
    if (session) speakers.forEach((button, person) => {
      const selected = active?.person === person;
      button.disabled = finishing || Boolean(active && !selected);
      button.setAttribute('aria-pressed', String(selected));
      const language = session[person];
      button.textContent = selected ? (finishing ? 'Finishing…' : 'Finish speaking')
        : language.flag + ' Person ' + (person + 1) + ' · ' + language.name;
    });
    for (const turn of turns) {
      turn.replay.disabled = Boolean(active);
      turn.retry.disabled = Boolean(active);
    }
  }

  function addLine(item, lang, className = '') {
    const line = document.createElement('p');
    if (className) line.className = className;
    if (lang) {
      line.setAttribute('lang', lang);
      line.setAttribute('dir', 'auto');
    }
    item.append(line);
    return line;
  }

  function addAction(item, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = label;
    button.onclick = action;
    item.append(button);
    return button;
  }

  function newTurn(person) {
    const source = session[person];
    const target = session[1 - person];
    const item = document.createElement('li');
    item.className = 'turn';
    const heading = document.createElement('h3');
    heading.textContent = 'Person ' + (person + 1) + ' · ' + source.name + ' → ' + target.name;
    item.append(heading);
    const originalLine = addLine(item, source.code);
    const draftSourceLine = addLine(item, source.code, 'turnDraft');
    const translatedLine = addLine(item, target.code, 'turnTranslation');
    const draftTranslationLine = addLine(item, target.code, 'turnDraft');
    const note = addLine(item, null, 'turnNote');
    const turn = { person, source, target, item, originalLine, draftSourceLine, translatedLine,
      draftTranslationLine, note, parts: [], draft: '', draftTranslation: '', pending: 0, done: false,
      previewStartedAt: 0, previewTimer: null, previewController: null, captureWarning: '' };

    turn.replay = addAction(item, 'Play translation', () => {
      if (!active) play(turn.parts.map(part => part.translation).filter(Boolean).join(' '), target.code, true);
    });
    turn.retry = addAction(item, 'Retry translation', () => {
      if (active) return;
      for (const part of turn.parts) {
        if (!part.failed) continue;
        part.failed = false;
        turn.queue.push(part.job);
      }
      renderTurn(turn);
    });

    turn.queue = new OrderedTranslationQueue({
      coalesce: false,
      run: (job, signal, onProgress) => requestTranslation(job.payload, { signal, onProgress }),
      onProgress: (text, job) => {
        job.part.preview = text;
        renderTurn(turn);
      },
      onCommit: ({ job, result, error }) => {
        Object.assign(job.part, { preview: '', translation: result?.translation || '',
          failed: Boolean(error || !result?.translation), needsReview: Boolean(result?.needsReview) });
      },
      onPending: count => {
        turn.pending = count;
        renderTurn(turn);
        if (!count) maybePlay(turn);
      }
    });
    turns.push(turn);
    history.append(item);
    renderTurn(turn);
    return turn;
  }

  function updateLine(line, value) {
    if (line.textContent !== value) line.textContent = value;
    line.hidden = !value;
  }

  function renderTurn(turn) {
    const hasFailure = turn.parts.some(part => part.failed);
    const needsReview = turn.parts.some(part => part.needsReview);
    const source = turn.parts.map(part => part.text).join(' ');
    const translated = turn.parts.map(part => part.translation || (part.failed ? '[…]' : '')).filter(Boolean).join(' ');
    const preview = turn.parts.find(part => part.preview)?.preview || turn.draftTranslation;
    updateLine(turn.originalLine, source);
    updateLine(turn.draftSourceLine, turn.draft);
    updateLine(turn.translatedLine, translated);
    updateLine(turn.draftTranslationLine, preview);
    const message = turn.captureWarning || (hasFailure ? 'Some speech could not be translated.' : needsReview
      ? 'Check this translation. Part of the speech was unclear.' : preview ? 'Live preview' : turn.pending ? 'Translating…' : '');
    updateLine(turn.note, message);
    turn.replay.hidden = !turn.done || Boolean(turn.pending) || hasFailure || !translated;
    turn.replay.disabled = Boolean(active);
    turn.retry.hidden = !hasFailure || Boolean(turn.pending) || !turn.done;
    turn.retry.disabled = Boolean(active);
  }

  function maybePlay(turn) {
    if (!session || active || turns.at(-1) !== turn || !turn.done || turn.pending || turn.autoPlayed) return;
    turn.autoPlayed = true;
    if (autoplay.checked && !turn.captureWarning && !turn.parts.some(part => part.failed || part.needsReview)) {
      play(turn.parts.map(part => part.translation).join(' '), turn.target.code, false);
    }
  }

  function clearPreview(turn) {
    clearTimeout(turn.previewTimer);
    turn.previewTimer = null;
    turn.previewController?.abort();
    turn.previewController = null;
    turn.draftTranslation = '';
  }

  function contextFor(turn) {
    return turns.slice(-4).flatMap(previous => previous.parts.flatMap(part =>
      previous.source.code === turn.source.code ? [part.text]
        : !part.needsReview && part.translation ? [part.translation] : [])).slice(-3);
  }

  function setDraft(text) {
    const turn = active;
    if (!turn || turn.draft === text) return;
    turn.draft = text;
    if (!text) clearPreview(turn);
    renderTurn(turn);
    if (!text || finishing || turn.pending || turn.previewTimer !== null) return;
    turn.previewTimer = setTimeout(async () => {
      turn.previewTimer = null;
      if (active !== turn || !turn.draft || finishing || turn.pending) return;
      turn.previewController?.abort();
      const controller = new AbortController();
      turn.previewController = controller;
      turn.previewStartedAt = Date.now();
      const display = translation => {
        if (active === turn && turn.previewController === controller && !controller.signal.aborted) {
          turn.draftTranslation = translation;
          renderTurn(turn);
        }
      };
      try {
        const result = await requestTranslation({ text: turn.draft.slice(-2400), sourceLanguage: turn.source.code,
          targetLanguage: turn.target.code, quality: 'fast', context: contextFor(turn) },
        { signal: controller.signal, onProgress: display });
        display(result.translation);
      } catch {
        display('');
      } finally {
        if (turn.previewController === controller) turn.previewController = null;
      }
    }, Math.max(220, 1400 - (Date.now() - turn.previewStartedAt)));
  }

  function addSpeech(text) {
    const turn = active;
    if (!turn) return;
    clearPreview(turn);
    for (const chunk of splitPhrases(text)) {
      const payload = { text: chunk, sourceLanguage: turn.source.code, targetLanguage: turn.target.code,
        quality: 'accurate', context: contextFor(turn) };
      const part = { text: chunk };
      // Keep each phrase independently retryable, even when the queue backs up.
      part.job = { part, payload };
      turn.parts.push(part);
      turn.queue.push(part.job);
    }
  }

  function completeTurn(warning = '') {
    const turn = active;
    if (!turn) return;
    clearPreview(turn);
    turn.draft = '';
    turn.done = true;
    turn.captureWarning = warning;
    active = null;
    finishing = false;
    if (!turn.parts.length) {
      turns.pop();
      history.removeChild(turn.item);
      status.textContent = warning || 'No speech was captured. Tap your button to try again.';
    } else {
      status.textContent = 'Tap a speaker to take the next turn.';
      maybePlay(turn);
    }
    renderTurn(turn);
    updateControls();
    speakers[turn.parts.length ? 1 - turn.person : turn.person].focus();
  }

  async function finish(warning = '') {
    if (!active || finishing) return;
    finishing = true;
    clearPreview(active);
    status.textContent = 'Finishing this turn…';
    updateControls();
    try {
      const captureWarning = await finishCapture();
      completeTurn(warning || captureWarning);
    } catch {
      completeTurn('The microphone was interrupted. Check the captured text.');
    }
  }

  function takeTurn(person) {
    if (!session || finishing) return;
    if (active) {
      if (active.person === person) void finish();
      return;
    }
    stopVoice();
    active = newTurn(person);
    updateControls();
    capture();
  }

  start.onclick = () => {
    if (session || start.disabled) return;
    session = selectors.map(select => languagesByCode.get(select.value));
    for (const turn of turns.splice(0)) turn.queue.clear();
    history.replaceChildren();
    status.textContent = 'Tap your language to speak. Tap again when you finish.';
    updateControls();
    speakers[0].focus();
  };
  speakers.forEach((button, person) => { button.onclick = () => takeTurn(person); });
  autoplay.onchange = () => { if (!autoplay.checked) stopVoice(); };
  function close() {
    stopVoice();
    session = null;
    updateControls();
    validatePair();
  }

  end.onclick = () => { if (!active) { close(); start.focus(); } };
  return {
    get sourceLanguage() { return active?.source.code; },
    get isFinishing() { return finishing; },
    setDraft, addSpeech, finish, close, validatePair, completeTurn
  };
}
