import { validTokens } from './admin-login.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body || {};
  const now = Date.now();

  // Purge expired tokens
  for (const t in validTokens) {
    if (validTokens[t] <= now) delete validTokens[t];
  }

  if (token && validTokens[token] && validTokens[token] > now) {
    return res.status(200).json({ valid: true });
  }
  return res.status(200).json({ valid: false });
}
