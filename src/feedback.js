const form = document.querySelector('#feedbackForm');
const submitButton = form?.querySelector('button[type="submit"]');
const status = document.querySelector('#feedbackStatus');

const fallbackEmail = (feedback) => {
  const subject = `VoiceTranslator feedback: ${feedback.category}`;
  const body = [
    `Topic: ${feedback.category}`,
    `Name: ${feedback.name || 'Not provided'}`,
    `Email for follow-up: ${feedback.email || 'Not provided'}`,
    '',
    'Feedback:',
    feedback.message,
    '',
    'Sent from VoiceTranslator.eu feedback form.',
  ].join('\n');
  window.location.href = `mailto:metainsights.bv@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const category = String(data.get('category') || '').trim();
  const message = String(data.get('message') || '').trim();
  const name = String(data.get('name') || '').trim();
  const email = String(data.get('email') || '').trim();
  const website = String(data.get('website') || '').trim();

  // Quietly discard automated form fills. Don't send the honeypot value to storage.
  if (website) {
    if (status) status.textContent = 'Thanks for helping us improve VoiceTranslator.';
    form.reset();
    return;
  }

  const feedback = { category, message, name, email };
  // Supabase publishable keys are intended for public clients. Keep the env
  // overrides for deployments, with the VoiceTranslator project as fallback.
  const endpoint = (import.meta.env.VITE_SUPABASE_URL || 'https://tbfvjowsqfvtljfmvzij.supabase.co').replace(/\/$/, '');
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_wo8XE4TRZ76VhmVS_dfx0A_29FE0KhA';

  if (!endpoint || !apiKey) {
    if (status) status.textContent = 'Feedback storage is not connected yet. Your email app will open with the feedback ready to send instead.';
    fallbackEmail(feedback);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Sending feedback…';
  if (status) status.textContent = 'Saving your feedback securely…';

  try {
    const response = await fetch(`${endpoint}/rest/v1/voicetranslator_feedback`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ source_app: 'VoiceTranslator.eu', category, message, display_name: name || null, contact_email: email || null }),
    });

    if (!response.ok) throw new Error(`Feedback could not be saved (${response.status}).`);

    let emailSent = false;
    try {
      const notification = await fetch('/api/feedback-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_app: 'VoiceTranslator.eu', ...feedback }),
      });
      emailSent = notification.ok;
    } catch {
      // The database remains the source of truth if the mail provider is unavailable.
    }

    form.reset();
    if (status) status.textContent = emailSent
      ? 'Thank you. Your feedback was saved and emailed to the VoiceTranslator team.'
      : 'Thank you. Your feedback was saved. Email notification is unavailable right now, but the team can still review it in the tracker.';
  } catch {
    if (status) status.textContent = 'We couldn’t save your feedback just now. Your email app will open with it ready to send instead.';
    fallbackEmail(feedback);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Send feedback';
  }
});
