import { mobileRpc } from './controls.js';
const categories = new Set(['offensive', 'unsafe', 'incorrect', 'privacy', 'other']);
const features = new Set(['speak', 'conversation', 'voice-note']);
export function createReportHandler({ rpc = mobileRpc, env = process.env } = {}) {
  return async (req, res) => {
    if (!req.body || Object.keys(req.body).some(key => !['category','feature','details','includeDetails'].includes(key))) return res.status(400).json({ error: 'Only report fields are accepted. Do not attach audio or conversation data.' });
    const { category, feature, details = '', includeDetails = false } = req.body || {};
    if (!categories.has(category) || !features.has(feature) || typeof details !== 'string' || details.length > 1000 ||
      typeof includeDetails !== 'boolean' || (!includeDetails && details)) return res.status(400).json({ error: 'Choose a report category. Only include text you agree to send.' });
    try {
      const id = await rpc('vt_mobile_report', { p_category: category, p_feature: feature, p_details: includeDetails ? details.trim() : '' }, { env });
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error();
      return res.status(201).json({ reference: id });
    } catch {
      return res.status(503).json({ error: 'Your report was not saved. Please try again later.' });
    }
  };
}
