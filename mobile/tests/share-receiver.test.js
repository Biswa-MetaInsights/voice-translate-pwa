import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareReceiver } from '../src/share-receiver.js';
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const selected = [], errors = [], navigations = [];
  let consumed = 0;
  const receiver = createShareReceiver({
    plugin: { pending: async () => ({ available: true }), consume: async () => { consumed++; return { base64: 'fixture' }; } },
    isNoteScreen: () => true,
    navigateToNote: () => navigations.push('note'),
    selectFile: payload => selected.push(payload),
    showError: (...args) => errors.push(args),
    ...overrides,
  });
  return { receiver, selected, errors, navigations, consumed: () => consumed };
}
test('a share waits for the note screen change handler before consuming the payload', async () => {
  const f = fixture();
  await f.receiver.notify();
  assert.equal(f.consumed(), 0); assert.equal(f.selected.length, 0);
  await f.receiver.activate();
  assert.equal(f.consumed(), 1); assert.deepEqual(f.selected, [{ base64: 'fixture' }]);
});
test('sharing on the live screen navigates without consuming or uploading audio', async () => {
  const f = fixture({ isNoteScreen: () => false });
  await f.receiver.notify();
  assert.deepEqual(f.navigations, ['note']); assert.equal(f.consumed(), 0);
});
test('events arriving during a native read are coalesced and the latest note is not lost', async () => {
  const first = deferred(); let consumed = 0;
  const f = fixture({ plugin: {
    pending: async () => ({ available: true }),
    consume: async () => ++consumed === 1 ? first.promise : { base64: 'second' },
  } });
  const active = f.receiver.activate(); await tick();
  const overlap = f.receiver.notify();
  assert.equal(consumed, 1);
  first.resolve({ base64: 'first' }); await Promise.all([active, overlap]);
  assert.deepEqual(f.selected, [{ base64: 'first' }, { base64: 'second' }]);
  assert.equal(consumed, 2);
});
test('leaving the screen during a read prevents late native data from updating the page', async () => {
  const read = deferred();
  const f = fixture({ plugin: { pending: async () => ({ available: true }), consume: () => read.promise } });
  const active = f.receiver.activate(); await tick(); f.receiver.dispose();
  read.resolve({ base64: 'late' }); await active; await f.receiver.notify();
  assert.deepEqual(f.selected, []); assert.deepEqual(f.errors, []);
});
test('native exceptions and invalid payloads produce a generic fallback without error details', async () => {
  for (const plugin of [
    { pending: async () => { throw new Error('private-path-and-token'); } },
    { pending: async () => ({ error: true }), consume: async () => ({ error: 'private-filename' }) },
  ]) {
    const f = fixture({ plugin }); await f.receiver.activate();
    assert.deepEqual(f.errors, [[]]); assert.deepEqual(f.selected, []);
  }
});
