// Local, memory-only handoff from Android's share sheet. No upload until the user confirms.
(() => {
  const pending = new Map(), MAX = 4_000_000, TTL = 120_000;
  const purge = () => { for (const [k, entry] of pending) if (Date.now() - entry.created > TTL) pending.delete(k); };
  self.receiveVoiceNoteShare = async request => {
    try {
      purge();
      if (!request.headers.get('content-type')?.startsWith('multipart/form-data') || Number(request.headers.get('content-length')) > MAX + 65536) throw new Error();
      const reader = request.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX + 65536) throw new Error(); chunks.push(part.value); }
      } finally { await reader.cancel().catch(() => {}); }
      const form = await new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('content-type') } }).formData();
      const files = [...form.values()].filter(v => v instanceof File);
      if (files.length !== 1 || files[0].size < 12 || files[0].size > MAX) throw new Error();
      while (pending.size >= 3) pending.delete(pending.keys().next().value);
      const token = crypto.randomUUID(); pending.set(token, { file: files[0], created: Date.now() });
      setTimeout(() => pending.delete(token), TTL);
      return Response.redirect(new URL(`/voice-note.html#share=${token}`, self.location.origin), 303);
    } catch { return Response.redirect(new URL('/voice-note.html#share-error=invalid', self.location.origin), 303); }
  };
  self.addEventListener('message', event => {
    if (event.data?.type !== 'voice-note-share' || !event.ports?.[0] || !event.source?.url) return;
    const source = new URL(event.source.url);
    if (source.origin !== self.location.origin || source.pathname !== '/voice-note.html') return;
    purge(); const value = pending.get(event.data.token); pending.delete(event.data.token);
    event.ports[0].postMessage(value ? { file: value.file } : { error: 'expired' });
  });
})();
