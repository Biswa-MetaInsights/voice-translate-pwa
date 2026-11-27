// Mobile presentation only. The existing recognition/translation state machines
// and their element IDs stay intact; no PWA markup or processing is replaced.
const iconPaths = {
  microphone: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13v4M12 11v8M16 13v4"/>',
  attachment: '<path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9M6 14l8-8"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
};
export function mobileIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  // All paths are fixed application assets; no message content is used as HTML.
  svg.innerHTML = iconPaths[name] || iconPaths.note;
  return svg;
}
function text(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }

export function prepareMobilePresentation() {
  const note = Boolean(document.getElementById('voiceNoteFile'));
  document.body.dataset.mobileScreen = note ? 'note' : 'live';
  if (note) prepareNoteScreen();
  else prepareLiveScreen();
}

function prepareNoteScreen() {
  const main = document.querySelector('main');
  main.querySelector(':scope > a')?.remove();
  const header = main.querySelector('header');
  header.classList.add('mobile-note-header');
  header.querySelector('h1').textContent = 'Voice notes';
  header.querySelector('p').textContent = 'Read or hear a note in your language.';
  main.querySelector('.eyebrow')?.remove();
  text('chooseTitle', 'Your voice note');
  text('fileHint', 'Choose a short audio note, up to 4 MB.');
  const input = document.getElementById('voiceNoteFile');
  const label = main.querySelector('label[for="voiceNoteFile"]');
  label.className = 'srOnly'; label.textContent = 'Choose a voice note'; input.hidden = true;
  const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'mobile-file-picker';
  const chooseText = document.createTextNode('Choose voice note');
  choose.append(mobileIcon('attachment'), chooseText);
  choose.addEventListener('click', () => input.click()); input.before(choose);
  for (const [id, value] of [['voiceNoteSource', 'Voice language'], ['voiceNoteTarget', 'Translate to']]) {
    const parent = document.getElementById(id).parentElement;
    const labelText = [...parent.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (labelText) labelText.textContent = value;
  }
  const consent = main.querySelector('.consent span'), privacy = consent.querySelector('a');
  consent.replaceChildren(document.createTextNode('I agree to VoiceTranslator.eu processing this note for translation. I have permission to share it. '), privacy);
  text('translateNote', 'Translate'); text('clearNote', 'Clear note');
  text('resultTitle', 'Your translation'); text('playNoteTranslation', 'Listen'); text('copyNoteTranslation', 'Copy text');
  const transcript = document.getElementById('noteTranscript');
  transcript.previousElementSibling?.remove();
  const original = document.createElement('details'); original.className = 'mobile-original';
  const summary = document.createElement('summary'); summary.textContent = 'See original words';
  original.append(summary, transcript); document.getElementById('noteResults').append(original);
  original.before(document.querySelector('#noteResults .review'));
  const help = main.querySelector(':scope > details'); help.querySelector('summary').textContent = 'How to share from WhatsApp';
  const steps = ['Press and hold one voice note in WhatsApp.', 'Open the phone’s Share menu and choose VoiceTranslator.', 'Choose your language, allow processing, then tap Translate.'];
  help.querySelector('ol').replaceChildren(...steps.map(value => { const li = document.createElement('li'); li.textContent = value; return li; }));
  help.querySelector('p').textContent = 'If VoiceTranslator is missing from Share, save the note to your files and use Choose voice note here. WhatsApp’s Forward button sends to WhatsApp contacts.';
  const selected = document.getElementById('selectedNote');
  const clear = document.getElementById('clearNote'); clear.hidden = true;
  const retention = main.querySelector(':scope > p.muted');
  retention.textContent = 'Clear note removes the note and translation from this screen. The Privacy notice explains how your audio is processed.';
  const refresh = () => {
    const selected = !document.getElementById('clearNote').disabled;
    document.body.classList.toggle('mobile-note-selected', selected);
    clear.hidden = !selected;
    chooseText.nodeValue = selected ? 'Choose another note' : 'Choose voice note';
  };
  const observer = new MutationObserver(refresh); observer.observe(selected, { childList: true, characterData: true, subtree: true });
  const resultObserver = new MutationObserver(() => {
    if (document.getElementById('noteTranslation').textContent.trim()) {
      document.getElementById('noteResults').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  });
  resultObserver.observe(document.getElementById('noteTranslation'), { childList: true, characterData: true, subtree: true });
  // A short screen can place status below the fixed navigation. Reveal progress
  // and failures after a requested action, while keeping a newly shared note at
  // its file/language controls and giving completed translations precedence.
  let requestedAction = false;
  for (const id of ['translateNote', 'cancelNote', 'playNoteTranslation']) {
    document.getElementById(id).addEventListener('click', () => { requestedAction = true; });
  }
  input.addEventListener('change', () => { requestedAction = false; });
  clear.addEventListener('click', () => { requestedAction = false; });
  const status = document.getElementById('voiceNoteStatus');
  const statusObserver = new MutationObserver(() => {
    const failedShare = status.textContent.startsWith('Direct sharing is unavailable.');
    if ((!requestedAction && !failedShare) || status.textContent.startsWith('Translation ready.')) return;
    // Immediate positioning also respects reduced-motion users and avoids
    // racing a pending Cancel tap with a smooth scrolling animation.
    status.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  statusObserver.observe(status, { childList: true, characterData: true, subtree: true });
  window.addEventListener('pagehide', () => { observer.disconnect(); resultObserver.disconnect(); statusObserver.disconnect(); }, { once: true });
}

export function finishNotePresentation() {
  for (const id of ['voiceNoteSource', 'voiceNoteTarget']) {
    document.getElementById(id).addEventListener('change', () => {
      const selected = !document.getElementById('clearNote').disabled;
      document.getElementById('voiceNoteStatus').textContent = selected
        ? 'Language selected. Tap Translate when you’re ready.'
        : 'Language selected. Choose a voice note to get started.';
    });
  }
}

function prepareLiveScreen() {
  document.querySelectorAll('.infoCard').forEach(element => element.remove());
  const settings = document.querySelector('.settings');
  if (settings) { settings.querySelector('summary').textContent = 'More options'; settings.parentElement.append(settings); }
  if (settings) settings.append(document.getElementById('mp3OptionsSlot'));
  const labels = document.querySelectorAll('#singleLanguageRow .langLabel');
  if (labels[0]) labels[0].textContent = 'Speak';
  if (labels[1]) labels[1].textContent = 'Translate to';
  text('micSourceBtn', 'Speak'); text('conversationSourceBtn', 'Conversation');
  document.getElementById('meetingSourceBtn').hidden = true;
  document.querySelector('a[href="/voice-note.html"]')?.closest('p')?.remove();
  const headings = document.querySelectorAll('#singleTranslationPanels .sectionTitle > span:first-child');
  if (headings[0]) headings[0].textContent = 'Your words';
  if (headings[1]) headings[1].textContent = 'Translation';
  text('speak', 'Listen'); text('copy', 'Copy text'); text('downloadMp3', 'Save audio');
  const mic = document.getElementById('mic');
  const refresh = () => {
    if (['🎤', '■'].includes(mic.textContent)) mic.replaceChildren(mobileIcon(mic.classList.contains('listening') ? 'stop' : 'microphone'));
  };
  refresh(); const observer = new MutationObserver(refresh); observer.observe(mic, { childList: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
