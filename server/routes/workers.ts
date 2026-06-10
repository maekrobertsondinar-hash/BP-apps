import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, run, get, persistDB } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const WorkerSchema = z.object({
  matricule: z.string().min(1).max(50),
  nom: z.string().min(1).max(100),
  prenom: z.string().min(1).max(100),
  dateNaissance: z.string().max(20).default(''),
  fonction: z.string().max(200).default(''),
  dateEntree: z.string().max(20).default(''),
  dateFin: z.string().max(20).default(''),
  wilaya: z.string().max(100).default(''),
  affiliation: z.string().max(100).default(''),
  chantier: z.string().max(200).default(''),
  affair: z.string().max(200).default(''),
  numeroPermis: z.string().max(100).default(''),
  dateExpirationPermis: z.string().max(20).default(''),
  numeroBrevetMarch: z.string().max(100).default(''),
  dateExpirationBrevetMarch: z.string().max(20).default(''),
  numeroBrevetDang: z.string().max(100).default(''),
  dateExpirationBrevetDang: z.string().max(20).default(''),
  numeroBrevetPers: z.string().max(100).default(''),
  dateExpirationBrevetPers: z.string().max(20).default(''),
  docPermisUtilisation: z.string().max(10).default(''),
  docBrevetMarchUtilisation: z.string().max(10).default(''),
  docBrevetDangUtilisation: z.string().max(10).default(''),
  docBrevetPersUtilisation: z.string().max(10).default(''),
  createdBy: z.string().max(200).default(''),
  createdAt: z.string().max(50).default(''),
  lastModifiedBy: z.string().max(200).default(''),
  updatedAt: z.string().max(50).default(''),
  docPermis: z.string().optional(),
  docPermisFilename: z.string().max(500).optional(),
  docBrevetMarch: z.string().optional(),
  docBrevetMarchFilename: z.string().max(500).optional(),
  docBrevetDang: z.string().optional(),
  docBrevetDangFilename: z.string().max(500).optional(),
  docBrevetPers: z.string().optional(),
  docBrevetPersFilename: z.string().max(500).optional(),
});

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'application/pdf'];
const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024;

function validateDataURI(dataUri: string | undefined, fieldName: string): string | null {
  if (!dataUri) return null;
  const match = dataUri.match(/^data:([^;]+);base64,/);
  if (!match) return `${fieldName}: format de données invalide`;
  const mime = match[1];
  if (!ALLOWED_MIME_TYPES.includes(mime)) return `${fieldName}: type MIME non autorisé (${mime})`;
  const b64 = dataUri.split(',')[1] ?? '';
  if (b64.length * 0.75 > MAX_DOC_SIZE_BYTES) return `${fieldName}: fichier trop volumineux (max 10 Mo)`;
  return null;
}

function rowToWorker(row: Record<string, unknown>, docs: Record<string, unknown>[] = []): Record<string, unknown> {
  const w: Record<string, unknown> = {
    matricule: row.matricule,
    nom: row.nom,
    prenom: row.prenom,
    dateNaissance: row.date_naissance ?? '',
    fonction: row.fonction ?? '',
    dateEntree: row.date_entree ?? '',
    dateFin: row.date_fin ?? '',
    wilaya: row.wilaya ?? '',
    affiliation: row.affiliation ?? '',
    chantier: row.chantier ?? '',
    affair: row.affair ?? '',
    numeroPermis: row.numero_permis ?? '',
    dateExpirationPermis: row.date_expiration_permis ?? '',
    numeroBrevetMarch: row.numero_brevet_march ?? '',
    dateExpirationBrevetMarch: row.date_expiration_brevet_march ?? '',
    numeroBrevetDang: row.numero_brevet_dang ?? '',
    dateExpirationBrevetDang: row.date_expiration_brevet_dang ?? '',
    numeroBrevetPers: row.numero_brevet_pers ?? '',
    dateExpirationBrevetPers: row.date_expiration_brevet_pers ?? '',
    docPermisUtilisation: row.doc_permis_utilisation ?? '',
    docBrevetMarchUtilisation: row.doc_brevet_march_utilisation ?? '',
    docBrevetDangUtilisation: row.doc_brevet_dang_utilisation ?? '',
    docBrevetPersUtilisation: row.doc_brevet_pers_utilisation ?? '',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at ?? '',
    lastModifiedBy: row.last_modified_by ?? '',
    updatedAt: row.updated_at ?? '',
  };

  for (const doc of docs) {
    const type = doc.doc_type as string;
    w[type] = doc.data;
    w[type + 'Filename'] = doc.filename;
  }

  return w;
}

