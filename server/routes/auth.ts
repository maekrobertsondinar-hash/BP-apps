import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import crypto from 'crypto';
import { query, run, get, persistDB } from '../db.js';
import { requireAuth, AuthPayload } from '../middleware/auth.js';
import { getAccessSecret, getRefreshSecret } from '../secrets.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

const COOKIE_OPTS_ACCESS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 15 * 60 * 1000,
  path: '/',
};

const COOKIE_OPTS_REFRESH = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
};

function issueTokens(res: Response, payload: AuthPayload): void {
  const accessToken = jwt.sign(payload, getAccessSecret(), { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: payload.userId }, getRefreshSecret(), { expiresIn: '7d' });

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  run(
    `DELETE FROM refresh_tokens WHERE user_id = ?`,
    [payload.userId]
  );
  run(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [payload.userId, tokenHash, expiresAt]
  );
  persistDB();

  res.cookie('access_token', accessToken, COOKIE_OPTS_ACCESS);
  res.cookie('refresh_token', refreshToken, COOKIE_OPTS_REFRESH);
}

const LoginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const parse = LoginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Données invalides' });
    return;
  }
  const { username, password } = parse.data;

  const user = get<{
    id: number; username: string; full_name: string;
    password_hash: string; role: string; status: string;
  }>(
    `SELECT id, username, full_name, password_hash, role, status
     FROM users WHERE username = ? COLLATE NOCASE`,
    [username]
  );

  if (!user) {
    await bcrypt.hash('dummy', 12);
    res.status(401).json({ error: 'Identifiants incorrects' });
    return;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    res.status(401).json({ error: 'Identifiants incorrects' });
    return;
  }

  if (user.status !== 'APPROVED') {
    res.status(403).json({ error: "Compte en attente d'approbation" });
    return;
  }

  run(`UPDATE users SET last_login = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`, [user.id]);
  persistDB();

  const payload: AuthPayload = {
    userId: user.id,
    username: user.username,
    role: user.role as 'ADMIN' | 'USER',
  };

  issueTokens(res, payload);
  res.json({
    user: {
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      status: user.status,
    },
  });
});

router.post('/logout', requireAuth, (req: Request, res: Response) => {
  if (req.user) {
    run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [req.user.userId]);
    persistDB();
  }
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.json({ ok: true });
});

router.post('/refresh', async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (!token) {
    res.status(401).json({ error: 'Pas de token de rafraîchissement' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getRefreshSecret()) as { userId: number };
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const stored = get<{ user_id: number; expires_at: string }>(
      `SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = ?`,
      [tokenHash]
    );

    if (!stored || stored.user_id !== decoded.userId) {
      res.status(401).json({ error: 'Token invalide' });
      return;
    }

    if (new Date(stored.expires_at) < new Date()) {
      run(`DELETE FROM refresh_tokens WHERE token_hash = ?`, [tokenHash]);
      persistDB();
      res.status(401).json({ error: 'Token expiré' });
      return;
    }

    const user = get<{
      id: number; username: string; full_name: string; role: string; status: string;
    }>(
      `SELECT id, username, full_name, role, status FROM users WHERE id = ?`,
      [decoded.userId]
    );

    if (!user || user.status !== 'APPROVED') {
      res.status(401).json({ error: 'Utilisateur introuvable ou désactivé' });
      return;
    }

    const payload: AuthPayload = {
      userId: user.id,
      username: user.username,
      role: user.role as 'ADMIN' | 'USER',
    };

    issueTokens(res, payload);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = get<{
    id: number; username: string; full_name: string; role: string; status: string;
  }>(
    `SELECT id, username, full_name, role, status FROM users WHERE id = ?`,
    [req.user!.userId]
  );

  if (!user) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return;
  }

  res.json({
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    status: user.status,
  });
});

const RegisterSchema = z.object({
  username: z.string().min(2).max(100),
  fullName: z.string().min(2).max(100),
  password: z.string().min(6).max(200),
});

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const parse = RegisterSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Données invalides. Le mot de passe doit faire au moins 6 caractères.' });
    return;
  }
  const { username, fullName, password } = parse.data;

  const exists = get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`, [username]);
  if (exists) {
    res.status(409).json({ error: "Un compte avec ce nom existe déjà. Contactez l'administrateur." });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  run(
    `INSERT INTO users (username, full_name, password_hash, role, status) VALUES (?, ?, ?, 'USER', 'PENDING')`,
    [username, fullName, hash]
  );
  persistDB();

  res.status(201).json({ message: "Inscription soumise. En attente d'approbation." });
});

const VerifyPasswordSchema = z.object({ password: z.string().min(1) });

router.post('/verify-password', requireAuth, authLimiter, async (req: Request, res: Response) => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Réservé aux administrateurs' });
    return;
  }
  const parse = VerifyPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Données invalides' });
    return;
  }

  const user = get<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    [req.user.userId]
  );

  if (!user) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return;
  }

  const match = await bcrypt.compare(parse.data.password, user.password_hash);
  if (!match) {
    res.status(401).json({ error: 'Mot de passe administrateur incorrect' });
    return;
  }

  res.json({ ok: true });
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(200),
});

router.post('/change-password', requireAuth, authLimiter, async (req: Request, res: Response) => {
  const parse = ChangePasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères.' });
    return;
  }

  const user = get<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    [req.user!.userId]
  );

  if (!user) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return;
  }

  const match = await bcrypt.compare(parse.data.currentPassword, user.password_hash);
  if (!match) {
    res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    return;
  }

  const hash = await bcrypt.hash(parse.data.newPassword, 12);
  run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, req.user!.userId]);
  persistDB();

  res.json({ ok: true });
});

export default router;
