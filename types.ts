
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
  docPermis?: string;
  docPermisFilename?: string;
  docBrevetMarch?: string;
  docBrevetMarchFilename?: string;
  docBrevetDang?: string;
  docBrevetDangFilename?: string;
  docBrevetPers?: string;
  docBrevetPersFilename?: string;
  numeroBrevet?: string;
  dateExpirationBrevet?: string;
  numeroPermis?: string;
  dateExpirationPermis?: string;
  numeroBrevetMarch?: string;
  dateExpirationBrevetMarch?: string;
  numeroBrevetDang?: string;
  dateExpirationBrevetDang?: string;
  numeroBrevetPers?: string;
  dateExpirationBrevetPers?: string;
  docPermisUtilisation?: string;
  docBrevetMarchUtilisation?: string;
  docBrevetDangUtilisation?: string;
  docBrevetPersUtilisation?: string;
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
  mimeType: string;
  data: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export interface BulkImportConfig {
  docType: 'docPermis' | 'docBrevetMarch' | 'docBrevetDang' | 'docBrevetPers';
  title: string;
}
