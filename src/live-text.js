// Completed phrases have persistent DOM nodes. Streaming revisions only touch
// the separate draft node, preserving history, selection and reading position.
export function createLiveText(element, placeholder) {
  const document = element.ownerDocument;
  const history = document.createElement('span');
  const draft = document.createTextNode('');
  const empty = document.createTextNode(placeholder);
  element.replaceChildren(history, draft, empty);
  let committed = '';

  return (nextCommitted = '', nextDraft = '', direction = 'auto') => {
    if (nextCommitted !== committed) {
      if (nextCommitted.startsWith(committed)) {
        history.appendChild(document.createTextNode(nextCommitted.slice(committed.length)));
      } else {
        // Only explicit clear, retry or language changes replace history.
        history.replaceChildren(document.createTextNode(nextCommitted));
      }
      committed = nextCommitted;
    }
    const tail = (committed && nextDraft ? ' ' : '') + nextDraft;
    if (draft.data !== tail) draft.data = tail;
    const hasText = Boolean(committed || nextDraft);
    const hint = hasText ? '' : placeholder;
    if (empty.data !== hint) empty.data = hint;
    element.classList.toggle('placeholder', !hasText);
    element.dir = direction;
  };
}
