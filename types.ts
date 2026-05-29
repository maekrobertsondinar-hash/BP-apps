
export interface Worker {
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  fonction: string;
  dateEntree: string;
  dateFin: string;
  wilaya: string;
  affiliation: string;
  chantier?: string;
  affair?: string;
  // Documents — stored as base64 data URIs (image or PDF)
  docPermis?: string;
  docPermisFilename?: string;
  docBrevetMarch?: string;
  docBrevetMarchFilename?: string;
  docBrevetDang?: string;
  docBrevetDangFilename?: string;
  docBrevetPers?: string;
  docBrevetPersFilename?: string;
  // Legacy shared fields (kept for backward compat)
  numeroBrevet?: string;
  dateExpirationBrevet?: string;
  // Per-section numero + date d'expiration
  numeroPermis?: string;
  dateExpirationPermis?: string;
  numeroBrevetMarch?: string;
  dateExpirationBrevetMarch?: string;
  numeroBrevetDang?: string;
  dateExpirationBrevetDang?: string;
  numeroBrevetPers?: string;
  dateExpirationBrevetPers?: string;
  // Utilisation Status ('OUI' | 'NON')
  docPermisUtilisation?: string;
  docBrevetMarchUtilisation?: string;
  docBrevetDangUtilisation?: string;
  docBrevetPersUtilisation?: string;
  // Audit Trail
  createdBy?: string;
  createdAt?: string;
  lastModifiedBy?: string;
  updatedAt?: string;
}

export interface User {
  username: string;
  fullName: string;
  password: string;
  role: 'ADMIN' | 'USER';
  status: 'PENDING' | 'APPROVED';
}

export type ModalType = 'ADD' | 'EDIT' | 'IMPORT' | 'CONFIRM_DELETE' | 'CONFIRM_CLEAR' | 'BULK_DOC_IMPORT' | 'ADD_USER' | null;
export type ViewType = 'search' | 'mass_search' | 'records' | 'users' | 'bordereau';

export interface BordereauEntry {
  id: string;
  chantier: string;
  type: 'arrivee' | 'depart';
  date: string;
  filename: string;
  data: string;
  mimeType: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export interface BulkImportConfig {
  docType: 'docBrevetMarch' | 'docBrevetDang' | 'docBrevetPers';
  title: string;
}
