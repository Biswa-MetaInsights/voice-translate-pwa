const MAX_EXPORT_BYTES = 6_000_000;
export function expiredExports(files, now = Date.now()) {
  return files.filter(file => /^\d{13}-[0-9a-f-]{36}\.mp3$/.test(file.name) && now - Number(file.name.slice(0, 13)) >= 600_000);
}
export async function exportMp3(blob, { filesystem, share, cache = 'CACHE', now = Date.now, encode } = {}) {
  if (!blob?.size || blob.size > MAX_EXPORT_BYTES || blob.type !== 'audio/mpeg') throw new Error('Choose an MP3 export smaller than 6 MB.');
  const name = `${now()}-${crypto.randomUUID()}.mp3`, path = 'voice-translator-exports/' + name;
  let uri;
  try {
    await filesystem.writeFile({ directory: cache, path, data: await encode(blob), recursive: true });
    ({ uri } = await filesystem.getUri({ directory: cache, path }));
  } catch (error) {
    // A failed preparation has no receiving app. Remove any partial export now.
    await filesystem.deleteFile({ directory: cache, path }).catch(() => {});
    throw error;
  }
  // The system sheet asks the user where to save/send it. Never auto-forward.
  // Keep it briefly because the selected receiving app may read after dismissal.
  await share.share({ title: 'VoiceTranslator MP3', files: [uri], dialogTitle: 'Save or share your MP3' });
  return path;
}
