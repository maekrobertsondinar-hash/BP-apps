import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { run, get, persistDB } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/expiry', (req: Request, res: Response) => {
  const row = get<{ value: string; updated_by: string; updated_at: string }>(
    `SELECT value, updated_by, updated_at FROM settings WHERE key = 'expiry'`
  );

  if (!row) {
    res.json({ hasExpiry: false, expired: false, daysLeft: null, expiryDate: null, setBy: null, setDate: null });
    return;
  }

  const data = JSON.parse(row.value) as { expiryDate: string | null };
  if (!data.expiryDate) {
    res.json({ hasExpiry: false, expired: false, daysLeft: null, expiryDate: null, setBy: null, setDate: null });
    return;
  }

  const now = new Date();
  const expiry = new Date(data.expiryDate);
  expiry.setHours(23, 59, 59, 999);
  const msLeft = expiry.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  res.json({
    hasExpiry: true,
    expired: now > expiry,
    daysLeft,
    expiryDate: data.expiryDate,
    setBy: row.updated_by,
    setDate: row.updated_at,
  });
});

const ExpirySchema = z.object({
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)'),
});

router.put('/expiry', requireAdmin, (req: Request, res: Response) => {
  const parse = ExpirySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Données invalides' });
    return;
  }

  run(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES ('expiry', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    [JSON.stringify({ expiryDate: parse.data.expiryDate }), req.user!.username]
  );
  persistDB();
  res.json({ ok: true });
});

router.delete('/expiry', requireAdmin, (req: Request, res: Response) => {
  run(`DELETE FROM settings WHERE key = 'expiry'`);
  persistDB();
  res.json({ ok: true });
});

export default router;
