/** Serializes native handoffs without losing events arriving during a read.
 * Dependencies keep OS integration testable without a WebView or real audio.
 * This boundary selects files only; it never starts speech/translation requests.
 */
export function createShareReceiver({ plugin, isNoteScreen, navigateToNote, selectFile, showError }) {
  let ready = false;
  let disposed = false;
  let dirty = false;
  let running = null;

  async function drain() {
    do {
      dirty = false;
      try {
        const state = await plugin.pending();
        if (disposed) return;
        if (!state.available && !state.error) continue;
        if (!isNoteScreen()) {
          navigateToNote();
          return;
        }
        if (!ready) return; // Its existing file-change handler is not installed yet.
        const payload = await plugin.consume();
        if (disposed) return;
        if (payload.error) showError();
        else if (payload.base64) await selectFile(payload);
      } catch {
        if (!disposed) showError(); // Never expose native errors, paths or payloads.
      }
    } while (dirty && !disposed);
  }

  function notify() {
    if (disposed) return Promise.resolve();
    dirty = true;
    if (!running) {
      running = drain().finally(() => {
        running = null;
        if (dirty && !disposed) void notify();
      });
    }
    return running;
  }

  return {
    notify,
    activate() { ready = true; return notify(); },
    dispose() { disposed = true; dirty = false; },
  };
}
