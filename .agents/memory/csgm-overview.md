---
name: CSGM AMROUS App Overview
description: Full feature inventory of the CSGM AMROUS personnel management app — architecture, auth, key decisions, and component responsibilities.
---

# CSGM AMROUS — Gestion Materiel HMD

## Stack
- **Frontend**: React 19 + Vite 6 + TypeScript, Tailwind CSS (CDN), Framer Motion, Lucide React, xlsx, JSZip. Port 5000 (Vite dev).
- **Backend**: Express on port 3001, sql.js (server-side SQLite), bcryptjs (cost 12), JWT (15min access + 7d refresh, httpOnly cookies), helmet, cors, express-rate-limit, cookie-parser, zod.
- **Two workflows**: "Start application" (npm run dev / Vite port 5000) and "Start server" (npm run dev:api / tsx server/index.ts port 3001, no waitForPort).
- Vite proxies /api → localhost:3001.

## Security Architecture (completed overhaul)
- All passwords hashed server-side with bcrypt cost 12; no client-side password storage.
- JWT httpOnly cookies: 15min access token + 7d refresh token (auto-refreshed by middleware).
- Rate limiting on /api/auth/* routes (10 req/15min, validate:false to avoid IPv6 check error).
- RBAC enforced server-side (requireAuth, requireAdmin middlewares).
- Data URI validation on all document uploads (max 10MB, allowed MIME types only).
- utils/crypto.ts is a stub (encrypt/decrypt return identity — crypto no longer used).
- No hardcoded passwords or secrets anywhere.

## Auth & Users
- Login: Nom / Prénom fields + Mot de passe → POST /api/auth/login → JWT cookies.
- Session restore: GET /api/auth/me on mount (isAuthChecked flag gates render).
- Roles: ADMIN and USER. New accounts require admin approval (PENDING status).
- First-run admin: "AMROUS Abdallah" with random 12-char password printed to console + data/admin-setup.txt.
- JWT secrets auto-generated to data/.secrets.json (mode 0o600, gitignored).
- DB persisted to data/csgm.db.

## Render Guard Order (App.tsx)
1. `!isAuthChecked` → spinning loading screen (waits for /api/auth/me)
2. `!currentUser` → AuthScreen (login form)
3. `!isDbReady` → DB loading screen (waits for /api/workers)
4. Main app

## Data Model (types.ts)
Each Worker has:
- Base info: matricule, nom, prénom, fonction, chantier, affair, wilaya, affiliation, dates
- 4 brevet sections: Permis de Conduire, Brevet Marchandises, Brevet Matières Dangereuses, Brevet Personnel
  - Each section: docXxx (base64), docXxxFilename, docXxxUtilisation, numeroXxx, dateExpirationXxx
- Audit: createdBy, createdAt, lastModifiedBy, updatedAt

## API Routes
- POST /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/refresh, /api/auth/verify-password
- GET|POST /api/workers, GET|PUT|DELETE /api/workers/:matricule, POST /api/workers/batch, DELETE /api/workers/:matricule/documents/:docType, DELETE /api/workers
- GET|POST /api/users, PUT /api/users/:username/approve, PUT /api/users/:username/role, POST /api/users/:username/reset-password, DELETE /api/users/:username
- GET|POST /api/bordereau, DELETE /api/bordereau/:id
- GET|POST /api/settings/expiry (admin only)

## WorkerForm (WorkerForm.tsx)
- 4 brevet blocks only shown if fonction contains CHAUFFEUR or GRUTIER
- Uploads: all formats except Excel/csv and .db/.sqlite
- Images compressed via canvas JPEG 0.75 max 1200px; PDFs stored raw base64

## Exports
- Filtre de Masse → Export Excel: filtered results
- Sidebar → Export Excel (.xlsx): all eligible workers
- Sidebar → Export Complet (.zip):
  - brevets/ + excel/ + collaborateurs/ + database/ (JSON snapshot — NOT SQLite, CDN removed)
  - Bordereau entries fetched from /api/bordereau (no more localStorage)

## Import (ImportModal.tsx)
- Accepts .xlsx, .xls, .csv, .json (CDN sql.js removed — no longer accepts .db files)
- Admin password verified via POST /api/auth/verify-password (no client-side decrypt)

## Password Guard (Destructive Actions)
- All guarded actions use POST /api/auth/verify-password (server-side bcrypt check)

## Expiry / Licence System
- utils/expiry.ts: getExpiryInfoFromServer() calls GET /api/settings/expiry
- components/ExpiryPanel.tsx: admin sets expiry via POST /api/settings/expiry
- Expired screen: full-screen lock for non-admin users only

## Bordereau d'Envoi
- State persisted server-side via /api/bordereau
- ZIP Import/Export, audit log (admin only)

## Persistence
- Workers: server-side SQLite (data/csgm.db), mirrored in React state
- Users: server-side SQLite
- Auto-save feedback: toast after each API write

## db.ts Helper Notes
- query/run/get accept `unknown[]` params with `as any` cast for sql.js BindParams
- server binds to 0.0.0.0:3001 (not 127.0.0.1) so workflow monitor can detect the port
- "Start server" workflow configured without waitForPort (port detection unreliable in Replit for console-type workflows)
