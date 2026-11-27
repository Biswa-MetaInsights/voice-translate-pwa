export const NOTICE_VERSION = 'mobile-audio-2026-11-26';
export const PRIVACY_SECTIONS = [
  ['Who provides this app', 'VoiceTranslator.eu is provided by MetaInsights BV, Belgium. Contact metainsights.bv@gmail.com for privacy, access or deletion requests. This notice covers the mobile app. Updated 26 November 2026.'],
  ['Audio and AI processing', 'When you start Speak or Conversation, microphone audio is sent through Vercel AI Gateway to speech services. Recognized text, selected languages and recent phrases are processed for translation. Finishing a Conversation can send its transcript for an AI summary. A selected voice note is uploaded only after your agreement and a tap on Translate. Optional cloud playback and audio export send text for speech generation. Model services currently include OpenAI. Internet access is required. Translations, detected languages and summaries can contain errors; check important details against the original.'],
  ['Your choices', 'Before first live cloud processing, the app explains it and asks you to continue. Microphone permission is separate. You can stop capture, cancel a voice-note request, clear displayed content, or withdraw the live-processing choice under Privacy. Only share notes you are allowed to process. Recording other people may require their permission. No personal WhatsApp chats are accessed automatically.'],
  ['Storage and deletion', 'Audio, transcripts, translations and summaries are held temporarily for processing and in the current app screen, rather than saved as conversation history in an application database. Clear or leave the screen to release its session content. Provider systems and infrastructure apply their own processing, logging, backup and retention terms; this is not a promise of zero provider retention. Your theme, language favorites/recent choices and translation/voice preferences stay on your device. Exporting MP3 creates a private temporary file: copies older than ten minutes are removed while the app runs or when it next opens. Files you save or share elsewhere remain under your control.'],
  ['Reports and service protection', 'Report a problem sends the selected category and feature to MetaInsights BV via Supabase. It does not attach audio or conversation text. You may explicitly include up to 1000 characters that you enter yourself; avoid personal information. Reports expire after 30 days and are removed by an hourly cleanup job, with up to one hour of cleanup delay. Keep the report reference for a deletion request. To limit abuse, the backend uses a rotating, keyed fingerprint of the request IP for short-lived counters, not a raw IP in its rate-limit table. Infrastructure may process IP addresses and technical request information under its own terms.'],
  ['Providers and safeguards', 'Vercel hosts the backend and AI Gateway; configured speech/AI providers process audio and text; Supabase processes reports and service-protection counters. Network requests use HTTPS. Service credentials stay on the server. Access to reports is restricted to authorized staff. The mobile bundle does not enable the website analytics or feedback scripts. We do not use your audio to train our own models, silently publish it, or send promotional messages through this feature.'],
  ['Rights and questions', 'Contact metainsights.bv@gmail.com to request information, correction, access or deletion, to raise a privacy concern, or to withdraw a processing choice. Include a report reference if relevant, without sending audio unless necessary and agreed. Applicable rights and provider retention depend on the processing and legal basis. You may contact your competent data-protection authority.'],
];

