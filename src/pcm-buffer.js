const MAX_BUFFER_BYTES = 25 * 24_000 * 2;

// Hold unsent PCM outside the network stream so cancelling a socket reader
// doesn't discard the audio captured while the next connection is opening.
export function createPcmBuffer(onOverflow, maxBytes = MAX_BUFFER_BYTES) {
  let frames = [];
  let bytes = 0;
  let receiver;
  let waiting = false;
  let reportedOverflow = false;
  let finished = false;

  function readFrame() {
    const frame = frames.shift();
    bytes -= frame.byteLength;
    return frame;
  }

  function disconnect() {
    const current = receiver;
    receiver = undefined;
    waiting = false;
    current?.close();
  }

  return {
    push(frame) {
      if (finished) return;
      if (waiting) {
        waiting = false;
        receiver.enqueue(frame);
        return;
      }
      frames.push(frame);
      bytes += frame.byteLength;
      if (bytes <= maxBytes) return;
      while (bytes > maxBytes) readFrame();
      if (!reportedOverflow) {
        reportedOverflow = true;
        onOverflow();
      }
    },
    open() {
      disconnect();
      let owner;
      return new ReadableStream({
        start(controller) { owner = receiver = controller; },
        pull(controller) {
          if (frames.length) controller.enqueue(readFrame());
          else if (finished) disconnect();
          else waiting = true;
        },
        cancel() {
          if (receiver === owner) {
            receiver = undefined;
            waiting = false;
          }
        },
      }, { highWaterMark: 0 });
    },
    finish() {
      finished = true;
      if (waiting) disconnect();
    },
    disconnect,
  };
}
