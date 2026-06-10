import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, run, get, persistDB } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req: Request, res: Response) => {
  const entries = query(
    `SELECT id, chantier, type, date, filename, mime_type, data, uploaded_by, uploaded_at
     FROM bordereau_entries ORDER BY uploaded_at DESC`
  );
  res.json(entries.map(e => ({
    id: e.id,
    chantier: e.chantier,
    type: e.type,
    date: e.date,
    filename: e.filename,
    mimeType: e.mime_type,
    data: e.data,
    uploadedBy: e.uploaded_by,
    uploadedAt: e.uploaded_at,
  })));
});

const EntrySchema = z.object({
  id: z.string().min(1).max(100),
  chantier: z.string().min(1).max(200),
  type: z.enum(['arrivee', 'depart']),
  date: z.string().min(1).max(50),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(100),
  data: z.string().min(1),
});

const ALLOWED_MIME = ['image/jpeg','image/png','image/webp','image/gif','image/bmp','application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

router.post('/', (req: Request, res: Response) => {
  const parse = EntrySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Données invalides' });
    return;
  }
  const e = parse.data;

  if (!ALLOWED_MIME.includes(e.mimeType)) {
    res.status(400).json({ error: 'Type MIME non autorisé' });
    return;
  }
  const b64 = e.data.split(',')[1] ?? '';
  if (b64.length * 0.75 > MAX_SIZE) {
    res.status(400).json({ error: 'Fichier trop volumineux (max 10 Mo)' });
    return;
  }

  run(
    `INSERT INTO bordereau_entries (id, chantier, type, date, filename, mime_type, data, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.id, e.chantier, e.type, e.date, e.filename, e.mimeType, e.data, req.user!.username]
  );
  persistDB();
  res.status(201).json({ ok: true });
});

router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  run(`DELETE FROM bordereau_entries WHERE id = ?`, [id]);
  persistDB();
  res.json({ ok: true });
});

export default router;
