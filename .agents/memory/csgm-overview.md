---
name: CSGM AMROUS App Overview
description: Full feature inventory of the CSGM AMROUS personnel management app — what has been built, key decisions, and component responsibilities.
---

# CSGM AMROUS — Gestion Materiel HMD

## Stack
- React 19 + Vite 6 + TypeScript, Tailwind CSS (CDN), IndexedDB (workers), localStorage (users), sql.js (SQLite), JSZip, xlsx. Port 5000.

## Auth & Users
- Login: Nom / Prénom / Mot de passe (separate fields)
- Roles: ADMIN and standard user
- Passwords: XOR + base64 encryption (`utils/crypto.ts`, key `CSGM_AMROUS_2024_SEC`)
- Default admin: AMROUS Abdallah / 13062010
- New accounts require admin approval before login (PENDING status)
- User management view in sidebar: add, delete, approve

## Data Model (types.ts)
Each Worker has:
- Base info: matricule, nom, prénom, fonction, chantier, affair, wilaya, affiliation, dates
- 4 brevet sections: Permis de Conduire, Brevet Marchandises, Brevet Matières Dangereuses, Brevet Personnel
  - Each section: docXxx (base64), docXxxFilename, docXxxUtilisation (OUI/NON), numeroXxx, dateExpirationXxx
- Audit: createdBy, createdAt, lastModifiedBy, updatedAt

## WorkerForm (WorkerForm.tsx)
- 4 brevet blocks only shown if fonction contains CHAUFFEUR or GRUTIER
- Uploads: all formats except Excel (.xlsx/.xls/.csv) and .db/.sqlite
- Images compressed via canvas JPEG 0.75 max 1200px; PDFs stored raw base64
- Autocomplete on Fonction and Chantier fields

## Search & Display
- By matricule: full dossier with audit trail
- By nom/prénom: list with navigation
- Filtre de Masse: filters by fonction, chantier, user + advanced brevet/expiry filters
- Advanced filters per section: possession / utilisation / expiration (Valide / Expiré)
- Month/Year brevet expiry filter: two dropdowns (Mois + Année), independent of other filters, matches ANY brevet expiring that period; state: massSearchBrevetMonth / massSearchBrevetYear
- Active filter tags with individual removal, "Total trouvé" counter
- DocumentPreview cards: badge N°, colored expiry date (green=valid / red=expired), colored border, Voir/Télécharger/Supprimer buttons

## DocViewer (DocViewer.tsx)
- Full-screen modal z-index 300, black background
- Images: native display with cursor: zoom-out
- PDFs: iframe with native browser viewer
- Toolbar: doc name + original filename + Print + Download buttons
- Print: opens new window and triggers window.print()
- Close on background click or ✕ button

## Password Guard (Destructive Actions)
- Delete worker: password field embedded in confirm popup
- Clear database: password field embedded in confirm popup
- Delete brevet doc: dedicated pwdGuard popup with show/hide password
- Import/replace .db: admin_password step in ImportModal.tsx

## Exports
- Filtre de Masse → Export Excel: exports current filtered results
- Filtre de Masse → Export Dossiers (.zip): workers with brevets only
  - ZIP: RH_Chauffeurs.xlsx at root + one folder per worker (NOM_PRENOM_MAT/INFO.txt + brevets)
  - INFO.txt includes [EXPIRÉ] status on past dates
- Sidebar → Export Excel (.xlsx): all eligible workers (CHAUFFEUR/GRUTIER or has any brevet)
- Sidebar → Export Complet (.zip) — CSGM_Export_Complet_DD-MM-YYYY.zip:
  - brevets/{Permis_de_Conduire, Brevet_Marchandises, Brevet_Matieres_Dangereuses, Brevet_Personnel}/
  - excel/RH_Global_DD-MM-YYYY.xlsx (tabs: "Chauffeurs & Grutiers" + "Brevets Expirés")
  - database/RH_Database_DD-MM-YYYY.db (real SQLite via sql.js)
  - collaborateurs/NOM_PRENOM_MAT/INFO.txt + named brevet files
- Eligibility filter: fonction contains CHAUFFEUR or GRUTIER, OR has at least one brevet document

## Import (ImportModal.tsx)
- Accepts .db, .sqlite, .sqlite3, .db3
- Auto-detects table name (workers, travailleurs, personnel, etc.)
- Flexible column mapping (multiple possible names per field)
- Mandatory admin password confirmation before replacing data

## Bulk Doc Import (BulkDocImportModal.tsx)
- Import multiple images at once for one brevet type
- Auto-maps by matricule extracted from filename
- Can create new workers on the fly if matricule not found
- Automatic audit trail with (AUTOMATED) tag

## Bordereau d'Envoi
- Multi-select rebuilt at chantier level (not entry level)
- Chantier cards: clickable with red ring/glow + checkmark badge
- Red "Supprimer (N)" button in multi-select bar; per-chantier delete hidden during select mode
- ZIP Import: accepts previously exported .zip, parses {chantierName}/{Arrivee|Depart}_{YYYY-MM-DD}_{HHhMM}_{filename}, merges/deduplicates, restores hidden chantiers
- Audit Log (admin only): amber "Journal" button → full-screen modal, sorted newest first
  - Columns: Date Upload · Uploadé par · Chantier · Type · Fichier · Date Doc.
  - BordereauEntry extended with uploadedBy? and uploadedAt? fields
  - Legacy entries (no user info) show —
  - Footer: count of tracked vs total entries

## Expiry / Licence System
- utils/expiry.ts: getLicenseData, saveLicenseData, clearLicense, getExpiryInfo, touchLastKnownTime
  - Tamper-detection: stores last known time, rejects clock roll-backs
  - Encrypted in localStorage under key csgm_lic_v1 (XOR)
- components/ExpiryPanel.tsx: admin-only panel, set by exact date or number of days, shows status/days remaining
- App.tsx integration: Ctrl+Shift+F12 to open panel, checks expiry on load, touches time
- Expired screen: full-screen lock for non-admin users only (ADMIN role bypasses completely)
- Expired screen shows contact card: AMROUS Abdallah, phone 06 99 40 70 36
- Warning banner shown when ≤14 days remain

## Credits / Branding
- APP_CREDITS: "Application créée par AMROUS Ayham" (updated from "AMROUS Ayham Bachir")
- Used in: App.tsx, components/AuthScreen.tsx, components/ImportModal.tsx
- Sidebar footer: "By AMROUS Ayham"
- Expired modal: only AMROUS Abdallah contact card (creator card removed)

## Persistence
- Workers: IndexedDB key gtp_rh_workers_data
- Users: localStorage key gtp_rh_users
- Auto-save on every workers change; toast "Sauvegardé" with last-save time