router.get('/', (req: Request, res: Response) => {
  const workers = query(`SELECT * FROM workers ORDER BY nom, prenom`);
  const docs = query(`SELECT worker_matricule, doc_type, data, filename FROM documents`);

  const docsByWorker: Record<string, Record<string, unknown>[]> = {};
  for (const doc of docs) {
    const m = doc.worker_matricule as string;
    if (!docsByWorker[m]) docsByWorker[m] = [];
    docsByWorker[m].push(doc);
  }

  const result = workers.map(w =>
    rowToWorker(w, docsByWorker[w.matricule as string] ?? [])
  );

  res.json(result);
});

router.get('/:matricule', (req: Request, res: Response) => {
  const { matricule } = req.params;
  const worker = get(`SELECT * FROM workers WHERE matricule = ?`, [matricule]);
  if (!worker) {
    res.status(404).json({ error: 'Travailleur introuvable' });
    return;
  }
  const docs = query(`SELECT doc_type, data, filename FROM documents WHERE worker_matricule = ?`, [matricule]);
  res.json(rowToWorker(worker, docs));
});

router.post('/', async (req: Request, res: Response) => {
  const parse = WorkerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Données invalides', details: parse.error.issues });
    return;
  }
  const w = parse.data;

  for (const [field, val] of Object.entries({ docPermis: w.docPermis, docBrevetMarch: w.docBrevetMarch, docBrevetDang: w.docBrevetDang, docBrevetPers: w.docBrevetPers })) {
    const err = validateDataURI(val as string | undefined, field);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const existing = get(`SELECT matricule FROM workers WHERE matricule = ?`, [w.matricule]);
  if (existing) {
    res.status(409).json({ error: 'Ce matricule existe déjà' });
    return;
  }

  run(
    `INSERT INTO workers (
      matricule,nom,prenom,date_naissance,fonction,date_entree,date_fin,
      wilaya,affiliation,chantier,affair,
      numero_permis,date_expiration_permis,
      numero_brevet_march,date_expiration_brevet_march,
      numero_brevet_dang,date_expiration_brevet_dang,
      numero_brevet_pers,date_expiration_brevet_pers,
      doc_permis_utilisation,doc_brevet_march_utilisation,doc_brevet_dang_utilisation,doc_brevet_pers_utilisation,
      created_by,created_at,last_modified_by,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      w.matricule,w.nom,w.prenom,w.dateNaissance,w.fonction,w.dateEntree,w.dateFin,
      w.wilaya,w.affiliation,w.chantier,w.affair,
      w.numeroPermis,w.dateExpirationPermis,
      w.numeroBrevetMarch,w.dateExpirationBrevetMarch,
      w.numeroBrevetDang,w.dateExpirationBrevetDang,
      w.numeroBrevetPers,w.dateExpirationBrevetPers,
      w.docPermisUtilisation,w.docBrevetMarchUtilisation,w.docBrevetDangUtilisation,w.docBrevetPersUtilisation,
      w.createdBy,w.createdAt,w.lastModifiedBy,w.updatedAt,
    ]
  );

  upsertDocs(w, req.user!.username);
  persistDB();
  res.status(201).json({ ok: true });
});

router.put('/:matricule', async (req: Request, res: Response) => {
  const { matricule } = req.params;
  const parse = WorkerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Données invalides' });
    return;
  }
  const w = parse.data;

  for (const [field, val] of Object.entries({ docPermis: w.docPermis, docBrevetMarch: w.docBrevetMarch, docBrevetDang: w.docBrevetDang, docBrevetPers: w.docBrevetPers })) {
    const err = validateDataURI(val as string | undefined, field);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const existing = get(`SELECT matricule FROM workers WHERE matricule = ?`, [matricule]);
  if (!existing) {
    res.status(404).json({ error: 'Travailleur introuvable' });
    return;
  }

  if (w.matricule !== matricule) {
    const conflict = get(`SELECT matricule FROM workers WHERE matricule = ?`, [w.matricule]);
    if (conflict) {
      res.status(409).json({ error: 'Ce matricule est déjà attribué' });
      return;
    }
    run(`UPDATE documents SET worker_matricule = ? WHERE worker_matricule = ?`, [w.matricule, matricule]);
    run(`DELETE FROM workers WHERE matricule = ?`, [matricule]);
    run(
      `INSERT INTO workers (
        matricule,nom,prenom,date_naissance,fonction,date_entree,date_fin,
        wilaya,affiliation,chantier,affair,
        numero_permis,date_expiration_permis,
        numero_brevet_march,date_expiration_brevet_march,
        numero_brevet_dang,date_expiration_brevet_dang,
        numero_brevet_pers,date_expiration_brevet_pers,
        doc_permis_utilisation,doc_brevet_march_utilisation,doc_brevet_dang_utilisation,doc_brevet_pers_utilisation,
        created_by,created_at,last_modified_by,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        w.matricule,w.nom,w.prenom,w.dateNaissance,w.fonction,w.dateEntree,w.dateFin,
        w.wilaya,w.affiliation,w.chantier,w.affair,
        w.numeroPermis,w.dateExpirationPermis,
        w.numeroBrevetMarch,w.dateExpirationBrevetMarch,
        w.numeroBrevetDang,w.dateExpirationBrevetDang,
        w.numeroBrevetPers,w.dateExpirationBrevetPers,
        w.docPermisUtilisation,w.docBrevetMarchUtilisation,w.docBrevetDangUtilisation,w.docBrevetPersUtilisation,
        w.createdBy,w.createdAt,w.lastModifiedBy,w.updatedAt,
      ]
    );
  } else {
    run(
      `UPDATE workers SET
        nom=?,prenom=?,date_naissance=?,fonction=?,date_entree=?,date_fin=?,
        wilaya=?,affiliation=?,chantier=?,affair=?,
        numero_permis=?,date_expiration_permis=?,
        numero_brevet_march=?,date_expiration_brevet_march=?,
        numero_brevet_dang=?,date_expiration_brevet_dang=?,
        numero_brevet_pers=?,date_expiration_brevet_pers=?,
        doc_permis_utilisation=?,doc_brevet_march_utilisation=?,doc_brevet_dang_utilisation=?,doc_brevet_pers_utilisation=?,
        created_by=?,created_at=?,last_modified_by=?,updated_at=?
      WHERE matricule=?`,
      [
        w.nom,w.prenom,w.dateNaissance,w.fonction,w.dateEntree,w.dateFin,
        w.wilaya,w.affiliation,w.chantier,w.affair,
        w.numeroPermis,w.dateExpirationPermis,
        w.numeroBrevetMarch,w.dateExpirationBrevetMarch,
        w.numeroBrevetDang,w.dateExpirationBrevetDang,
        w.numeroBrevetPers,w.dateExpirationBrevetPers,
        w.docPermisUtilisation,w.docBrevetMarchUtilisation,w.docBrevetDangUtilisation,w.docBrevetPersUtilisation,
        w.createdBy,w.createdAt,w.lastModifiedBy,w.updatedAt,
        matricule,
      ]
    );
  }

  upsertDocs(w, req.user!.username);
  persistDB();
  res.json({ ok: true, matricule: w.matricule });
});

