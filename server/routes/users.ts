import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, run, get, persistDB } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

router.get('/', (req: Request, res: Response) => {
  const users = query(
    `SELECT id, username, full_name, role, status, created_at, last_login FROM users ORDER BY role DESC, full_name`
  );
  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role,
    status: u.status,
    createdAt: u.created_at,
    lastLogin: u.last_login,
  })));
});

const CreateUserSchema = z.object({
  username: z.string().min(2).max(100),
  fullName: z.string().min(2).max(100),
  password: z.string().min(6).max(200),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
});

router.post('/', async (req: Request, res: Response) => {
  const parse = CreateUserSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Données invalides. Le mot de passe doit faire au moins 6 caractères.' });
    return;
  }
  const { username, fullName, password, role } = parse.data;

  const exists = get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`, [username]);
  if (exists) {
    res.status(409).json({ error: 'Cet utilisateur existe déjà' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  run(
    `INSERT INTO users (username, full_name, password_hash, role, status) VALUES (?, ?, ?, ?, 'APPROVED')`,
    [username, fullName, hash, role]
  );
  persistDB();

  res.status(201).json({ ok: true });
});

router.put('/:username/approve', (req: Request, res: Response) => {
  const { username } = req.params;
  const user = get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`, [username]);
  if (!user) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return;
  }
  run(`UPDATE users SET status = 'APPROVED' WHERE username = ? COLLATE NOCASE`, [username]);
  persistDB();
  res.json({ ok: true });
});

router.put('/:username/role', (req: Request, res: Response) => {
  const { username } = req.params;
  const role = req.body?.role;
  if (!['ADMIN', 'USER'].includes(role)) {
    res.status(400).json({ error: 'Rôle invalide' });
    return;
  }
  if (username === req.user!.username) {
    res.status(400).json({ error: 'Impossible de modifier son propre rôle' });
    return;
  }
  run(`UPDATE users SET role = ? WHERE username = ? COLLATE NOCASE`, [role, username]);
  persistDB();
  res.json({ ok: true });
});

const ResetPasswordSchema = z.object({ newPassword: z.string().min(6).max(200) });

router.post('/:username/reset-password', async (req: Request, res: Response) => {
  const { username } = req.params;
  const parse = ResetPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères.' });
    return;
  }
  const user = get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`, [username]);
  if (!user) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return;
  }
  const hash = await bcrypt.hash(parse.data.newPassword, 12);
  run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, (user as any).id]);
  persistDB();
  res.json({ ok: true });
});

router.delete('/:username', (req: Request, res: Response) => {
  const { username } = req.params;
  if (username === req.user!.username) {
    res.status(400).json({ error: 'Impossible de supprimer son propre compte' });
    return;
  }
  run(`DELETE FROM users WHERE username = ? COLLATE NOCASE`, [username]);
  persistDB();
  res.json({ ok: true });
});

export default router;
