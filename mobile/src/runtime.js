import { Capacitor, registerPlugin } from '@capacitor/core';
import { createMobileFetch } from './network.js';
import { sharedAudioFile, applySharedFile } from './share.js';
import { createShareReceiver } from './share-receiver.js';
import { prepareMobilePresentation, mobileIcon } from './presentation.js';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { expiredExports, exportMp3 } from './export.js';
import './style.css';
import { installMobilePrivacy } from './privacy.js';
const share = registerPlugin('VoiceNoteShare');
const originalFetch = window.fetch.bind(window);
async function clearExpiredExports() {
  try {
    const { files } = await Filesystem.readdir({ directory: Directory.Cache, path: 'voice-translator-exports' });
    await Promise.all(expiredExports(files).map(file => Filesystem.deleteFile({ directory: Directory.Cache, path: 'voice-translator-exports/' + file.name })));
  } catch { /* The export directory does not exist before the first export. */ }
}
async function installNativeExport() {
  if (!Capacitor.isNativePlatform()) return;
  await clearExpiredExports();
  let exporting = false;
  document.addEventListener('click', async event => {
    const anchor = event.target.closest?.('a[download]');
    if (!anchor || !anchor.href.startsWith('blob:')) return;
    event.preventDefault();
    if (exporting) return;
    exporting = true;
    const status = document.getElementById('mp3Status');
    try {
      const blob = await (await originalFetch(anchor.href)).blob();
      await exportMp3(blob, { filesystem: Filesystem, share: Share, cache: Directory.Cache,
        encode: file => new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not prepare this MP3.')); reader.readAsDataURL(file);
        }) });
      if (status) status.textContent = 'Choose where to save or share your MP3. Temporary export copies are removed after ten minutes when the app next runs.';
    } catch { if (status) status.textContent = 'MP3 sharing was cancelled or unavailable. Try a shorter conversation and tap Save conversation MP3 to retry.'; }
    finally { exporting = false; }
  }, true);
  setInterval(() => { void clearExpiredExports(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void clearExpiredExports(); });
}
let receiver = null;
let shareListener = null;
let sharingUnavailable = false;
function showShareError() {
  const status = document.getElementById('voiceNoteStatus');
  if (status) status.textContent = 'Direct sharing is unavailable. Select one supported audio note smaller than 4 MB using the file picker.';
}
export function showStartupError() {
  const main = document.createElement('main'), title = document.createElement('h1'), text = document.createElement('p'), retry = document.createElement('button');
  title.textContent = 'VoiceTranslator could not start';
  text.textContent = 'Please reopen the app or contact metainsights.bv@gmail.com for an updated test build.';
  retry.textContent = 'Try again'; retry.onclick = () => location.reload();
  main.append(title, text, retry); document.body.replaceChildren(main);
}
export async function receivePendingAudio(ready = false) {
  if (sharingUnavailable) { showShareError(); return; }
  if (!receiver) return;
  return ready === true ? receiver.activate() : receiver.notify();
}
export async function initializeMobile() {
  // A restored page has already disposed its native listeners and sensitive
  // session state. Recreate it rather than leave stale controls after Back.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  const response = await originalFetch('/mobile-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('This mobile build is missing its backend configuration.');
  const { backend } = await response.json();
  window.fetch = createMobileFetch({ backend, localOrigin: location.protocol + '//' + location.host, fetchImpl: originalFetch });
  // Mobile-specific controls only; the PWA source and behavior are not modified.
  document.querySelectorAll('a[href="/voice-note.html"]').forEach(a => a.removeAttribute('target'));
  document.querySelectorAll('.installLink, .installSteps, .installMore, .feedbackForm').forEach(e => e.hidden = true);
  prepareMobilePresentation();
  const nav = document.createElement('nav'); nav.className = 'mobile-tabs'; nav.setAttribute('aria-label', 'App sections');
  for (const [href, text, icon] of [['/', 'Speak', 'microphone'], ['/voice-note.html', 'Voice notes', 'note']]) {
    const a = document.createElement('a'); a.href = href;
    const label = document.createElement('span'); label.textContent = text;
    a.append(mobileIcon(icon), label);
    if ((href === '/' && location.pathname === '/') || href === location.pathname) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  document.body.append(nav);
  installMobilePrivacy();
  await installNativeExport();
  if (Capacitor.getPlatform() === 'android') {
    receiver = createShareReceiver({
      plugin: share,
      isNoteScreen: () => location.pathname.endsWith('/voice-note.html'),
      navigateToNote: () => location.assign('/voice-note.html'),
      selectFile: payload => applySharedFile(sharedAudioFile(payload), document.getElementById('voiceNoteFile')),
      showError: showShareError,
    });
    try {
      shareListener = await share.addListener('shareAvailable', () => { void receivePendingAudio(); });
      if (!location.pathname.endsWith('/voice-note.html')) await receivePendingAudio();
    } catch {
      // Optional native receiving must not prevent live translation from starting.
      sharingUnavailable = true; receiver.dispose(); showShareError();
    }
    window.addEventListener('pagehide', () => {
      receiver?.dispose();
      void shareListener?.remove().catch(() => {});
    }, { once: true });
  }
  // Keep sensitive sessions in the foreground. Existing pagehide handlers clear
  // voice notes; a device lock pauses capture via its established stop control.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    const mic = document.getElementById('mic');
    if (mic?.classList.contains('listening')) mic.click();
    document.getElementById('cancelNote')?.click();
    document.getElementById('stopNotePlayback')?.click();
  });
}