router.delete('/:matricule', requireAdmin, (req: Request, res: Response) => {
  const { matricule } = req.params;
  const existing = get(`SELECT matricule FROM workers WHERE matricule = ?`, [matricule]);
  if (!existing) {
    res.status(404).json({ error: 'Travailleur introuvable' });
    return;
  }
  run(`DELETE FROM documents WHERE worker_matricule = ?`, [matricule]);
  run(`DELETE FROM workers WHERE matricule = ?`, [matricule]);
  persistDB();
  res.json({ ok: true });
});

router.delete('/', requireAdmin, (req: Request, res: Response) => {
  run(`DELETE FROM documents`);
  run(`DELETE FROM workers`);
  persistDB();
  res.json({ ok: true });
});

router.delete('/:matricule/documents/:docType', requireAdmin, (req: Request, res: Response) => {
  const { matricule, docType } = req.params;
  const allowed = ['docPermis','docBrevetMarch','docBrevetDang','docBrevetPers'];
  if (!allowed.includes(docType as string)) {
    res.status(400).json({ error: 'Type de document invalide' });
    return;
  }
  run(`DELETE FROM documents WHERE worker_matricule = ? AND doc_type = ?`, [matricule, docType]);
  persistDB();
  res.json({ ok: true });
});

router.post('/batch', async (req: Request, res: Response) => {
  const workers = req.body?.workers;
  if (!Array.isArray(workers)) {
    res.status(400).json({ error: 'Format invalide' });
    return;
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const raw of workers) {
    const parse = WorkerSchema.safeParse(raw);
    if (!parse.success) {
      errors.push(`Matricule ${raw?.matricule ?? '?'}: données invalides`);
      continue;
    }
    const w = parse.data;
    const existing = get(`SELECT matricule FROM workers WHERE matricule = ?`, [w.matricule]);

    if (existing) {
      run(
        `UPDATE workers SET
          nom=?,prenom=?,date_naissance=?,fonction=?,date_entree=?,date_fin=?,
          wilaya=?,affiliation=?,chantier=?,affair=?,
          numero_permis=?,date_expiration_permis=?,
          numero_brevet_march=?,date_expiration_brevet_march=?,
          numero_brevet_dang=?,date_expiration_brevet_dang=?,
          numero_brevet_pers=?,date_expiration_brevet_pers=?,
          doc_permis_utilisation=?,doc_brevet_march_utilisation=?,doc_brevet_dang_utilisation=?,doc_brevet_pers_utilisation=?,
          created_by=?,created_at=?,last_modified_by=?,updated_at=?
        WHERE matricule=?`,
        [
          w.nom,w.prenom,w.dateNaissance,w.fonction,w.dateEntree,w.dateFin,
          w.wilaya,w.affiliation,w.chantier,w.affair,
          w.numeroPermis,w.dateExpirationPermis,
          w.numeroBrevetMarch,w.dateExpirationBrevetMarch,
          w.numeroBrevetDang,w.dateExpirationBrevetDang,
          w.numeroBrevetPers,w.dateExpirationBrevetPers,
          w.docPermisUtilisation,w.docBrevetMarchUtilisation,w.docBrevetDangUtilisation,w.docBrevetPersUtilisation,
          w.createdBy,w.createdAt,w.lastModifiedBy,w.updatedAt,
          w.matricule,
        ]
      );
      updated++;
    } else {
      run(
        `INSERT INTO workers (
          matricule,nom,prenom,date_naissance,fonction,date_entree,date_fin,
          wilaya,affiliation,chantier,affair,
          numero_permis,date_expiration_permis,
          numero_brevet_march,date_expiration_brevet_march,
          numero_brevet_dang,date_expiration_brevet_dang,
          numero_brevet_pers,date_expiration_brevet_pers,
          doc_permis_utilisation,doc_brevet_march_utilisation,doc_brevet_dang_utilisation,doc_brevet_pers_utilisation,
          created_by,created_at,last_modified_by,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          w.matricule,w.nom,w.prenom,w.dateNaissance,w.fonction,w.dateEntree,w.dateFin,
          w.wilaya,w.affiliation,w.chantier,w.affair,
          w.numeroPermis,w.dateExpirationPermis,
          w.numeroBrevetMarch,w.dateExpirationBrevetMarch,
          w.numeroBrevetDang,w.dateExpirationBrevetDang,
          w.numeroBrevetPers,w.dateExpirationBrevetPers,
          w.docPermisUtilisation,w.docBrevetMarchUtilisation,w.docBrevetDangUtilisation,w.docBrevetPersUtilisation,
          w.createdBy,w.createdAt,w.lastModifiedBy,w.updatedAt,
        ]
      );
      created++;
    }
    upsertDocs(w, req.user!.username);
  }

  persistDB();
  res.json({ ok: true, created, updated, errors });
});

function upsertDocs(w: z.infer<typeof WorkerSchema>, uploadedBy: string): void {
  const docs: Array<{ type: string; data?: string; filename?: string }> = [
    { type: 'docPermis', data: w.docPermis, filename: w.docPermisFilename },
    { type: 'docBrevetMarch', data: w.docBrevetMarch, filename: w.docBrevetMarchFilename },
    { type: 'docBrevetDang', data: w.docBrevetDang, filename: w.docBrevetDangFilename },
    { type: 'docBrevetPers', data: w.docBrevetPers, filename: w.docBrevetPersFilename },
  ];

  for (const { type, data, filename } of docs) {
    if (data === undefined) continue;
    if (!data) {
      run(`DELETE FROM documents WHERE worker_matricule = ? AND doc_type = ?`, [w.matricule, type]);
    } else {
      const mime = data.match(/^data:([^;]+);/)?.[1] ?? 'application/octet-stream';
      run(
        `INSERT INTO documents (worker_matricule, doc_type, filename, mime_type, data, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(worker_matricule, doc_type) DO UPDATE SET
           filename=excluded.filename, mime_type=excluded.mime_type,
           data=excluded.data, uploaded_by=excluded.uploaded_by,
           uploaded_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
        [w.matricule, type, filename ?? `${type}.${mime.split('/')[1] ?? 'bin'}`, mime, data, uploadedBy]
      );
    }
  }
}

export default router;
