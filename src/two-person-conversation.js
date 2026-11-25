import { OrderedTranslationQueue, requestTranslation, splitPhrases } from './translation-client.js';

export function setupTwoPersonConversation({ document, languages, status, capture, finishCapture, play, stopVoice, setCaptureActive, onExportChange, resetExport }) {
  const controls = document.getElementById('conversationControls');
  const setup = document.getElementById('conversationSetup');
  const history = document.getElementById('turnHistory');
  const latest = document.getElementById('latestTurn');
  const earlier = document.getElementById('conversationHistory');
  const summary = document.getElementById('conversationSummary');
  const keyPoints = document.getElementById('conversationKeyPoints');
  const summaryStatus = document.getElementById('conversationSummaryStatus');
  const summaryPoints = document.getElementById('conversationSummaryPoints');
  const retrySummary = document.getElementById('retryConversationSummary');
  const speakerGrid = document.getElementById('conversationSpeakers');
  const options = document.getElementById('activeConversationOptions');
  const restart = document.getElementById('newConversation');
  const confirmRestart = document.getElementById('confirmNewConversation');
  const startOver = document.getElementById('startOverConversation');
  const keepTranscript = document.getElementById('keepConversation');
  const continueTurn = document.getElementById('continueConversation');
  const skipAudio = document.getElementById('skipConversationAudio');
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
  let ended = false;
  let handoff = null;
  let playback = null;
  let nextSpeaker = null;
  let summaryLanguage = '';
  let summaryRequest = null;
  const turns = [];

  function validatePair() {
    const same = selectors[0].value === selectors[1].value;
    start.disabled = same;
    if (ended) { ready(); return; }
    status.textContent = same ? 'Choose a different language for each person.' : 'Choose each person’s language, then start.';
  }

  function updateControls() {
    const blocked = Boolean(active || handoff || playback);
    setup.hidden = Boolean(session || ended);
    controls.hidden = !(session || ended);
    speakerGrid.hidden = options.hidden = !session;
    summary.hidden = !ended;
    latest.hidden = turns.length === 0;
    earlier.hidden = turns.length < 2 || (!session && !ended);
    skipAudio.hidden = !playback;
    continueTurn.hidden = !handoff;
    end.disabled = blocked;
    setCaptureActive(blocked);
    if (session) speakers.forEach((button, person) => {
      const selected = active?.person === person;
      button.disabled = finishing || Boolean(handoff || playback || (active && !selected));
      button.setAttribute('aria-pressed', String(selected));
      button.dataset.next = String(!blocked && person === nextSpeaker);
      const language = session[person];
      const label = person === 0 ? 'Teacher' : 'Mother';
      button.setAttribute('aria-label', label + ' · ' + language.name + (selected ? ' · Finish turn' : ' · Take turn'));
      button.textContent = selected ? (finishing ? 'Finishing…' : 'Finish turn')
        : (nextSpeaker === person ? 'Take turn · ' : '') + label + ' · ' + language.name;
    });
    for (const turn of turns) {
      turn.replay.disabled = blocked;
      turn.retry.disabled = blocked;
    }
  }

  function ready(next, message = '') {
    nextSpeaker = next;
    if (ended) status.textContent = message ? 'Conversation ended. ' + message : 'Conversation ended.';
    else if (session) status.textContent = message || (next == null ? 'Choose who speaks first, then tap Take turn.'
      : (next === 0 ? 'Teacher' : 'Mother') + ' speaks ' + session[next].name + '. Tap Take turn when ready.');
    updateControls();
    if (session && next != null && [status, skipAudio, continueTurn].includes(document.activeElement)) speakers[next].focus();
  }

  async function playTurn(turn, replace) {
    if (active || handoff || playback) return;
    const playing = { turn, next: replace ? nextSpeaker : 1 - turn.person };
    playback = playing;
    const previousFocus = document.activeElement;
    status.textContent = 'Preparing translated audio…';
    updateControls();
    if (previousFocus === turn.replay) skipAudio.focus();
    let message = '';
    try {
      await play(turn.parts.map(part => part.translation).join(' '), turn.target.code, replace, {
        onPlaying: () => {
          if (playback === playing) status.textContent = 'Playing translation · ' + turn.target.name;
        },
        onUnavailable: text => { message = text; }
      });
    } catch {
      message = 'Audio unavailable. Tap Play translation to retry.';
    } finally {
      if (playback === playing) finishPlayback(message);
    }
  }

  function finishPlayback(message = '') {
    const turn = playback.turn;
    const { next } = playback;
    const restoreFocus = ended && document.activeElement === skipAudio;
    const playbackMessage = message ? message + (session ? ' Tap Take turn when ready.' : '') : '';
    playback = null;
    ready(next, playbackMessage);
    if (restoreFocus) turn.replay.focus();
  }

  function skipPlayback() {
    if (!playback) return;
    stopVoice();
    finishPlayback();
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
    const translatedLine = addLine(item, target.code, 'turnTranslation');
    const draftTranslationLine = addLine(item, target.code, 'turnTranslation turnDraft');
    const originalLine = addLine(item, source.code, 'turnOriginal');
    const draftSourceLine = addLine(item, source.code, 'turnDraft');
    const note = addLine(item, null, 'turnNote');
    const turn = { person, source, target, item, originalLine, draftSourceLine, translatedLine,
      draftTranslationLine, note, parts: [], draft: '', draftTranslation: '', pending: 0, done: false,
      previewStartedAt: 0, previewTimer: null, previewController: null, captureWarning: '' };

    turn.replay = addAction(item, 'Play translation', () => {
      void playTurn(turn, true);
    });
    turn.retry = addAction(item, 'Retry translation', () => {
      if (active || handoff || playback) return;
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
        if (!count) finishHandoff(turn);
        if (ended) onExportChange();
      }
    });
    const previous = turns.at(-1);
    latest.replaceChildren(item);
    latest.scrollTop = 0;
    if (previous) history.append(previous.item);
    turns.push(turn);
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
    turn.replay.disabled = Boolean(active || handoff || playback);
    turn.retry.hidden = !hasFailure || Boolean(turn.pending) || !turn.done;
    turn.retry.disabled = Boolean(active || handoff || playback);
  }

  function finishHandoff(turn) {
    if (handoff !== turn || turn.pending) return;
    handoff = null;
    const next = 1 - turn.person;
    const canPlay = autoplay.checked && !turn.captureWarning &&
      turn.parts.every(part => part.translation && !part.needsReview);
    const failed = turn.parts.some(part => part.failed);
    const needsReview = turn.captureWarning || turn.parts.some(part => part.needsReview);
    const message = failed ? 'Translation incomplete. Review or retry this turn before continuing.'
      : needsReview ? 'Check the latest turn before continuing.' : '';
    if (canPlay) {
      // Playback is part of the completed turn; only the explicit Take turn button starts the next microphone turn.
      await playTurn(turn, true);
    }
    ready(next, message);

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
      const previous = turns.at(-1);
      if (previous) history.removeChild(previous.item);
      latest.replaceChildren(...(previous ? [previous.item] : []));
      ready(turn.person, warning || 'No speech was captured. Tap Take turn to try again.');
      speakers[turn.person].focus();
      return;
    }
    handoff = turn;
    renderTurn(turn);
    if (turn.pending) status.textContent = 'Translating…';
    finishHandoff(turn);
    updateControls();
  }

  async function finish(warning = '') {
    if (!active || finishing) return;
    finishing = true;
    clearPreview(active);
    status.textContent = 'Finishing this turn…';
    status.focus();
    updateControls();
    try {
      const captureWarning = await finishCapture();
      completeTurn(warning || captureWarning);
    } catch {
      completeTurn('The microphone was interrupted. Check the captured text.');
    }
  }

  function takeTurn(person) {
    if (!session || finishing || handoff || playback) return;
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
    ready();
    speakers[0].focus();
  };
  speakers.forEach((button, person) => { button.onclick = () => takeTurn(person); });
  autoplay.onchange = () => { if (!autoplay.checked) skipPlayback(); };
  skipAudio.onclick = skipPlayback;
  continueTurn.onclick = () => {
    if (!handoff) return;
    const next = 1 - handoff.person;
    handoff = null;
    ready(next);
  };

  async function summarize() {
    if (!ended || summaryRequest) return;
    const transcript = turns.filter(turn => turn.done).map(turn => ({
      speaker: turn.person + 1,
      language: turn.source.code,
      text: turn.parts.map(part => part.text).join(' '),
      unclear: Boolean(turn.captureWarning || turn.parts.some(part => part.needsReview))
    }));
    keyPoints.hidden = false;
    summaryPoints.hidden = true;
    summaryPoints.replaceChildren();
    retrySummary.hidden = true;
    summaryStatus.classList.remove('srOnly');
    if (!transcript.length) {
      summaryStatus.textContent = 'No speech was captured to summarize.';
      return;
    }

    const controller = new AbortController();
    summaryRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 22_000);
    summaryStatus.textContent = 'Finding the important points…';
    try {
      const response = await fetch('/api/conversation-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: summaryLanguage, turns: transcript }),
        signal: controller.signal
      });
      if (summaryRequest !== controller) return;
      if (response.status === 413) {
        summaryStatus.textContent = 'This conversation is too long to summarize. The transcript is still available.';
        return;
      }
      if (!response.ok) throw new Error('Summary request failed');
      const { points } = await response.json();
      if (summaryRequest !== controller) return;
      if (!Array.isArray(points) || points.some(point => typeof point !== 'string')) throw new Error('Invalid summary');
      for (const point of points) {
        const item = document.createElement('li');
        item.textContent = point;
        summaryPoints.append(item);
      }
      summaryPoints.setAttribute('lang', summaryLanguage);
      summaryPoints.hidden = !points.length;
      summaryStatus.textContent = points.length ? 'Summary ready.' : 'No substantive points came up in this conversation.';
      if (points.length) summaryStatus.classList.add('srOnly');
    } catch {
      if (summaryRequest !== controller) return;
      summaryStatus.textContent = 'The summary could not be generated.';
      retrySummary.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (summaryRequest === controller) summaryRequest = null;
    }
  }

  retrySummary.onclick = () => { void summarize(); };

  function close() {
    if (!session) return;
    summaryLanguage = session[0].code;
    stopVoice();
    playback = null;
    handoff = null;
    session = null;
    ended = true;
    ready();
    onExportChange();
    void summarize();
  }

  end.onclick = () => {
    if (active || handoff || playback) return;
    close();
    restart.focus();
  };
  restart.onclick = () => {
    if (!turns.length) { resetConversation(); return; }
    confirmRestart.hidden = false;
    restart.hidden = true;
    startOver.focus();
  };
  keepTranscript.onclick = () => {
    confirmRestart.hidden = true;
    restart.hidden = false;
    restart.focus();
  };
  startOver.onclick = resetConversation;

  function resetConversation() {
    confirmRestart.hidden = true;
    restart.hidden = false;
    ended = false;
    summaryRequest?.abort();
    summaryRequest = null;
    keyPoints.hidden = true;
    summaryPoints.replaceChildren();
    for (const turn of turns.splice(0)) turn.queue.clear();
    history.replaceChildren();
    latest.replaceChildren();
    resetExport();
    validatePair();
    updateControls();
    selectors[0].focus();
  }
  return {
    get sourceLanguage() { return active?.source.code; },
    get isFinishing() { return finishing; },
    exportTurns: () => turns.filter(turn => turn.done).flatMap(turn => turn.parts
      .filter(part => part.translation).map(part => ({ source: part.text, translation: part.translation }))),
    setDraft, addSpeech, finish, close, validatePair, completeTurn
  };
}