let dialogNumber = 0;
function dialog(title) {
  const root = document.createElement('dialog'); root.className = 'mobile-dialog';
  const heading = document.createElement('h2'); heading.id = `mobile-dialog-title-${++dialogNumber}`; heading.textContent = title;
  root.setAttribute('aria-labelledby', heading.id); root.append(heading);
  root.addEventListener('close', () => root.remove(), { once: true });
  return root;
}
function paragraph(root, text) { const p = document.createElement('p'); p.textContent = text; root.append(p); }
function button(root, text, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = action; root.append(b); return b; }
function open(root) { document.body.append(root); root.showModal(); }
function consentGranted() { try { return sessionStorage.getItem('vt-processing-notice') === NOTICE_VERSION; } catch { return false; } }
let acceptedInMemory = false;
export function installMobilePrivacy() {
  document.addEventListener('click', event => {
    const a = event.target.closest?.('a[href="/privacy.html"]');
    if (a) { event.preventDefault(); showPrivacy(); }
  });
  let prompting = false;
  document.addEventListener('click', event => {
    const control = event.target.closest?.('#mic, #beginConversation, #personOneTurn, #personTwoTurn, #continueConversation');
    if (!control || (control.id === 'mic' && control.classList.contains('listening')) ||
      (['personOneTurn','personTwoTurn'].includes(control.id) && control.getAttribute('aria-pressed') === 'true') || acceptedInMemory || consentGranted()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (prompting) return;
    prompting = true;
    const root = dialog('Before you translate');
    paragraph(root, 'VoiceTranslator.eu sends microphone audio to cloud speech services through Vercel AI Gateway. Your words and recent phrases are processed for AI translation. Conversation transcripts can also be processed for summaries. Optional cloud voices process translated text. Providers apply their own retention terms.');
    paragraph(root, 'Continue only if you agree and have permission to process the conversation. You can stop at any time. Microphone permission will be requested separately.');
    button(root, 'Privacy details', () => { root.close(); showPrivacy(); });
    button(root, 'Cancel', () => root.close());
    button(root, 'Agree and continue', () => {
      acceptedInMemory = true;
      try { sessionStorage.setItem('vt-processing-notice', NOTICE_VERSION); } catch { /* Memory choice lasts for this screen. */ }
      root.close(); control.click();
    }).className = 'mobile-primary';
    root.addEventListener('close', () => { prompting = false; }, { once: true });
    open(root);
  }, true);
  const footer = document.createElement('div'); footer.className = 'mobile-support';
  button(footer, 'Privacy', showPrivacy); button(footer, 'Report a problem', showReport);
  (document.querySelector('main') || document.querySelector('.app') || document.body).append(footer);
}
function showPrivacy() {
  const root = dialog('VoiceTranslator privacy notice');
  for (const [title, text] of PRIVACY_SECTIONS) {
    const h = document.createElement('h3'); h.textContent = title; root.append(h); paragraph(root, text);
  }
  button(root, 'Withdraw live-processing choice', () => {
    acceptedInMemory = false;
    try { sessionStorage.removeItem('vt-processing-notice'); } catch { /* No stored choice. */ }
    const mic = document.getElementById('mic'); if (mic?.classList.contains('listening')) mic.click();
    root.close();
  });
  button(root, 'Close', () => root.close()); open(root);
}
function showReport() {
  const root = dialog('Report a problem');
  const form = document.createElement('form');
  const label = document.createElement('label'); label.textContent = 'What happened?';
  const category = document.createElement('select'); category.required = true;
  for (const [value, text] of [['offensive','Offensive output'],['unsafe','Unsafe output'],['incorrect','Incorrect translation'],['privacy','Privacy concern'],['other','Other problem']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = text; category.append(option);
  }
  label.append(category); form.append(label);
  const consent = document.createElement('label'); consent.className = 'mobile-report-consent';
  const include = document.createElement('input'); include.type = 'checkbox';
  consent.append(include, document.createTextNode(' Include text I enter below. No audio or conversation text is attached automatically.')); form.append(consent);
  const detailsLabel = document.createElement('label'); detailsLabel.textContent = 'Optional details — avoid personal information';
  const details = document.createElement('textarea'); details.maxLength = 1000; details.rows = 4; details.disabled = true; detailsLabel.append(details); form.append(detailsLabel);
  include.onchange = () => { details.disabled = !include.checked; if (!include.checked) details.value = ''; };
  paragraph(form, 'MetaInsights BV uses Supabase to receive reports. Reports are retained for 30 days, then removed by hourly cleanup. Keep your reference for deletion requests.');
  const status = document.createElement('p'); status.setAttribute('role','status'); form.append(status);
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Send report'; submit.className = 'mobile-primary'; form.append(submit);
  let sending = false; const controller = new AbortController();
  root.addEventListener('close', () => controller.abort(), { once: true });
  form.onsubmit = async event => {
    event.preventDefault(); if (sending) return; sending = true; submit.disabled = true;
    status.textContent = 'Sending report…';
    try {
      const response = await fetch('/api/report', { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ category:category.value, feature:document.getElementById('voiceNoteFile') ? 'voice-note' : document.getElementById('conversationSourceBtn')?.getAttribute('aria-pressed') === 'true' ? 'conversation' : 'speak',
          details:include.checked ? details.value : '', includeDetails:include.checked }), signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]) });
      const data = await response.json();
      if (!response.ok || !/^[a-f0-9-]{36}$/.test(data.reference || '')) throw new Error();
      status.textContent = `Report saved. Reference: ${data.reference}. For deletion, contact metainsights.bv@gmail.com with this reference.`;
      details.value = ''; submit.hidden = true; category.disabled = true; include.disabled = true; details.disabled = true;
    } catch { status.textContent = 'Report not saved or confirmation unavailable. Please try again later. Privacy support: metainsights.bv@gmail.com.'; }
    finally { sending = false; submit.disabled = false; }
  };
  root.append(form); button(root, 'Close', () => root.close()); open(root);
}
