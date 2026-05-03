import crypto from 'crypto';

const loginAttempts = {};
export const validTokens = {};

const WINDOW_MS  = 15 * 60 * 1000;     // 15 min
const MAX_TRIES  = 5;
const TOKEN_TTL  = 8 * 60 * 60 * 1000; // 8 h

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ip  = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
              || req.socket?.remoteAddress
              || 'unknown';
  const now = Date.now();

  // Rate limiting
  const att = loginAttempts[ip];
  if (att) {
    if (now - att.firstAttempt < WINDOW_MS && att.count >= MAX_TRIES) {
      return res.status(429).json({ error: 'Demasiados intentos. Intenta en 15 minutos.' });
    }
    if (now - att.firstAttempt >= WINDOW_MS) delete loginAttempts[ip];
  }

  const { password } = req.body || {};

  if (password && password === process.env.ADMIN_PASSWORD) {
    delete loginAttempts[ip];
    const token = crypto.randomBytes(32).toString('hex');
    validTokens[token] = now + TOKEN_TTL;
    return res.status(200).json({ success: true, token });
  }

  // Failed attempt
  if (!loginAttempts[ip] || now - loginAttempts[ip].firstAttempt >= WINDOW_MS) {
    loginAttempts[ip] = { count: 1, firstAttempt: now };
  } else {
    loginAttempts[ip].count++;
  }
  return res.status(401).json({ ok: false });
}
