
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Worker, ModalType, ViewType, User, BulkImportConfig, BordereauEntry } from './types';
import { INITIAL_WORKERS, JOB_FUNCTIONS, INITIAL_USERS } from './constants';
import WorkerForm from './components/WorkerForm';
import ImportModal from './components/ImportModal';
import BulkDocImportModal from './components/BulkDocImportModal';
import AuthScreen from './components/AuthScreen';
import BordereauEnvoi from './components/BordereauEnvoi';
import DocViewer from './components/DocViewer';
import ExpiryPanel from './components/ExpiryPanel';
import { getExpiryInfo, touchLastKnownTime } from './utils/expiry';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { encrypt, decrypt } from './utils/crypto';

const APP_CREDITS = "Application créée par AMROUS Ayham — Propriété de AMROUS Abdallah";

// Accès global à initSqlJs chargé via le script dans index.html
declare var initSqlJs: any;

const STORAGE_KEY = 'gtp_rh_workers_data';
const USERS_STORAGE_KEY = 'gtp_rh_users';

// --- INDEXEDDB HELPERS ---
const DB_NAME = 'GTP_RH_DB';
const DB_VERSION = 1;
const STORE_NAME = 'workers';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'matricule' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const loadWorkersFromDB = async (): Promise<Worker[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("Error opening DB for read", e);
    return [];
  }
};

const saveWorkersToDB = async (workers: Worker[]) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Clear and bulk put is robust for syncing array state to IDB
    const clearRequest = store.clear();
    
    clearRequest.onsuccess = () => {
        workers.forEach(w => store.put(w));
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * COMPOSANTS AUXILIAIRES
 */

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex border-b border-gray-200 py-2.5 last:border-0 group">
    <div className="w-2/5 text-gray-500 font-medium text-[10px] uppercase tracking-widest pt-0.5">{label}</div>
    <div className="w-3/5 text-gray-800 font-semibold text-sm">{value || <span className="text-gray-300 italic font-normal">—</span>}</div>
  </div>
);

interface DocViewerState {
  data: string;
  label: string;
  filename: string;
}

interface DocumentPreviewProps {
  label: string;
  data?: string;
  filename: string;
  originalFilename?: string;
  field: keyof Worker;
  onDownload: (data: string, filename: string) => void;
  onRemove: (field: keyof Worker) => void;
  onView: (state: DocViewerState) => void;
  isReadOnly?: boolean;
  numero?: string;
  dateExpiration?: string;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  label, data, filename, originalFilename, field,
  onDownload, onRemove, onView, isReadOnly = false,
  numero, dateExpiration
}) => {
  const today = new Date().toISOString().split('T')[0];
  const isPdf = data?.startsWith('data:application/pdf');
  const isExpired = dateExpiration && dateExpiration < today;
  const isValid = dateExpiration && dateExpiration >= today;

  return (
    <div className={`flex flex-col gap-3 p-4 bg-white border rounded-2xl transition-all duration-200 relative group h-full hover:border-white/12 ${isExpired ? 'border-red-300 ring-1 ring-red-100' : isValid ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest leading-tight">{label}</span>
        {dateExpiration && (
          <span className={`shrink-0 text-[8px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wide ${isExpired ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
            {isExpired ? '⚠ Expiré' : '✓ Valide'}
          </span>
        )}
      </div>

      {(numero || dateExpiration) && (
        <div className="flex flex-wrap gap-1.5 text-[9px]">
          {numero && <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-lg font-semibold text-gray-500">N° {numero}</span>}
          {dateExpiration && <span className={`px-2 py-0.5 rounded-lg font-semibold border ${isExpired ? 'bg-red-50 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-emerald-600'}`}>{dateExpiration}</span>}
        </div>
      )}

      {data ? (
        <div className="flex flex-col gap-2.5 flex-1">
          <button
            type="button"
            onClick={() => onView({ data, label, filename: originalFilename || filename })}
            className="w-full h-40 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 cursor-pointer transition-all relative hover:shadow-md"
          >
            {isPdf ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-50">
                <svg className="w-9 h-9 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 13h8v1H8v-1zm0 3h6v1H8v-1zm0-6h3v1H8v-1z"/></svg>
                <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">PDF</span>
                {originalFilename && <span className="text-[8px] text-gray-500 px-2 text-center truncate max-w-full">{originalFilename}</span>}
              </div>
            ) : (
              <img src={data} className="w-full h-full object-cover" alt={label} />
            )}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-all duration-150">
              <span className="bg-white/15 text-white text-[9px] font-semibold uppercase px-3 py-1.5 rounded-lg shadow-sm border border-white/20">Voir</span>
            </div>
          </button>

          {originalFilename && !isPdf && (
            <span className="text-[9px] text-gray-500 text-center truncate">{originalFilename}</span>
          )}

          <div className="flex gap-1.5 mt-auto">
            <button type="button" onClick={() => onView({ data, label, filename: originalFilename || filename })}
              className="btn-press flex-1 bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-semibold text-[9px] py-2 rounded-lg transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              Voir
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(data, originalFilename || filename); }}
              className="btn-press flex-1 bg-gray-100 hover:bg-gray-100 text-gray-700 font-semibold text-[9px] py-2 rounded-lg transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              DL
            </button>
            {!isReadOnly && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(field); }}
                className="btn-press bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 font-bold text-[9px] px-2.5 py-2 rounded-lg transition-colors">
                ✕
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-6 gap-2 rounded-xl border-2 border-dashed border-gray-200">
          <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">Non renseigné</span>
        </div>
      )}
    </div>
  );
};

// Interface pour le filtre avancé
interface AdvancedFilterState {
  isActive: boolean;
  aucunBrevet: boolean;
  avecBrevet: boolean;
  march: 'ALL' | 'OUI' | 'NON' | 'HAS';
  dang: 'ALL' | 'OUI' | 'NON' | 'HAS';
  pers: 'ALL' | 'OUI' | 'NON' | 'HAS';
  expirationPermis: 'ALL' | 'VALID' | 'EXPIRED';
  expirationMarch: 'ALL' | 'VALID' | 'EXPIRED';
  expirationDang: 'ALL' | 'VALID' | 'EXPIRED';
  expirationPers: 'ALL' | 'VALID' | 'EXPIRED';
}

const INITIAL_ADVANCED_FILTERS: AdvancedFilterState = {
  isActive: false,
  aucunBrevet: false,
  avecBrevet: false,
  march: 'ALL',
  dang: 'ALL',
  pers: 'ALL',
  expirationPermis: 'ALL',
  expirationMarch: 'ALL',
  expirationDang: 'ALL',
  expirationPers: 'ALL',
};

const App: React.FC = () => {
  // --- AUTHENTICATION STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(USERS_STORAGE_KEY);
    if (saved) {
      try {
        const parsed: User[] = JSON.parse(saved);
        // Migrate: add status field if missing, encrypt plaintext passwords
        return parsed.map(u => {
          const migrated = { ...u };
          if (!migrated.status) {
            migrated.status = migrated.role === 'ADMIN' ? 'APPROVED' : 'APPROVED';
          }
          // Detect if password is plaintext (not valid base64 encrypted) and encrypt it
          try {
            const dec = decrypt(migrated.password);
            // If decrypting gives back the same value, it's likely already encrypted
            // Simple heuristic: check if it looks like base64
            if (!/^[A-Za-z0-9+/=]+$/.test(migrated.password) || migrated.password.length < 4) {
              migrated.password = encrypt(migrated.password);
            }
          } catch {
            migrated.password = encrypt(migrated.password);
          }
          return migrated;
        });
      } catch { return INITIAL_USERS; }
    }
    return INITIAL_USERS;
  });

  // Admin user management state
  const [newUserName, setNewUserName] = useState('');
  const [newUserSurname, setNewUserSurname] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'USER' | 'ADMIN'>('USER');
  const [newUserError, setNewUserError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isDbReady, setIsDbReady] = useState(false);

  const [currentView, setCurrentView] = useState<ViewType>('search');
  const [showIntro, setShowIntro] = useState<boolean>(() => !localStorage.getItem('csgm_intro_seen'));
  const [searchMode, setSearchMode] = useState<'id' | 'name'>('id');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Worker | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchNom, setSearchNom] = useState('');
  const [searchPrenom, setSearchPrenom] = useState('');
  const [nameSearchResults, setNameSearchResults] = useState<Worker[]>([]);
  const [hasSearchedByName, setHasSearchedByName] = useState(false);
  const [massSearchChantier, setMassSearchChantier] = useState('');
  const [massSearchFonction, setMassSearchFonction] = useState('');
  const [massSearchUser, setMassSearchUser] = useState('');
  const [massSearchBrevetMonth, setMassSearchBrevetMonth] = useState('');
  const [massSearchBrevetYear, setMassSearchBrevetYear] = useState('');
  const [massSearchBrevetMode, setMassSearchBrevetMode] = useState<'single' | 'interval'>('single');
  const [massSearchBrevetMonthFrom, setMassSearchBrevetMonthFrom] = useState('');
  const [massSearchBrevetMonthTo, setMassSearchBrevetMonthTo] = useState('');
  
  // Users View State
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  // Specific state for bulk import configuration
  const [bulkImportConfig, setBulkImportConfig] = useState<BulkImportConfig | null>(null);

  const [targetMatricule, setTargetMatricule] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [docViewer, setDocViewer] = useState<DocViewerState | null>(null);

  // Password guard for destructive actions
  const [pwdGuard, setPwdGuard] = useState<{ label: string; sub: string; onConfirm: () => void } | null>(null);
  const [pwdGuardInput, setPwdGuardInput] = useState('');
  const [pwdGuardError, setPwdGuardError] = useState('');
  const [pwdGuardShow, setPwdGuardShow] = useState(false);

  // Advanced Filter States
  const [showAdvancedFilterModal, setShowAdvancedFilterModal] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(INITIAL_ADVANCED_FILTERS);

  // Expiry / Licence
  const [showExpiryPanel, setShowExpiryPanel] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [expiryDaysLeft, setExpiryDaysLeft] = useState<number>(Infinity);
  const [showExpiryContactPopup, setShowExpiryContactPopup] = useState(false);

  // Load Workers from DB on mount
  useEffect(() => {
    const initData = async () => {
      try {
        let loadedWorkers = await loadWorkersFromDB();
        
        // Migration strategy: If DB empty, try to load from LocalStorage once, then clear LS.
        if (loadedWorkers.length === 0) {
           const lsData = localStorage.getItem(STORAGE_KEY);
           if (lsData) {
             try {
               loadedWorkers = JSON.parse(lsData);
               console.log("Migrating data from LocalStorage to IndexedDB...");
             } catch {
               loadedWorkers = INITIAL_WORKERS;
             }
           } else {
             loadedWorkers = INITIAL_WORKERS;
           }
        }
        
        setWorkers(loadedWorkers);
      } catch (err) {
        console.error("DB Init failed", err);
        setWorkers(INITIAL_WORKERS);
      } finally {
        setIsDbReady(true);
      }
    };
    initData();
  }, []);

  // Expiry check on mount
  useEffect(() => {
    touchLastKnownTime();
    const info = getExpiryInfo();
    setIsExpired(info.expired);
    setExpiryDaysLeft(info.daysLeft);
  }, []);

  // Keyboard shortcut: Ctrl+Shift+F12 opens admin expiry panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F12') {
        e.preventDefault();
        if (currentUser?.role === 'ADMIN') {
          setShowExpiryPanel(p => !p);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser]);

  // Persist Workers to DB when changed
  useEffect(() => {
    if (!isDbReady) return;

    const saveData = async () => {
      try {
        await saveWorkersToDB(workers);
        // Clear localStorage to ensure we don't hit quota limits anymore and rely on IDB
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.error("Erreur sauvegarde DB:", e);
      }
    };
    saveData();
  }, [workers, isDbReady]);

  // Persist Users (Small data, localStorage is fine)
  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (e) { console.error("Error saving users", e); }
  }, [users]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
  };

  const handleSignup = (newUser: User) => {
    // Encrypt password before storing, mark as PENDING
    const secureUser: User = {
      ...newUser,
      password: encrypt(newUser.password),
      status: 'PENDING'
    };
    setUsers(prev => [...prev, secureUser]);
    // Do NOT log in — user must wait for admin approval
  };

  const handleApproveUser = (username: string) => {
    setUsers(prev => prev.map(u => u.username === username ? { ...u, status: 'APPROVED' } : u));
  };

  const handleDeleteUser = (username: string) => {
    if (username === currentUser?.username) return; // Can't delete self
    setUsers(prev => prev.filter(u => u.username !== username));
  };

  const handleAddUser = () => {
    if (!newUserName || !newUserSurname || !newUserPassword) {
      setNewUserError("Tous les champs sont obligatoires.");
      return;
    }
    const fullName = `${newUserName.trim().toUpperCase()} ${newUserSurname.trim()}`;
    if (users.some(u => u.username.toLowerCase() === fullName.toLowerCase())) {
      setNewUserError("Cet utilisateur existe déjà.");
      return;
    }
    const newUser: User = {
      username: fullName,
      fullName: fullName,
      password: encrypt(newUserPassword),
      role: newUserRole,
      status: 'APPROVED'
    };
    setUsers(prev => [...prev, newUser]);
    setNewUserName('');
    setNewUserSurname('');
    setNewUserPassword('');
    setNewUserRole('USER');
    setNewUserError('');
    setActiveModal(null);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    // Reset view states
    setSearchResults(null);
    setHasSearched(false);
    setSearchQuery('');
    setUserSearchQuery('');
  };

  const handleSearch = useCallback(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setHasSearched(false);
      return;
    }
    const result = workers.find(w => w.matricule === query);
    setSearchResults(result || null);
    setHasSearched(true);
    setHasSearchedByName(false);
  }, [workers, searchQuery]);

  const handleNameSearch = useCallback(() => {
    const nom = searchNom.trim().toLowerCase();
    const prenom = searchPrenom.trim().toLowerCase();
    if (!nom && !prenom) {
      setNameSearchResults([]);
      setHasSearchedByName(false);
      return;
    }
    const results = workers.filter(w => {
      const matchNom = nom ? w.nom.toLowerCase().includes(nom) : true;
      const matchPrenom = prenom ? w.prenom.toLowerCase().includes(prenom) : true;
      return matchNom && matchPrenom;
    });
    setNameSearchResults(results);
    setHasSearchedByName(true);
    setHasSearched(false);
  }, [workers, searchNom, searchPrenom]);

  const massSearchResults = useMemo(() => {
    const chantier = massSearchChantier.trim().toLowerCase();
    const fonction = massSearchFonction.trim().toLowerCase();
    const userSearch = massSearchUser.trim().toLowerCase();
    const noTextFilters = !chantier && !fonction && !userSearch;

    const hasIntervalFilter = massSearchBrevetMode === 'interval' && (massSearchBrevetMonthFrom || massSearchBrevetMonthTo);
    if (noTextFilters && !massSearchBrevetMonth && !massSearchBrevetYear && !hasIntervalFilter) return [];

    let filtered = noTextFilters ? [...workers] : workers.filter(w => {
      const matchChantier = chantier
          ? (w.chantier?.toLowerCase().includes(chantier) || w.affiliation?.toLowerCase().includes(chantier))
          : true;
      const matchFonction = fonction ? w.fonction.toLowerCase().includes(fonction) : true;
      let matchUser = true;
      if (userSearch && currentUser?.role === 'ADMIN') {
         matchUser = (w.createdBy?.toLowerCase().includes(userSearch) || w.lastModifiedBy?.toLowerCase().includes(userSearch)) ?? false;
      }
      return matchChantier && matchFonction && matchUser;
    });

    // Brevet expiry month/year filter (any brevet type, independent of brevet kind)
    if (massSearchBrevetMonth || massSearchBrevetYear || hasIntervalFilter) {
      filtered = filtered.filter(w => {
        const dates = [w.dateExpirationPermis, w.dateExpirationBrevetMarch, w.dateExpirationBrevetDang, w.dateExpirationBrevetPers].filter((d): d is string => !!d);
        return dates.some(d => {
          const [y, m] = d.split('-');
          const yearMatch = massSearchBrevetYear ? y === massSearchBrevetYear : true;
          if (massSearchBrevetMode === 'interval') {
            const mNum = parseInt(m, 10);
            const fromNum = massSearchBrevetMonthFrom ? parseInt(massSearchBrevetMonthFrom, 10) : 1;
            const toNum = massSearchBrevetMonthTo ? parseInt(massSearchBrevetMonthTo, 10) : 12;
            const monthMatch = mNum >= fromNum && mNum <= toNum;
            return yearMatch && monthMatch;
          } else {
            const monthMatch = massSearchBrevetMonth ? m === massSearchBrevetMonth : true;
            return yearMatch && monthMatch;
          }
        });
      });
    }

    // Apply Advanced Filters
    if (advancedFilters.isActive) {
      filtered = filtered.filter(w => {
        // Filter "Aucun Brevet"
        if (advancedFilters.aucunBrevet) {
           const hasNoDocs = !w.docBrevetMarch && !w.docBrevetDang && !w.docBrevetPers;
           if (!hasNoDocs) return false;
        } 
        // Filter "Avec Brevet" (At least one)
        else if (advancedFilters.avecBrevet) {
           const hasAnyDoc = w.docBrevetMarch || w.docBrevetDang || w.docBrevetPers;
           if (!hasAnyDoc) return false;
        }

        // Filter Marchandises
        if (advancedFilters.march !== 'ALL') {
           if (!w.docBrevetMarch) return false; // Must exist to check status or HAS
           if (advancedFilters.march === 'OUI' && w.docBrevetMarchUtilisation !== 'OUI') return false;
           if (advancedFilters.march === 'NON' && w.docBrevetMarchUtilisation === 'OUI') return false;
        }

        // Filter Dangereux
        if (advancedFilters.dang !== 'ALL') {
           if (!w.docBrevetDang) return false;
           if (advancedFilters.dang === 'OUI' && w.docBrevetDangUtilisation !== 'OUI') return false;
           if (advancedFilters.dang === 'NON' && w.docBrevetDangUtilisation === 'OUI') return false;
        }

        // Filter Personnel
        if (advancedFilters.pers !== 'ALL') {
           if (!w.docBrevetPers) return false;
           if (advancedFilters.pers === 'OUI' && w.docBrevetPersUtilisation !== 'OUI') return false;
           if (advancedFilters.pers === 'NON' && w.docBrevetPersUtilisation === 'OUI') return false;
        }

        // Filter Expiration per brevet section
        const today = new Date().toISOString().split('T')[0];
        if (advancedFilters.expirationPermis !== 'ALL') {
           const d = w.dateExpirationPermis;
           if (!d) return false;
           if (advancedFilters.expirationPermis === 'EXPIRED' && d >= today) return false;
           if (advancedFilters.expirationPermis === 'VALID' && d < today) return false;
        }
        if (advancedFilters.expirationMarch !== 'ALL') {
           const d = w.dateExpirationBrevetMarch;
           if (!d) return false;
           if (advancedFilters.expirationMarch === 'EXPIRED' && d >= today) return false;
           if (advancedFilters.expirationMarch === 'VALID' && d < today) return false;
        }
        if (advancedFilters.expirationDang !== 'ALL') {
           const d = w.dateExpirationBrevetDang;
           if (!d) return false;
           if (advancedFilters.expirationDang === 'EXPIRED' && d >= today) return false;
           if (advancedFilters.expirationDang === 'VALID' && d < today) return false;
        }
        if (advancedFilters.expirationPers !== 'ALL') {
           const d = w.dateExpirationBrevetPers;
           if (!d) return false;
           if (advancedFilters.expirationPers === 'EXPIRED' && d >= today) return false;
           if (advancedFilters.expirationPers === 'VALID' && d < today) return false;
        }

        return true;
      });
    }

    return filtered;
  }, [workers, massSearchChantier, massSearchFonction, massSearchUser, massSearchBrevetMonth, massSearchBrevetYear, massSearchBrevetMode, massSearchBrevetMonthFrom, massSearchBrevetMonthTo, advancedFilters, currentUser]);

  const filteredUsers = useMemo(() => {
    if (!userSearchQuery) return users;
    const lower = userSearchQuery.toLowerCase();
    return users.filter(u => 
      u.fullName.toLowerCase().includes(lower) || 
      u.username.toLowerCase().includes(lower)
    );
  }, [users, userSearchQuery]);

  // Calcul dynamique du nombre de résultats actifs
  const activeResultsCount = useMemo(() => {
    if (currentView === 'mass_search' && (massSearchChantier || massSearchFonction || massSearchUser)) {
      return massSearchResults.length;
    }
    if (currentView === 'search') {
      if (searchMode === 'id' && hasSearched) return searchResults ? 1 : 0;
      if (searchMode === 'name' && hasSearchedByName) return nameSearchResults.length;
    }
    return null;
  }, [currentView, searchMode, hasSearched, hasSearchedByName, searchResults, nameSearchResults, massSearchResults, massSearchChantier, massSearchFonction, massSearchUser]);

  // Active filter badges
  const activeFilterTags = useMemo(() => {
    const tags: { id: string, label: string, clearAction: () => void }[] = [];
    
    if (massSearchFonction) {
      tags.push({ id: 'func', label: `Fonction : ${massSearchFonction}`, clearAction: () => setMassSearchFonction('') });
    }
    if (massSearchChantier) {
      tags.push({ id: 'chan', label: `Chantier : ${massSearchChantier}`, clearAction: () => setMassSearchChantier('') });
    }
    if (massSearchUser) {
      tags.push({ id: 'user', label: `Utilisateur : ${massSearchUser}`, clearAction: () => setMassSearchUser('') });
    }
    const hasIntervalFilterTag = massSearchBrevetMode === 'interval' && (massSearchBrevetMonthFrom || massSearchBrevetMonthTo);
    if (massSearchBrevetMonth || massSearchBrevetYear || hasIntervalFilterTag) {
      const MONTHS = ['','Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];
      let monthPart = '';
      if (massSearchBrevetMode === 'interval') {
        const fromLabel = massSearchBrevetMonthFrom ? MONTHS[parseInt(massSearchBrevetMonthFrom)] : 'Jan.';
        const toLabel = massSearchBrevetMonthTo ? MONTHS[parseInt(massSearchBrevetMonthTo)] : 'Déc.';
        monthPart = `${fromLabel} → ${toLabel}`;
      } else {
        monthPart = massSearchBrevetMonth ? MONTHS[parseInt(massSearchBrevetMonth)] : '';
      }
      const label = [monthPart, massSearchBrevetYear].filter(Boolean).join(' ');
      tags.push({ id: 'brevetExp', label: `Expiration Brevet : ${label}`, clearAction: () => { setMassSearchBrevetMonth(''); setMassSearchBrevetYear(''); setMassSearchBrevetMonthFrom(''); setMassSearchBrevetMonthTo(''); } });
    }

    if (advancedFilters.isActive) {
      if (advancedFilters.aucunBrevet) {
        tags.push({ id: 'noDoc', label: 'Sans Brevet', clearAction: () => setAdvancedFilters(prev => ({...prev, aucunBrevet: false})) });
      }
      if (advancedFilters.avecBrevet) {
        tags.push({ id: 'hasDoc', label: 'Avec Brevet', clearAction: () => setAdvancedFilters(prev => ({...prev, avecBrevet: false})) });
      }
      if (advancedFilters.march !== 'ALL') {
         const lbl = advancedFilters.march === 'HAS' ? 'Possède' : advancedFilters.march === 'OUI' ? 'Utilisé' : 'Non Utilisé';
         tags.push({ id: 'march', label: `Br. March.: ${lbl}`, clearAction: () => setAdvancedFilters(prev => ({...prev, march: 'ALL'})) });
      }
      if (advancedFilters.dang !== 'ALL') {
         const lbl = advancedFilters.dang === 'HAS' ? 'Possède' : advancedFilters.dang === 'OUI' ? 'Utilisé' : 'Non Utilisé';
         tags.push({ id: 'dang', label: `Br. Dang.: ${lbl}`, clearAction: () => setAdvancedFilters(prev => ({...prev, dang: 'ALL'})) });
      }
      if (advancedFilters.pers !== 'ALL') {
         const lbl = advancedFilters.pers === 'HAS' ? 'Possède' : advancedFilters.pers === 'OUI' ? 'Utilisé' : 'Non Utilisé';
         tags.push({ id: 'pers', label: `Br. Pers.: ${lbl}`, clearAction: () => setAdvancedFilters(prev => ({...prev, pers: 'ALL'})) });
      }
      if (advancedFilters.expirationPermis !== 'ALL') {
         const lbl = advancedFilters.expirationPermis === 'VALID' ? 'Valide' : 'Expiré';
         tags.push({ id: 'expPermis', label: `Permis: ${lbl}`, clearAction: () => setAdvancedFilters(prev => ({...prev, expirationPermis: 'ALL'})) });
      }
      if (advancedFilters.expirationMarch !== 'ALL') {
         const lbl = advancedFilters.expirationMarch === 'VALID' ? 'Valide' : 'Expiré';
         tags.push({ id: 'expMarch', label: `Br. March.: ${lbl}`, clearAction: () => setAdvancedFilters(prev => ({...prev, expirationMarch: 'ALL'})) });
      }
      if (advancedFilters.expirationDang !== 'ALL') {
         const lbl = advancedFilters.expirationDang === 'VALID' ? 'Valide' : 'Expiré';
         tags.push({ id: 'expDang', label: `Br. Dang.: ${lbl}`, clearAction: () => setAdvancedFilters(prev => ({...prev, expirationDang: 'ALL'})) });
      }
      if (advancedFilters.expirationPers !== 'ALL') {
         const lbl = advancedFilters.expirationPers === 'VALID' ? 'Valide' : 'Expiré';
         tags.push({ id: 'expPers', label: `Br. Pers.: ${lbl}`, clearAction: () => setAdvancedFilters(prev => ({...prev, expirationPers: 'ALL'})) });
      }
    }
    return tags;
  }, [massSearchFonction, massSearchChantier, massSearchUser, massSearchBrevetMonth, massSearchBrevetYear, massSearchBrevetMode, massSearchBrevetMonthFrom, massSearchBrevetMonthTo, advancedFilters]);

  const clearAllFilters = () => {
    setMassSearchFonction('');
    setMassSearchChantier('');
    setMassSearchUser('');
    setMassSearchBrevetMonth('');
    setMassSearchBrevetYear('');
    setMassSearchBrevetMonthFrom('');
    setMassSearchBrevetMonthTo('');
    setAdvancedFilters(INITIAL_ADVANCED_FILTERS);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (searchMode === 'id') handleSearch();
      else handleNameSearch();
    }
  };

  const handleMassSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = massSearchFonction.toLowerCase();
      if (val.includes('chauffeur') || val.includes('grutier')) {
        setShowAdvancedFilterModal(true);
      }
    }
  };

  const handleAdvancedFilterChange = (key: keyof AdvancedFilterState, value: any) => {
    setAdvancedFilters(prev => {
      const next = { ...prev, isActive: true, [key]: value };
      
      // If "Aucun Brevet" is turned ON, reset others to ALL and global avecBrevet
      if (key === 'aucunBrevet' && value === true) {
        next.march = 'ALL';
        next.dang = 'ALL';
        next.pers = 'ALL';
        next.expiration = 'ALL';
        next.avecBrevet = false;
      }
      
      // If "Avec Brevet" is turned ON, reset aucunBrevet
      if (key === 'avecBrevet' && value === true) {
        next.aucunBrevet = false;
      }

      // If specific filters are touched, turn off "Aucun Brevet"
      if ((key === 'march' || key === 'dang' || key === 'pers' || key === 'expiration') && value !== 'ALL') {
        next.aucunBrevet = false;
      }

      return next;
    });
  };

  const resetAdvancedFilters = () => {
    setAdvancedFilters(INITIAL_ADVANCED_FILTERS);
  };

  const handleExportExcel = () => {
    if (massSearchResults.length === 0) {
      alert("Aucun résultat à exporter.");
      return;
    }

    const buildExcelRows = (workerList: Worker[]) => {
      const getStatus = (exists?: string, util?: string) => {
        if (!exists) return 'MANQUANT';
        return util === 'OUI' ? 'UTILISÉ' : 'NON UTILISÉ';
      };
      return workerList.map(worker => {
        const actionBy = worker.lastModifiedBy || worker.createdBy || '';
        const actionDate = worker.updatedAt || worker.createdAt || '';
        return [
          worker.matricule,
          worker.nom,
          worker.prenom,
          worker.fonction,
          worker.chantier || '',
          worker.affair || '',
          getStatus(worker.docPermis, worker.docPermisUtilisation),
          worker.numeroPermis || '',
          worker.dateExpirationPermis || '',
          getStatus(worker.docBrevetMarch, worker.docBrevetMarchUtilisation),
          worker.numeroBrevetMarch || '',
          worker.dateExpirationBrevetMarch || '',
          getStatus(worker.docBrevetDang, worker.docBrevetDangUtilisation),
          worker.numeroBrevetDang || '',
          worker.dateExpirationBrevetDang || '',
          getStatus(worker.docBrevetPers, worker.docBrevetPersUtilisation),
          worker.numeroBrevetPers || '',
          worker.dateExpirationBrevetPers || '',
          actionBy,
          actionDate
        ];
      });
    };

    const headers = [
      "Matricule", "Nom", "Prénom", "Fonction", "Chantier", "Affair",
      "Permis", "N° Permis", "Exp. Permis",
      "Br. Marchandises", "N° Br. March.", "Exp. Br. March.",
      "Br. Dangereux", "N° Br. Dang.", "Exp. Br. Dang.",
      "Br. Personnel", "N° Br. Pers.", "Exp. Br. Pers.",
      "Dernière Action Par", "Date Action"
    ];

    const workSheet = XLSX.utils.aoa_to_sheet([headers, ...buildExcelRows(massSearchResults)]);
    const workBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workBook, workSheet, "Résultats Filtrés");
    XLSX.writeFile(workBook, `RH_Filtre_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`);
  };

  const handleExportDriversZip = async () => {
    const drivers = massSearchResults.filter(w =>
      w.docPermis || w.docBrevetMarch || w.docBrevetDang || w.docBrevetPers
    );
    if (drivers.length === 0) {
      alert("Aucun collaborateur avec brevet dans les résultats actuels.");
      return;
    }

    const dateStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    const zip = new JSZip();

    const safe = (s: string) => s.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim();

    const dataURItoBytes = (dataURI: string): { bytes: Uint8Array; ext: string } => {
      const [header, b64] = dataURI.split(',');
      const mime = header.match(/:(.*?);/)?.[1] || '';
      const extMap: Record<string, string> = {
        'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png',
        'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
      };
      const ext = extMap[mime] || 'bin';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, ext };
    };

    const buildDocFilename = (
      worker: Worker, docType: string, originalFilename: string | undefined,
      numero: string | undefined, expDate: string | undefined, data: string
    ): string => {
      const workerBase = safe(`${worker.nom}_${worker.prenom}_${worker.matricule}`);
      let ext = 'bin';
      if (originalFilename) ext = originalFilename.split('.').pop()?.toLowerCase() || ext;
      else ext = dataURItoBytes(data).ext;
      const parts: string[] = [workerBase, safe(docType)];
      if (numero) parts.push(`N${safe(numero)}`);
      if (expDate) parts.push(`EXP${expDate}`);
      return parts.join('_') + '.' + ext;
    };

    const docs = [
      { key: 'docPermis' as keyof Worker, filenameKey: 'docPermisFilename' as keyof Worker, numKey: 'numeroPermis' as keyof Worker, dateKey: 'dateExpirationPermis' as keyof Worker, typeName: 'Permis_Conduire' },
      { key: 'docBrevetMarch' as keyof Worker, filenameKey: 'docBrevetMarchFilename' as keyof Worker, numKey: 'numeroBrevetMarch' as keyof Worker, dateKey: 'dateExpirationBrevetMarch' as keyof Worker, typeName: 'Brevet_Marchandises' },
      { key: 'docBrevetDang' as keyof Worker, filenameKey: 'docBrevetDangFilename' as keyof Worker, numKey: 'numeroBrevetDang' as keyof Worker, dateKey: 'dateExpirationBrevetDang' as keyof Worker, typeName: 'Brevet_Matieres_Dang' },
      { key: 'docBrevetPers' as keyof Worker, filenameKey: 'docBrevetPersFilename' as keyof Worker, numKey: 'numeroBrevetPers' as keyof Worker, dateKey: 'dateExpirationBrevetPers' as keyof Worker, typeName: 'Brevet_Personnel' },
    ];

    const today = new Date().toISOString().split('T')[0];

    // Excel at the root of the ZIP (same level as driver folders)
    const getStatus = (exists?: string, util?: string) => {
      if (!exists) return 'MANQUANT';
      return util === 'OUI' ? 'UTILISÉ' : 'NON UTILISÉ';
    };
    const headers = [
      "Matricule","Nom","Prénom","Fonction","Chantier","Affair",
      "Permis","N° Permis","Exp. Permis",
      "Br. Marchandises","N° Br. March.","Exp. Br. March.",
      "Br. Dangereux","N° Br. Dang.","Exp. Br. Dang.",
      "Br. Personnel","N° Br. Pers.","Exp. Br. Pers.",
      "Dernière Action Par","Date Action"
    ];
    const rows = drivers.map(w => [
      w.matricule, w.nom, w.prenom, w.fonction, w.chantier || '', w.affair || '',
      getStatus(w.docPermis, w.docPermisUtilisation), w.numeroPermis || '', w.dateExpirationPermis || '',
      getStatus(w.docBrevetMarch, w.docBrevetMarchUtilisation), w.numeroBrevetMarch || '', w.dateExpirationBrevetMarch || '',
      getStatus(w.docBrevetDang, w.docBrevetDangUtilisation), w.numeroBrevetDang || '', w.dateExpirationBrevetDang || '',
      getStatus(w.docBrevetPers, w.docBrevetPersUtilisation), w.numeroBrevetPers || '', w.dateExpirationBrevetPers || '',
      w.lastModifiedBy || w.createdBy || '', w.updatedAt || w.createdAt || ''
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Chauffeurs");
    const xlsxBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    zip.file(`RH_Chauffeurs_${dateStr}.xlsx`, xlsxBytes);

    // One folder per driver at the root
    for (const worker of drivers) {
      const folderName = safe(`${worker.nom}_${worker.prenom}_${worker.matricule}`);

      // INFO.txt
      const infoLines = [
        `=== FICHE COLLABORATEUR ===`,
        `Matricule   : ${worker.matricule}`,
        `Nom         : ${worker.nom}`,
        `Prénom      : ${worker.prenom}`,
        `Fonction    : ${worker.fonction}`,
        `Chantier    : ${worker.chantier || '-'}`,
        `Affair      : ${worker.affair || '-'}`,
        `Créé par    : ${worker.createdBy || '-'} le ${worker.createdAt || '-'}`,
        `Modifié par : ${worker.lastModifiedBy || '-'} le ${worker.updatedAt || '-'}`,
        '',
        '=== BREVETS ===',
      ];
      if (worker.numeroPermis || worker.dateExpirationPermis) {
        const exp = worker.dateExpirationPermis;
        infoLines.push(`Permis      : N° ${worker.numeroPermis || '-'} | Exp: ${exp || '-'}${exp && exp < today ? ' [EXPIRÉ]' : ''}`);
      }
      if (worker.numeroBrevetMarch || worker.dateExpirationBrevetMarch) {
        const exp = worker.dateExpirationBrevetMarch;
        infoLines.push(`March.      : N° ${worker.numeroBrevetMarch || '-'} | Exp: ${exp || '-'}${exp && exp < today ? ' [EXPIRÉ]' : ''}`);
      }
      if (worker.numeroBrevetDang || worker.dateExpirationBrevetDang) {
        const exp = worker.dateExpirationBrevetDang;
        infoLines.push(`Dang.       : N° ${worker.numeroBrevetDang || '-'} | Exp: ${exp || '-'}${exp && exp < today ? ' [EXPIRÉ]' : ''}`);
      }
      if (worker.numeroBrevetPers || worker.dateExpirationBrevetPers) {
        const exp = worker.dateExpirationBrevetPers;
        infoLines.push(`Personnel   : N° ${worker.numeroBrevetPers || '-'} | Exp: ${exp || '-'}${exp && exp < today ? ' [EXPIRÉ]' : ''}`);
      }
      zip.file(`${folderName}/INFO.txt`, infoLines.join('\n'));

      // Documents alongside INFO.txt
      for (const doc of docs) {
        const data = worker[doc.key] as string | undefined;
        if (!data) continue;
        const filename = buildDocFilename(
          worker, doc.typeName,
          worker[doc.filenameKey] as string | undefined,
          worker[doc.numKey] as string | undefined,
          worker[doc.dateKey] as string | undefined,
          data
        );
        const { bytes } = dataURItoBytes(data);
        zip.file(`${folderName}/${filename}`, bytes);
      }
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Chauffeurs_Export_${dateStr}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAllExcel = () => {
    if (workers.length === 0) {
      alert("Aucun collaborateur dans la base de données.");
      return;
    }
    const getStatus = (exists?: string, util?: string) => {
      if (!exists) return 'MANQUANT';
      return util === 'OUI' ? 'UTILISÉ' : 'NON UTILISÉ';
    };
    const headers = [
      "Matricule", "Nom", "Prénom", "Fonction", "Chantier", "Affair",
      "Permis", "N° Permis", "Exp. Permis",
      "Br. Marchandises", "N° Br. March.", "Exp. Br. March.",
      "Br. Dangereux", "N° Br. Dang.", "Exp. Br. Dang.",
      "Br. Personnel", "N° Br. Pers.", "Exp. Br. Pers.",
      "Dernière Action Par", "Date Action"
    ];
    const rows = workers.map(worker => {
      const actionBy = worker.lastModifiedBy || worker.createdBy || '';
      const actionDate = worker.updatedAt || worker.createdAt || '';
      return [
        worker.matricule, worker.nom, worker.prenom, worker.fonction,
        worker.chantier || '', worker.affair || '',
        getStatus(worker.docPermis, worker.docPermisUtilisation),
        worker.numeroPermis || '', worker.dateExpirationPermis || '',
        getStatus(worker.docBrevetMarch, worker.docBrevetMarchUtilisation),
        worker.numeroBrevetMarch || '', worker.dateExpirationBrevetMarch || '',
        getStatus(worker.docBrevetDang, worker.docBrevetDangUtilisation),
        worker.numeroBrevetDang || '', worker.dateExpirationBrevetDang || '',
        getStatus(worker.docBrevetPers, worker.docBrevetPersUtilisation),
        worker.numeroBrevetPers || '', worker.dateExpirationBrevetPers || '',
        actionBy, actionDate
      ];
    });
    const workSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workBook, workSheet, "Tous les Collaborateurs");
    XLSX.writeFile(workBook, `RH_Global_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`);
  };

  // ---- FULL ZIP PACKAGE EXPORT ----
  const handleExportZipPackage = async () => {
    if (workers.length === 0) {
      alert("Aucun collaborateur dans la base de données.");
      return;
    }

    const dateStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    const today = new Date().toISOString().split('T')[0];
    const zip = new JSZip();

    // Only workers eligible for brevets: CHAUFFEUR/GRUTIER by fonction, or already has a brevet doc
    const eligibleWorkers = workers.filter(w => {
      const fn = w.fonction.toUpperCase();
      return fn.includes('CHAUFFEUR') || fn.includes('GRUTIER') ||
        w.docPermis || w.docBrevetMarch || w.docBrevetDang || w.docBrevetPers;
    });

    if (eligibleWorkers.length === 0) {
      alert("Aucun collaborateur éligible aux brevets trouvé.");
      return;
    }

    const getStatus = (exists?: string, util?: string) => {
      if (!exists) return 'MANQUANT';
      return util === 'OUI' ? 'UTILISÉ' : 'NON UTILISÉ';
    };

    // Helper: build a safe folder/file name segment
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim();

    // Helper: decode base64 data URI → Uint8Array
    const dataURItoBytes = (dataURI: string): { bytes: Uint8Array; ext: string } => {
      const [header, b64] = dataURI.split(',');
      const mime = header.match(/:(.*?);/)?.[1] || '';
      const extMap: Record<string, string> = {
        'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png',
        'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
      };
      const ext = extMap[mime] || 'bin';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, ext };
    };

    // Helper: build brevet filename
    // Pattern: <WorkerName>_<DocType>_N<numero>_EXP<date>.<ext>
    // or if no number/date: <WorkerName>_<DocType>.<ext>
    const buildDocFilename = (
      worker: Worker,
      docType: string,
      originalFilename: string | undefined,
      numero: string | undefined,
      expDate: string | undefined,
      data: string
    ): string => {
      const workerBase = safe(`${worker.nom}_${worker.prenom}_${worker.matricule}`);
      const typeTag = safe(docType);
      // Detect extension from original filename first, then from data URI
      let ext = 'bin';
      if (originalFilename) {
        ext = originalFilename.split('.').pop()?.toLowerCase() || ext;
      } else {
        ext = dataURItoBytes(data).ext;
      }
      const parts: string[] = [workerBase, typeTag];
      if (numero) parts.push(`N${safe(numero)}`);
      if (expDate) parts.push(`EXP${expDate}`);
      return parts.join('_') + '.' + ext;
    };

    // --- FOLDER 1: brevets/ — all docs organized by type ---
    const brevetsDocs = [
      { key: 'docPermis' as keyof Worker, filenameKey: 'docPermisFilename' as keyof Worker, numKey: 'numeroPermis' as keyof Worker, dateKey: 'dateExpirationPermis' as keyof Worker, typeName: 'Permis_Conduire', folder: 'brevets/Permis_de_Conduire' },
      { key: 'docBrevetMarch' as keyof Worker, filenameKey: 'docBrevetMarchFilename' as keyof Worker, numKey: 'numeroBrevetMarch' as keyof Worker, dateKey: 'dateExpirationBrevetMarch' as keyof Worker, typeName: 'Brevet_Marchandises', folder: 'brevets/Brevet_Marchandises' },
      { key: 'docBrevetDang' as keyof Worker, filenameKey: 'docBrevetDangFilename' as keyof Worker, numKey: 'numeroBrevetDang' as keyof Worker, dateKey: 'dateExpirationBrevetDang' as keyof Worker, typeName: 'Brevet_Matieres_Dangereuses', folder: 'brevets/Brevet_Matieres_Dangereuses' },
      { key: 'docBrevetPers' as keyof Worker, filenameKey: 'docBrevetPersFilename' as keyof Worker, numKey: 'numeroBrevetPers' as keyof Worker, dateKey: 'dateExpirationBrevetPers' as keyof Worker, typeName: 'Brevet_Personnel', folder: 'brevets/Brevet_Personnel' },
    ];

    for (const worker of workers) {
      const isSpecial = worker.fonction.toUpperCase().includes('CHAUFFEUR') || worker.fonction.toUpperCase().includes('GRUTIER');
      if (!isSpecial) continue;
      for (const doc of brevetsDocs) {
        const data = worker[doc.key] as string | undefined;
        if (!data) continue;
        const filename = buildDocFilename(
          worker, doc.typeName,
          worker[doc.filenameKey] as string | undefined,
          worker[doc.numKey] as string | undefined,
          worker[doc.dateKey] as string | undefined,
          data
        );
        const { bytes } = dataURItoBytes(data);
        zip.file(`${doc.folder}/${filename}`, bytes);
      }
    }

    // --- FOLDER 2: excel/ — Excel files ---
    const excelHeaders = [
      "Matricule", "Nom", "Prénom", "Fonction", "Chantier", "Affair",
      "Permis", "N° Permis", "Exp. Permis",
      "Br. Marchandises", "N° Br. March.", "Exp. Br. March.",
      "Br. Dangereux", "N° Br. Dang.", "Exp. Br. Dang.",
      "Br. Personnel", "N° Br. Pers.", "Exp. Br. Pers.",
      "Dernière Action Par", "Date Action"
    ];
    const excelRows = eligibleWorkers.map(w => [
      w.matricule, w.nom, w.prenom, w.fonction, w.chantier || '', w.affair || '',
      getStatus(w.docPermis, w.docPermisUtilisation), w.numeroPermis || '', w.dateExpirationPermis || '',
      getStatus(w.docBrevetMarch, w.docBrevetMarchUtilisation), w.numeroBrevetMarch || '', w.dateExpirationBrevetMarch || '',
      getStatus(w.docBrevetDang, w.docBrevetDangUtilisation), w.numeroBrevetDang || '', w.dateExpirationBrevetDang || '',
      getStatus(w.docBrevetPers, w.docBrevetPersUtilisation), w.numeroBrevetPers || '', w.dateExpirationBrevetPers || '',
      w.lastModifiedBy || w.createdBy || '', w.updatedAt || w.createdAt || ''
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([excelHeaders, ...excelRows]), "Chauffeurs & Grutiers");

    // Expired brevets sheet
    const expiredRows = eligibleWorkers.filter(w => {
      const dates = [w.dateExpirationPermis, w.dateExpirationBrevetMarch, w.dateExpirationBrevetDang, w.dateExpirationBrevetPers];
      return dates.some(d => d && d < today);
    }).map(w => [
      w.matricule, w.nom, w.prenom, w.fonction,
      w.dateExpirationPermis && w.dateExpirationPermis < today ? w.dateExpirationPermis : '',
      w.dateExpirationBrevetMarch && w.dateExpirationBrevetMarch < today ? w.dateExpirationBrevetMarch : '',
      w.dateExpirationBrevetDang && w.dateExpirationBrevetDang < today ? w.dateExpirationBrevetDang : '',
      w.dateExpirationBrevetPers && w.dateExpirationBrevetPers < today ? w.dateExpirationBrevetPers : '',
    ]);
    if (expiredRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Matricule","Nom","Prénom","Fonction","Exp.Permis","Exp.March.","Exp.Dang.","Exp.Pers."],
        ...expiredRows
      ]), "Brevets Expirés");
    }

    const xlsxBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    zip.file(`excel/RH_Global_${dateStr}.xlsx`, xlsxBytes);

    // --- FOLDER 3: database/ — SQLite .db snapshot ---
    try {
      const SQL = await initSqlJs({
        locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
      });
      const sqlDb = new SQL.Database();
      sqlDb.run(`CREATE TABLE travailleurs (
        matricule TEXT PRIMARY KEY, nom TEXT, prenom TEXT, dateNaissance TEXT, fonction TEXT,
        dateEntree TEXT, dateFin TEXT, wilaya TEXT, affiliation TEXT, chantier TEXT, affair TEXT,
        docPermis TEXT, docBrevetMarch TEXT, docBrevetDang TEXT, docBrevetPers TEXT,
        docPermisFilename TEXT, docBrevetMarchFilename TEXT, docBrevetDangFilename TEXT, docBrevetPersFilename TEXT,
        numeroPermis TEXT, dateExpirationPermis TEXT,
        numeroBrevetMarch TEXT, dateExpirationBrevetMarch TEXT,
        numeroBrevetDang TEXT, dateExpirationBrevetDang TEXT,
        numeroBrevetPers TEXT, dateExpirationBrevetPers TEXT,
        docPermisUtilisation TEXT, docBrevetMarchUtilisation TEXT, docBrevetDangUtilisation TEXT, docBrevetPersUtilisation TEXT,
        createdBy TEXT, createdAt TEXT, lastModifiedBy TEXT, updatedAt TEXT
      )`);
      const stmt = sqlDb.prepare(`INSERT INTO travailleurs VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )`);
      workers.forEach(w => {
        stmt.run([
          w.matricule, w.nom, w.prenom, w.dateNaissance || '', w.fonction,
          w.dateEntree || '', w.dateFin || '', w.wilaya || '', w.affiliation || '',
          w.chantier || '', w.affair || '',
          w.docPermis || '', w.docBrevetMarch || '', w.docBrevetDang || '', w.docBrevetPers || '',
          w.docPermisFilename || '', w.docBrevetMarchFilename || '', w.docBrevetDangFilename || '', w.docBrevetPersFilename || '',
          w.numeroPermis || '', w.dateExpirationPermis || '',
          w.numeroBrevetMarch || '', w.dateExpirationBrevetMarch || '',
          w.numeroBrevetDang || '', w.dateExpirationBrevetDang || '',
          w.numeroBrevetPers || '', w.dateExpirationBrevetPers || '',
          w.docPermisUtilisation || '', w.docBrevetMarchUtilisation || '', w.docBrevetDangUtilisation || '', w.docBrevetPersUtilisation || '',
          w.createdBy || '', w.createdAt || '', w.lastModifiedBy || '', w.updatedAt || ''
        ]);
      });
      stmt.free();
      const dbBytes = sqlDb.export();
      sqlDb.close();
      zip.file(`database/RH_Database_${dateStr}.db`, dbBytes);
    } catch (err) {
      console.error('DB export error in ZIP:', err);
    }

    // --- FOLDER 4: collaborateurs/ — one folder per eligible worker ---
    for (const worker of eligibleWorkers) {
      const workerFolder = `collaborateurs/${safe(worker.nom + '_' + worker.prenom + '_' + worker.matricule)}`;

      // Worker info card as text
      const infoLines = [
        `=== FICHE COLLABORATEUR ===`,
        `Matricule   : ${worker.matricule}`,
        `Nom         : ${worker.nom}`,
        `Prénom      : ${worker.prenom}`,
        `Fonction    : ${worker.fonction}`,
        `Chantier    : ${worker.chantier || '-'}`,
        `Affair      : ${worker.affair || '-'}`,
        `Créé par    : ${worker.createdBy || '-'} le ${worker.createdAt || '-'}`,
        `Modifié par : ${worker.lastModifiedBy || '-'} le ${worker.updatedAt || '-'}`,
      ];
      infoLines.push('', '=== BREVETS ===');
      if (worker.numeroPermis || worker.dateExpirationPermis)
        infoLines.push(`Permis      : N° ${worker.numeroPermis || '-'} | Exp: ${worker.dateExpirationPermis || '-'}`);
      if (worker.numeroBrevetMarch || worker.dateExpirationBrevetMarch)
        infoLines.push(`March.      : N° ${worker.numeroBrevetMarch || '-'} | Exp: ${worker.dateExpirationBrevetMarch || '-'}`);
      if (worker.numeroBrevetDang || worker.dateExpirationBrevetDang)
        infoLines.push(`Dang.       : N° ${worker.numeroBrevetDang || '-'} | Exp: ${worker.dateExpirationBrevetDang || '-'}`);
      if (worker.numeroBrevetPers || worker.dateExpirationBrevetPers)
        infoLines.push(`Personnel   : N° ${worker.numeroBrevetPers || '-'} | Exp: ${worker.dateExpirationBrevetPers || '-'}`);
      zip.file(`${workerFolder}/INFO.txt`, infoLines.join('\n'));

      // Documents alongside INFO.txt
      for (const doc of brevetsDocs) {
          const data = worker[doc.key] as string | undefined;
          if (!data) continue;
          const filename = buildDocFilename(
            worker, doc.typeName,
            worker[doc.filenameKey] as string | undefined,
            worker[doc.numKey] as string | undefined,
            worker[doc.dateKey] as string | undefined,
            data
          );
          const { bytes } = dataURItoBytes(data);
          zip.file(`${workerFolder}/${filename}`, bytes);
        }
    }

    // --- FOLDER 5: bordereau/ — bordereau d'envoi docs organized by chantier ---
    try {
      const bordereauEntries: BordereauEntry[] = JSON.parse(localStorage.getItem('csgm_bordereau_entries') || '[]');
      if (bordereauEntries.length > 0) {
        for (const entry of bordereauEntries) {
          const chantierFolder = `bordereau/${safe(entry.chantier)}`;
          const d = new Date(entry.date);
          const dateTag = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const timeTag = `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
          const typeTag = entry.type === 'arrivee' ? 'Arrivee' : 'Depart';
          const filename = `${typeTag}_${dateTag}_${timeTag}_${safe(entry.filename)}`;
          const { bytes } = dataURItoBytes(entry.data);
          zip.file(`${chantierFolder}/${filename}`, bytes);
        }
      }
    } catch (err) {
      console.error('Bordereau export error in ZIP:', err);
    }

    // Generate and download
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CSGM_Export_Complet_${dateStr}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownload = useCallback((base64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleRemoveDoc = useCallback((field: keyof Worker) => {
    if (currentUser?.role !== 'ADMIN') {
      alert("Accès refusé. Seul l'administrateur peut supprimer des documents.");
      return;
    }
    if (!searchResults) return;
    const matricule = searchResults.matricule;
    const workerName = `${searchResults.nom} ${searchResults.prenom}`;
    triggerPwdGuard(
      'Supprimer ce document',
      `Document du collaborateur ${workerName} — cette action est irréversible.`,
      () => {
        setWorkers(prev => prev.map(w =>
          w.matricule === matricule ? { ...w, [field]: undefined, lastModifiedBy: currentUser?.fullName, updatedAt: new Date().toISOString().split('T')[0] } : w
        ));
        setSearchResults(prev => prev ? { ...prev, [field]: undefined } : null);
      }
    );
  }, [searchResults, currentUser]);

  const handleView = useCallback((state: DocViewerState) => {
    setDocViewer(state);
  }, []);

  const handleInternalSave = () => {
    setIsSyncing(true);
    // Explicit trigger to save effect (technically handled by effect on state change, but this visualizes sync)
    setTimeout(() => {
        saveWorkersToDB(workers).then(() => {
            setLastSaved(new Date().toLocaleTimeString());
            setShowSaveToast(true);
            setTimeout(() => setShowSaveToast(false), 3000);
        }).catch(err => {
            alert("Erreur de synchronisation IndexedDB : " + err);
        });
        setIsSyncing(false);
    }, 600);
  };

  const handleExportDB = async () => {
    if (workers.length === 0) {
      alert("La base est vide.");
      return;
    }
    try {
      const SQL = await initSqlJs({
        locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
      });
      const db = new SQL.Database();
      db.run(`CREATE TABLE travailleurs (matricule TEXT PRIMARY KEY, nom TEXT, prenom TEXT, dateNaissance TEXT, fonction TEXT, dateEntree TEXT, dateFin TEXT, wilaya TEXT, affiliation TEXT, chantier TEXT, affair TEXT, docPermis TEXT, docBrevetMarch TEXT, docBrevetDang TEXT, docBrevetPers TEXT)`);
      const stmt = db.prepare("INSERT INTO travailleurs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      workers.forEach(w => {
        stmt.run([
          w.matricule, w.nom, w.prenom, w.dateNaissance, w.fonction, w.dateEntree, w.dateFin || "", 
          w.wilaya, w.affiliation, w.chantier || "", w.affair || "", w.docPermis || "", w.docBrevetMarch || "", w.docBrevetDang || "", w.docBrevetPers || ""
        ]);
      });
      stmt.free();
      const binaryArray = db.export();
      const blob = new Blob([binaryArray], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rh_database_gtp_${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'exportation.");
    }
  };

  const executeDelete = () => {
    if (!targetMatricule) return;
    setWorkers(prev => prev.filter(w => w.matricule !== targetMatricule));
    if (searchResults?.matricule === targetMatricule) {
      setSearchResults(null);
      setHasSearched(false);
      setSearchQuery('');
    }
    setNameSearchResults(prev => prev.filter(w => w.matricule !== targetMatricule));
    setTargetMatricule(null);
    setActiveModal(null);
  };

  const executeClear = () => {
    setWorkers([]);
    saveWorkersToDB([]); // Clear DB
    setHasSearched(false);
    setSearchResults(null);
    setSearchQuery('');
    setNameSearchResults([]);
    setHasSearchedByName(false);
    setMassSearchChantier('');
    setMassSearchFonction('');
    setCurrentView('search');
    setActiveModal(null);
  };

  const triggerPwdGuard = (label: string, sub: string, onConfirm: () => void) => {
    setPwdGuard({ label, sub, onConfirm });
    setPwdGuardInput('');
    setPwdGuardError('');
    setPwdGuardShow(false);
  };

  const executePwdGuard = () => {
    const adminUser = users.find(u => u.role === 'ADMIN');
    if (!adminUser) { setPwdGuardError('Aucun administrateur trouvé.'); return; }
    if (decrypt(adminUser.password) !== pwdGuardInput) {
      setPwdGuardError('Mot de passe administrateur incorrect.');
      return;
    }
    pwdGuard?.onConfirm();
    setPwdGuard(null);
    setPwdGuardInput('');
    setPwdGuardError('');
  };

  // Function to setup and open the Bulk Import Modal
  const openBulkImport = (docType: 'docBrevetMarch' | 'docBrevetDang' | 'docBrevetPers' | 'docPermis', title: string) => {
    setBulkImportConfig({ docType, title } as any); // Cast slightly as types might need update or are compatible
    setActiveModal('BULK_DOC_IMPORT');
  };

  // Handle the confirmation from Bulk Import Modal
  // Updated to handle both UPDATES and CREATIONS
  const handleBulkImportConfirm = (actions: { type: 'UPDATE' | 'CREATE', matricule: string, field: keyof Worker, data: string, workerData?: Partial<Worker> }[]) => {
    const now = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    
    // Append (AUTOMATED) to the username for audit trail
    const modifierName = `${currentUser?.fullName || "System"} (AUTOMATED)`;

    setWorkers(prev => {
        const newWorkers = [...prev];
        
        actions.forEach(action => {
            if (action.type === 'UPDATE') {
                const index = newWorkers.findIndex(w => w.matricule === action.matricule);
                if (index !== -1) {
                    newWorkers[index] = {
                        ...newWorkers[index],
                        [action.field]: action.data,
                        lastModifiedBy: modifierName,
                        updatedAt: now
                    };
                }
            } else if (action.type === 'CREATE' && action.workerData) {
                // Ensure no duplicate matricule before creating (double check)
                const exists = newWorkers.find(w => w.matricule === action.matricule);
                if (!exists) {
                    // Create new worker object
                    const newWorker: Worker = {
                        ...(action.workerData as Worker), // Cast as we ensure essential fields are there
                        [action.field]: action.data, // Add the image
                        createdBy: modifierName,
                        createdAt: now,
                        lastModifiedBy: modifierName,
                        updatedAt: now
                    };
                    newWorkers.push(newWorker);
                }
            }
        });
        return newWorkers;
    });

    // Auto-save feedback
    setLastSaved(now);
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 3000);
    
    setActiveModal(null);
    setBulkImportConfig(null);
  };

  const saveWorker = (worker: Worker) => {
    // UPDATED: Include Time in the timestamp
    const now = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    
    const modifierName = currentUser?.fullName || "Inconnu";

    if (activeModal === 'EDIT' && searchResults) {
      const originalMatricule = searchResults.matricule;
      
      // If matricule changed, check for duplicates
      if (worker.matricule !== originalMatricule) {
        if (workers.some(w => w.matricule === worker.matricule)) {
          alert("Ce matricule est déjà attribué à un autre dossier.");
          return;
        }
      }

      // Update Audit Fields
      const updatedWorker = {
        ...worker,
        lastModifiedBy: modifierName,
        updatedAt: now,
        // Preserve creation info
        createdBy: searchResults.createdBy || worker.createdBy,
        createdAt: searchResults.createdAt || worker.createdAt,
      };

      setWorkers(prev => prev.map(w => w.matricule === originalMatricule ? updatedWorker : w));
      
      // Update current displayed result
      setSearchResults(updatedWorker);
      
      // If we were searching by the old ID, update the query to the new one
      if (searchMode === 'id' && searchQuery === originalMatricule) {
        setSearchQuery(updatedWorker.matricule);
      }
    } else {
      // Create New
      if (workers.some(w => w.matricule === worker.matricule)) {
        alert("Ce matricule existe déjà.");
        return;
      }
      
      const newWorker = {
        ...worker,
        createdBy: modifierName,
        createdAt: now, // Creation time also includes hour
        lastModifiedBy: modifierName,
        updatedAt: now
      };

      setWorkers(prev => [newWorker, ...prev]);
    }
    
    // Auto-save feedback: Trigger the Save Toast immediately
    setLastSaved(now);
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 3000);
    
    setActiveModal(null);
  };

  const handleImportComplete = (newWorkers: Worker[]) => {
    // When importing, we might want to tag them as imported by current user if they lack data
    const now = new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const modifierName = currentUser?.fullName || "System Import";

    const taggedWorkers = newWorkers.map(w => ({
      ...w,
      createdBy: w.createdBy || modifierName,
      createdAt: w.createdAt || now,
      lastModifiedBy: w.lastModifiedBy || modifierName,
      updatedAt: w.updatedAt || now
    }));

    setWorkers(taggedWorkers);
    setHasSearched(false);
    setSearchResults(null);
    setHasSearchedByName(false);
    setNameSearchResults([]);
    setCurrentView('records');
  };

  // --- RENDER ---

  // Loading Screen for Database Initialization
  if (!isDbReady) {
    return (
      <div className="h-screen bg-[#F8F9FA] flex flex-col items-center justify-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col items-center gap-5">
          <div className="w-14 h-14 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-center">
            <svg className="w-7 h-7 text-[#1A56DB] animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white mb-1">Chargement du Système</h1>
            <p className="text-gray-500 text-sm">Initialisation de la base de données sécurisée…</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-[#1A56DB] rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
            <div className="w-1.5 h-1.5 bg-[#1A56DB] rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
            <div className="w-1.5 h-1.5 bg-[#1A56DB] rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen users={users} onLogin={handleLogin} onSignup={handleSignup} />;
  }

  return (
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 shadow-2xl z-20">

        {/* Logo Header */}
        <div className="relative h-28 px-6 flex flex-col justify-center overflow-hidden group border-b border-gray-200 cursor-default select-none shrink-0">
          <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-[#1A56DB]/[0.07] transition-all duration-500 group-hover:scale-110" />
          <div className="absolute -top-2 -right-2 w-14 h-14 rounded-full bg-[#1A56DB]/[0.10] transition-all duration-500 group-hover:scale-110" />
          <p className="text-5xl font-black italic text-gray-900 leading-none tracking-tight transition-all duration-500 group-hover:text-[#1A56DB] relative z-10">CSGM</p>
          <div className="flex items-center gap-2 mt-2 relative z-10">
            <div className="flex-1 h-px bg-gray-300" />
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.25em]">AMROUS</p>
            <div className="flex-1 h-px bg-gray-300" />
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto sidebar-scroll">

          {/* User Profile Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#1A56DB] text-white flex items-center justify-center font-bold text-base shrink-0">
                {currentUser.fullName.charAt(0)}
              </div>
              <div className="overflow-hidden flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{currentUser.fullName}</p>
                <span className="inline-block text-[10px] font-bold text-[#1A56DB] bg-[#1A56DB]/10 px-2 py-0.5 rounded-full uppercase tracking-wider mt-0.5">
                  {currentUser.role === 'ADMIN' ? 'ADMIN' : 'USER'}
                </span>
              </div>
            </div>
            <button onClick={handleLogout}
              className="btn-press w-full text-xs font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 py-2 rounded-xl transition-all flex items-center justify-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
              Déconnexion
            </button>
          </div>

          {/* Application Nav */}
          <div>
            <p className="px-4 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Application</p>
            <div className="space-y-1">
              {[
                { view: 'search', label: 'Recherche Ciblée', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
                { view: 'mass_search', label: 'Recherche de Masse', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
                { view: 'records', label: 'Registre Général', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
                { view: 'bordereau', label: "Bordereau d'Envoi", icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
              ].map(item => (
                <button key={item.view} onClick={() => setCurrentView(item.view as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    currentView === item.view
                      ? 'bg-[#1A56DB] text-white shadow-lg'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon}/></svg>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Administration (admin only) */}
          {currentUser.role === 'ADMIN' && (
            <div>
              <p className="px-4 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Administration</p>
              <div className="space-y-1">
                <button onClick={() => setCurrentView('users')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    currentView === 'users'
                      ? 'bg-[#1A56DB] text-white shadow-lg'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                  Utilisateurs
                </button>
              </div>
            </div>
          )}

          {/* Importation Documents */}
          <div>
            <p className="px-4 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Importation Documents</p>
            <div className="space-y-1">
              {[
                { key: 'docPermis', label: 'Permis', icon: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0' },
                { key: 'docBrevetMarch', label: 'Brevet Marchandises', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { key: 'docBrevetDang', label: 'Brevet Mat. Dang.', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
                { key: 'docBrevetPers', label: 'Brevet Personnel', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
              ].map(item => (
                <button key={item.key} onClick={() => openBulkImport(item.key as any, item.label)}
                  className="btn-press w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all active:scale-95">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon}/></svg>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions de Base */}
          <div>
            <p className="px-4 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Actions de Base</p>
            <div className="space-y-1">
              <button onClick={() => setActiveModal('ADD')}
                className="btn-press w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all active:scale-95">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                Nouveau Dossier
              </button>
              <button onClick={handleInternalSave} disabled={isSyncing}
                className="btn-press w-full flex items-center gap-3 px-4 py-3 mt-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-md transition-all disabled:opacity-40">
                <svg className={`w-4 h-4 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                {isSyncing ? "Sauvegarde…" : "Sauvegarder"}
              </button>
              {lastSaved && <p className="text-[10px] text-center text-gray-400 mt-1.5 italic">Synchro : {lastSaved}</p>}
            </div>
          </div>

          {/* Export Excel */}
          <div>
            <p className="px-4 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Export Excel</p>
            <div className="space-y-1">
              {currentUser?.role === 'ADMIN' && (
                <button onClick={handleExportZipPackage}
                  className="btn-press w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-95 shadow-sm">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  Export Complet (.zip)
                </button>
              )}
              <button onClick={handleExportAllExcel}
                className="btn-press w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 border border-gray-200 transition-all active:scale-95">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Exporter Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* Import / Export SQLite */}
          <div>
            <p className="px-4 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Import / Export SQLite</p>
            <div className="space-y-1">
              <button onClick={handleExportDB}
                className="btn-press w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-[#1A56DB] hover:bg-gray-100 transition-all active:scale-95">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Exporter (.db)
              </button>
              <button onClick={() => setActiveModal('IMPORT')}
                className="btn-press w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all active:scale-95">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                Importer (.db)
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          {currentUser.role === 'ADMIN' && (
            <div className="pt-3 border-t border-gray-200">
              <button onClick={() => setActiveModal('CONFIRM_CLEAR')}
                className="btn-press w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all active:scale-95">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Vider la Base
              </button>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-100/50 shrink-0">
          <p className="text-[9px] text-gray-400 font-medium uppercase tracking-widest">Développé par</p>
          <p className="text-xs font-bold text-[#1A56DB] mt-0.5">By AMROUS Ayham</p>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {currentView === 'bordereau' ? (
          <BordereauEnvoi workers={workers} currentUser={currentUser} />
        ) : (
        <>
        <header className="px-8 pt-6 pb-5 flex justify-between items-center border-b border-gray-200 bg-white/80 backdrop-blur-sm">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              {currentView === 'search' ? 'Recherche Ciblée' : currentView === 'mass_search' ? 'Recherche de Masse' : currentView === 'users' ? 'Utilisateurs' : 'Registre Général'}
            </h1>
            <p className="text-gray-400 text-xs font-medium mt-0.5">CSGM AMROUS · Gestion Materiel HMD</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-4 py-2">
              <div className={`w-1.5 h-1.5 rounded-full ${workers.length > 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
              <span className="text-xs font-semibold text-gray-500">{workers.length.toLocaleString()} dossiers</span>
            </div>
            <button onClick={handleInternalSave} disabled={isSyncing}
              className="btn-press flex items-center gap-2 bg-[#1A56DB] hover:bg-[#1E40AF] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors shadow-lg shadow-blue-500/15 disabled:opacity-50">
              <svg className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              {isSyncing ? "Sync…" : "Sauvegarder"}
            </button>
          </div>
        </header>

        {/* TOAST DE SUCCES */}
        {showSaveToast && (
          <div className="absolute top-20 right-8 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-up z-[100] border border-gray-200">
            <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <span className="text-sm font-semibold">Modifications enregistrées</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-8 pb-10">
          
          {/* ÉCRAN DE RECHERCHE UNIFIÉ */}
          {currentView === 'search' && (
            <div className="max-w-4xl mx-auto w-full pt-4 space-y-5 animate-fade-in">
              <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="flex p-1.5 bg-gray-50 border-b border-gray-200">
                  <button 
                    onClick={() => setSearchMode('id')}
                    className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 ${searchMode === 'id' ? 'bg-gray-100 text-[#1A56DB] border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    Par Matricule
                  </button>
                  <button 
                    onClick={() => setSearchMode('name')}
                    className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 ${searchMode === 'name' ? 'bg-gray-100 text-[#1A56DB] border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Par Identité
                  </button>
                </div>

                <div className="p-8">
                  {searchMode === 'id' ? (
                    <div className="max-w-xl mx-auto">
                      <p className="text-gray-500 text-sm font-medium text-center mb-6">Saisissez le matricule pour une consultation immédiate</p>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          placeholder="Ex: 10254"
                          value={searchQuery}
                          onKeyPress={handleKeyPress}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^\d*$/.test(val)) setSearchQuery(val);
                          }}
                          className="premium-input flex-1 pl-5 pr-5 py-3 bg-gray-100 border border-gray-200 rounded-xl text-lg font-semibold text-gray-900 placeholder-gray-400 focus:bg-gray-100"
                        />
                        <button onClick={handleSearch} className="btn-press bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-semibold px-8 py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/20">Chercher</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-500 text-sm font-medium text-center mb-6">Recherchez un collaborateur par ses noms et prénoms</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest pl-1">Nom de famille</label>
                          <input
                            type="text"
                            placeholder="BENALI"
                            value={searchNom}
                            onKeyPress={handleKeyPress}
                            onChange={(e) => setSearchNom(e.target.value)}
                            className="premium-input w-full px-5 py-3 bg-gray-100 border border-gray-200 rounded-xl font-semibold text-gray-800 placeholder-gray-400 focus:bg-gray-100"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest pl-1">Prénom</label>
                          <input
                            type="text"
                            placeholder="Ahmed"
                            value={searchPrenom}
                            onKeyPress={handleKeyPress}
                            onChange={(e) => setSearchPrenom(e.target.value)}
                            className="premium-input w-full px-5 py-3 bg-gray-100 border border-gray-200 rounded-xl font-semibold text-gray-800 placeholder-gray-400 focus:bg-gray-100"
                          />
                        </div>
                        <div className="md:col-span-2 flex justify-center mt-2">
                           <button onClick={handleNameSearch} className="btn-press bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-semibold px-10 py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            Rechercher
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {searchMode === 'id' && hasSearched && searchResults && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-fade-up shadow-sm">
                  <div className="px-7 py-5 flex justify-between items-center border-b border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#1A56DB]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-gray-900 tracking-tight">{searchResults.nom} {searchResults.prenom}</h4>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-0.5">Matricule #{searchResults.matricule} · {searchResults.fonction}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setActiveModal('EDIT')} className="btn-press bg-gray-100 hover:bg-gray-100 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm transition-colors border border-gray-200">Modifier</button>
                      {currentUser.role === 'ADMIN' && (
                        <button onClick={() => { setTargetMatricule(searchResults.matricule); setActiveModal('CONFIRM_DELETE'); }} className="btn-press bg-red-50 hover:bg-red-50 text-red-600 font-semibold px-4 py-2 rounded-lg text-sm transition-colors border border-red-200">Supprimer</button>
                      )}
                    </div>
                  </div>
                  <div className="p-8 flex flex-col gap-8">
                    {/* AUDIT INFO DISPLAY */}
                    <div className="flex flex-col md:flex-row gap-4 mb-4 text-xs bg-gray-50 p-4 rounded-xl border border-gray-200">
                       <div className="flex flex-col">
                          <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Créé par</span>
                          <span className="font-semibold text-gray-700">{searchResults.createdBy || '-'}</span>
                          <span className="text-[10px] text-gray-500">{searchResults.createdAt || '-'}</span>
                       </div>
                       <div className="w-px bg-gray-100 hidden md:block"></div>
                       <div className="flex flex-col">
                          <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Dernière modif. par</span>
                          <span className="font-semibold text-gray-700">{searchResults.lastModifiedBy || '-'}</span>
                          <span className="text-[10px] text-gray-500">{searchResults.updatedAt || '-'}</span>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-2">
                      <div>
                        <InfoRow label="Identité Nom" value={searchResults.nom} />
                        <InfoRow label="Identité Prénom" value={searchResults.prenom} />
                        {/* Dates Removed */}
                      </div>
                      <div>
                        <InfoRow label="Poste occupé" value={searchResults.fonction} />
                        <InfoRow label="Chantier" value={searchResults.chantier || '-'} />
                        <InfoRow label="Affair" value={searchResults.affair || '-'} />
                        {/* Dates Removed */}
                      </div>
                    </div>

                    {(searchResults.fonction.toUpperCase().includes('CHAUFFEUR') || searchResults.fonction.toUpperCase().includes('GRUTIER')) && (
                      <div className="border-t border-gray-200 pt-10">
                         <h3 className="text-xs font-semibold text-[#1A56DB] uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
                          Documents Spécifiques (Chauffeur / Grutier)
                        </h3>
                        {/* Per-section Numéro & Date d'expiration */}
                        {(() => {
                          const todayStr = new Date().toISOString().split('T')[0];
                          const brevets = [
                            { label: 'Permis de Conduire', num: searchResults.numeroPermis, date: searchResults.dateExpirationPermis },
                            { label: 'Br. Marchandises', num: searchResults.numeroBrevetMarch, date: searchResults.dateExpirationBrevetMarch },
                            { label: 'Br. Matières Dang.', num: searchResults.numeroBrevetDang, date: searchResults.dateExpirationBrevetDang },
                            { label: 'Br. Personnel', num: searchResults.numeroBrevetPers, date: searchResults.dateExpirationBrevetPers },
                          ].filter(b => b.num || b.date);
                          if (brevets.length === 0) return null;
                          return (
                            <div className="mb-6 grid grid-cols-2 gap-3">
                              {brevets.map(b => {
                                const expired = b.date && b.date < todayStr;
                                return (
                                  <div key={b.label} className={`p-3 rounded-xl border flex flex-col gap-1 ${expired ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-200'}`}>
                                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">{b.label}</span>
                                    {b.num && <span className="font-semibold text-gray-800 text-sm">{b.num}</span>}
                                    {b.date && (
                                      <span className={`text-xs font-semibold flex items-center gap-1 ${expired ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {expired ? '⚠ Expiré' : '✓ Valide'} — {b.date}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <DocumentPreview 
                            label="Permis de Conduire" 
                            data={searchResults.docPermis} 
                            filename={`${searchResults.nom}_${searchResults.prenom}_${searchResults.matricule}_Permis`}
                            originalFilename={searchResults.docPermisFilename}
                            field="docPermis" 
                            onDownload={handleDownload}
                            onRemove={handleRemoveDoc}
                            onView={handleView}
                            isReadOnly={currentUser.role !== 'ADMIN'}
                            numero={searchResults.numeroPermis}
                            dateExpiration={searchResults.dateExpirationPermis}
                          />
                          <DocumentPreview 
                            label="Brevet Marchandises" 
                            data={searchResults.docBrevetMarch} 
                            filename={`${searchResults.nom}_${searchResults.prenom}_${searchResults.matricule}_Brevet_March`}
                            originalFilename={searchResults.docBrevetMarchFilename}
                            field="docBrevetMarch" 
                            onDownload={handleDownload}
                            onRemove={handleRemoveDoc}
                            onView={handleView}
                            isReadOnly={currentUser.role !== 'ADMIN'}
                            numero={searchResults.numeroBrevetMarch}
                            dateExpiration={searchResults.dateExpirationBrevetMarch}
                          />
                          <DocumentPreview 
                            label="Brevet Matières Dangereuses" 
                            data={searchResults.docBrevetDang} 
                            filename={`${searchResults.nom}_${searchResults.prenom}_${searchResults.matricule}_Brevet_Dangereux`}
                            originalFilename={searchResults.docBrevetDangFilename}
                            field="docBrevetDang" 
                            onDownload={handleDownload}
                            onRemove={handleRemoveDoc}
                            onView={handleView}
                            isReadOnly={currentUser.role !== 'ADMIN'}
                            numero={searchResults.numeroBrevetDang}
                            dateExpiration={searchResults.dateExpirationBrevetDang}
                          />
                          <DocumentPreview 
                            label="Brevet Personnel" 
                            data={searchResults.docBrevetPers} 
                            filename={`${searchResults.nom}_${searchResults.prenom}_${searchResults.matricule}_Brevet_Personnel`}
                            originalFilename={searchResults.docBrevetPersFilename}
                            field="docBrevetPers" 
                            onDownload={handleDownload}
                            onRemove={handleRemoveDoc}
                            onView={handleView}
                            isReadOnly={currentUser.role !== 'ADMIN'}
                            numero={searchResults.numeroBrevetPers}
                            dateExpiration={searchResults.dateExpirationBrevetPers}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {searchMode === 'id' && hasSearched && !searchResults && (
                <div className="p-16 text-center bg-white border border-gray-200 rounded-2xl shadow-sm animate-fade-up">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </div>
                  <p className="text-gray-700 font-semibold mb-1">Aucun résultat</p>
                  <p className="text-gray-500 text-sm">Aucun dossier ne correspond à ce matricule.</p>
                </div>
              )}

              {searchMode === 'name' && hasSearchedByName && nameSearchResults.length > 0 && (
                <div className="space-y-3 animate-fade-up">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest px-1">{nameSearchResults.length} résultat(s)</p>
                  <div className="grid grid-cols-1 gap-2">
                    {nameSearchResults.map(worker => (
                      <div key={worker.matricule} className="bg-white border border-gray-200 rounded-xl flex items-center justify-between px-5 py-3.5 hover:border-[#7ecde8]/20 hover:bg-gray-50 transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-100 text-[#1A56DB] rounded-lg flex items-center justify-center font-bold text-sm group-hover:bg-[#1A56DB] group-hover:text-white group-hover:text-white transition-all">
                            {worker.nom[0]}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 text-sm">{worker.nom} {worker.prenom}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] font-semibold text-[#1A56DB] bg-blue-100 px-1.5 py-0.5 rounded uppercase">#{worker.matricule}</span>
                              <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">{worker.fonction}</span>
                            </div>
                          </div>
                        </div>
                        <button 
                           onClick={() => {
                             setSearchResults(worker);
                             setHasSearched(true);
                             setSearchQuery(worker.matricule);
                             setSearchMode('id');
                           }}
                           className="btn-press bg-gray-100 hover:bg-[#1A56DB] hover:text-white text-gray-500 font-semibold text-xs px-4 py-2 rounded-lg transition-all border border-gray-200"
                         >
                           Voir fiche
                         </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ÉCRAN RECHERCHE DE MASSE */}
          {currentView === 'mass_search' && (
            <div className="max-w-6xl mx-auto w-full pt-4 space-y-4 animate-fade-in">
              <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm relative overflow-hidden">
                 {/* Export Button and Badge */}
                 <div className="absolute top-5 right-6 z-10 flex items-center gap-2">
                     <button
                        onClick={handleExportExcel}
                        className="btn-press bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 rounded-lg font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all"
                     >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Excel
                     </button>
                     {currentUser?.role === 'ADMIN' && (
                     <button
                        onClick={handleExportDriversZip}
                        className="btn-press bg-blue-50 text-[#1A56DB] border border-blue-200 hover:bg-blue-100 px-3 py-2 rounded-lg font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all"
                     >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                        ZIP
                     </button>
                     )}

                     {activeResultsCount !== null && (
                        <div className="bg-[#1A56DB] text-white px-4 py-1.5 rounded-xl flex items-center gap-2 min-w-max shadow-lg shadow-blue-500/20">
                           <span className="text-[9px] font-semibold uppercase tracking-wider opacity-70">Total</span>
                           <span className="text-lg font-bold leading-none">{activeResultsCount.toLocaleString()}</span>
                        </div>
                     )}
                 </div>

                 <div className="max-w-4xl mx-auto space-y-5 pt-2">
                    <div className="mb-2">
                       <h3 className="text-base font-bold text-gray-900">Filtre de Masse</h3>
                       <p className="text-sm text-gray-500 mt-0.5">Recherchez et filtrez l'effectif global par critères</p>
                    </div>

                    {/* Active Filters Tags */}
                    {activeFilterTags.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-2 mb-2 animate-fade-in">
                        {activeFilterTags.map(tag => (
                          <span key={tag.id} className="bg-blue-100 text-[#1A56DB] px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center gap-2 border border-blue-200">
                            {tag.label}
                            <button onClick={tag.clearAction} className="hover:text-red-600 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </span>
                        ))}
                        <button 
                          onClick={clearAllFilters}
                          className="ml-2 text-red-500 hover:text-red-600 text-[10px] font-semibold uppercase tracking-widest border-b border-red-200 hover:border-rose-400 transition-all"
                        >
                          Effacer tout
                        </button>
                      </div>
                    )}

                    <div className="bg-gray-50 p-1.5 rounded-2xl border border-gray-200 flex flex-col md:flex-row gap-1.5 transition-all focus-within:border-blue-300 focus-within:bg-gray-100 shadow-sm">
                       {/* Fonction Input */}
                       <div className="flex-1 relative group">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                             <svg className="w-4 h-4 text-gray-400 group-focus-within:text-[#1A56DB] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </div>
                          <input
                            type="text"
                            placeholder="Fonction..."
                            value={massSearchFonction}
                            onChange={(e) => setMassSearchFonction(e.target.value)}
                            onKeyDown={handleMassSearchKeyDown}
                            className="w-full pl-9 pr-4 py-2.5 bg-transparent border-none focus:ring-0 font-medium text-gray-800 placeholder-gray-400 text-sm outline-none rounded-xl"
                          />
                       </div>
                       
                       {/* Divider */}
                       <div className="w-px bg-gray-100 my-1.5 hidden md:block"></div>
                       <div className="h-px bg-gray-100 mx-1.5 md:hidden"></div>

                       {/* Chantier Input */}
                       <div className="md:w-1/3 relative group">
                           <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                             <svg className="w-4 h-4 text-gray-400 group-focus-within:text-[#1A56DB] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                          </div>
                          <input
                            type="text"
                            placeholder="Chantier..."
                            value={massSearchChantier}
                            onChange={(e) => setMassSearchChantier(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-transparent border-none focus:ring-0 font-medium text-gray-800 placeholder-gray-400 text-sm outline-none rounded-xl"
                          />
                       </div>

                       {/* User Filter Input (Admin Only) */}
                       {currentUser?.role === 'ADMIN' && (
                         <>
                           <div className="w-px bg-gray-100 my-1.5 hidden md:block"></div>
                           <div className="h-px bg-gray-100 mx-1.5 md:hidden"></div>
                           <div className="md:w-1/4 relative group">
                               <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                 <svg className="w-4 h-4 text-gray-400 group-focus-within:text-[#1A56DB] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              </div>
                              <input
                                type="text"
                                placeholder="Utilisateur..."
                                value={massSearchUser}
                                onChange={(e) => setMassSearchUser(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-transparent border-none focus:ring-0 font-medium text-gray-800 placeholder-gray-400 text-sm outline-none rounded-xl"
                              />
                           </div>
                         </>
                       )}
                    </div>
                 </div>
              </section>

              {/* ── Filtre par mois/année d'expiration de brevet ── */}
              {(() => {
                const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
                const hasActive = massSearchBrevetMode === 'single'
                  ? (massSearchBrevetMonth || massSearchBrevetYear)
                  : (massSearchBrevetMonthFrom || massSearchBrevetMonthTo || massSearchBrevetYear);
                const selectCls = (active: boolean) => `premium-input flex-1 min-w-[130px] border rounded-xl px-3 py-2 text-sm font-medium outline-none transition-all ${active ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-gray-200 text-gray-500 bg-gray-50'}`;
                return (
                <section className="bg-white rounded-2xl border border-gray-200 px-5 py-4 shadow-sm">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center border border-amber-200">
                          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Expiration Brevet</p>
                          <p className="text-xs font-medium text-gray-500">Tous types confondus</p>
                        </div>
                      </div>

                      {/* Mode toggle */}
                      <div className="flex gap-1 p-1 bg-gray-50 rounded-xl border border-gray-200 shrink-0">
                        <button
                          onClick={() => { setMassSearchBrevetMode('single'); setMassSearchBrevetMonthFrom(''); setMassSearchBrevetMonthTo(''); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${massSearchBrevetMode === 'single' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Mois précis
                        </button>
                        <button
                          onClick={() => { setMassSearchBrevetMode('interval'); setMassSearchBrevetMonth(''); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${massSearchBrevetMode === 'interval' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Intervalle
                        </button>
                      </div>

                      {hasActive && (
                        <span className="text-[9px] font-semibold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 uppercase tracking-wide shrink-0">
                          Filtre actif
                        </span>
                      )}
                    </div>

                    {/* Filter inputs row */}
                    <div className="flex gap-2.5 flex-wrap items-center">
                      {massSearchBrevetMode === 'single' ? (
                        <select
                          value={massSearchBrevetMonth}
                          onChange={e => setMassSearchBrevetMonth(e.target.value)}
                          className={selectCls(!!massSearchBrevetMonth)}
                        >
                          <option value="">Tous les mois</option>
                          {MONTH_NAMES.map((m, i) => (
                            <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <select
                            value={massSearchBrevetMonthFrom}
                            onChange={e => setMassSearchBrevetMonthFrom(e.target.value)}
                            className={selectCls(!!massSearchBrevetMonthFrom)}
                          >
                            <option value="">De (mois)</option>
                            {MONTH_NAMES.map((m, i) => (
                              <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>
                            ))}
                          </select>
                          <span className="text-gray-500 font-black text-sm shrink-0">→</span>
                          <select
                            value={massSearchBrevetMonthTo}
                            onChange={e => setMassSearchBrevetMonthTo(e.target.value)}
                            className={selectCls(!!massSearchBrevetMonthTo)}
                          >
                            <option value="">À (mois)</option>
                            {MONTH_NAMES.map((m, i) => (
                              <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>
                            ))}
                          </select>
                        </>
                      )}

                      <select
                        value={massSearchBrevetYear}
                        onChange={e => setMassSearchBrevetYear(e.target.value)}
                        className={selectCls(!!massSearchBrevetYear)}
                      >
                        <option value="">Toutes les années</option>
                        {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
                          <option key={y} value={String(y)}>{y}</option>
                        ))}
                      </select>

                      {hasActive && (
                        <button
                          onClick={() => { setMassSearchBrevetMonth(''); setMassSearchBrevetYear(''); setMassSearchBrevetMonthFrom(''); setMassSearchBrevetMonthTo(''); }}
                          className="btn-press px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg font-semibold text-xs transition-all border border-red-200 flex items-center gap-1.5 shrink-0"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                          Effacer
                        </button>
                      )}
                    </div>
                  </div>
                </section>
                );
              })()}

              {massSearchResults.length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-up">
                  <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{massSearchResults.length} résultat(s)</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-[550px]">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-gray-50 z-10">
                        <tr className="border-b border-gray-200">
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Matricule</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Collaborateur</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Fonction</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Documents</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Activité</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {massSearchResults.map(worker => {
                           // Define the 4 documents we are interested in
                           const docs = [
                             { key: 'docPermis', utilKey: 'docPermisUtilisation', label: 'PERMIS' },
                             { key: 'docBrevetMarch', utilKey: 'docBrevetMarchUtilisation', label: 'BR. MARCH.' },
                             { key: 'docBrevetDang', utilKey: 'docBrevetDangUtilisation', label: 'BR. DANG.' },
                             { key: 'docBrevetPers', utilKey: 'docBrevetPersUtilisation', label: 'BR. PERS.' },
                           ];

                           // Check if worker role is Chauffeur or Grutier
                           const isSpecialRole = worker.fonction.toUpperCase().includes('CHAUFFEUR') || 
                                                 worker.fonction.toUpperCase().includes('GRUTIER');
                           
                           // Per-brevet expiration check
                           const todayStr = new Date().toISOString().split('T')[0];
                           const brevetBadges = isSpecialRole ? [
                             { label: 'Permis', date: worker.dateExpirationPermis },
                             { label: 'March.', date: worker.dateExpirationBrevetMarch },
                             { label: 'Dang.', date: worker.dateExpirationBrevetDang },
                             { label: 'Pers.', date: worker.dateExpirationBrevetPers },
                           ].filter(b => b.date) : [];

                           return (
                              <tr key={worker.matricule} className="table-row-hover border-b border-gray-100 last:border-0 group">
                                <td className="px-5 py-3 text-xs font-semibold text-[#1A56DB]">{worker.matricule}</td>
                                <td className="px-5 py-3 text-xs text-gray-800 font-medium">
                                   {worker.nom} {worker.prenom}
                                   {brevetBadges.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                         {brevetBadges.map(b => {
                                           const expired = b.date! < todayStr;
                                           return (
                                             <span key={b.label} className={`px-1.5 py-0.5 rounded-md text-[8px] font-semibold uppercase ${expired ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                               {b.label}: {expired ? 'Exp.' : 'OK'}
                                             </span>
                                           );
                                         })}
                                      </div>
                                   )}
                                </td>
                                <td className="px-5 py-3 text-xs text-gray-500">{worker.fonction}</td>
                                <td className="px-5 py-3">
                                   {isSpecialRole ? (
                                      <div className="flex flex-wrap gap-1">
                                        {docs.map(doc => {
                                          const fileExists = !!(worker as any)[doc.key];
                                          const utilization = (worker as any)[doc.utilKey];
                                          if (!fileExists) {
                                            return <span key={doc.key} className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase">Manque</span>;
                                          } else if (utilization === 'OUI') {
                                            return <span key={doc.key} className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase">{doc.label}</span>;
                                          } else {
                                            return <span key={doc.key} className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase">{doc.label}</span>;
                                          }
                                        })}
                                      </div>
                                   ) : (
                                     <span className="text-gray-400 text-xs">—</span>
                                   )}
                                </td>
                                <td className="px-5 py-3">
                                  {worker.lastModifiedBy ? (
                                    <span className="text-[9px] text-gray-500">Modifié · <span className="text-gray-500 font-medium">{worker.lastModifiedBy}</span></span>
                                  ) : worker.createdBy ? (
                                    <span className="text-[9px] text-gray-500">Créé · <span className="text-gray-500 font-medium">{worker.createdBy}</span></span>
                                  ) : (
                                    <span className="text-[9px] text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <button 
                                    onClick={() => {
                                      setSearchResults(worker);
                                      setHasSearched(true);
                                      setSearchQuery(worker.matricule);
                                      setSearchMode('id');
                                      setCurrentView('search');
                                    }}
                                    className="btn-press text-[9px] font-semibold text-[#1A56DB] hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors uppercase tracking-wide"
                                  >
                                    Fiche
                                  </button>
                                </td>
                              </tr>
                           );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (massSearchChantier || massSearchFonction || massSearchUser || massSearchBrevetMonth || massSearchBrevetYear) && (
                <div className="p-14 text-center bg-white border border-gray-200 rounded-2xl shadow-sm animate-fade-up">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <p className="text-gray-700 font-semibold mb-1">Aucune correspondance</p>
                  <p className="text-gray-500 text-sm">Aucun dossier ne correspond aux critères sélectionnés.</p>
                </div>
              )}
            </div>
          )}

          {/* RECORDS VIEW */}
          {currentView === 'records' && (
            <div className="max-w-6xl mx-auto w-full pt-4 space-y-4 animate-fade-in">
               <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                 <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                   <div>
                     <h3 className="text-base font-bold text-gray-900">Registre Général</h3>
                     <p className="text-xs text-gray-500 mt-0.5">{workers.length} dossiers au total</p>
                   </div>
                 </div>
                 
                 <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Matricule</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Collaborateur</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Fonction</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Chantier</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Activité</th>
                          <th className="px-5 py-3 text-[9px] font-semibold text-gray-500 uppercase tracking-widest text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {workers.slice(0, 100).map(w => (
                          <tr key={w.matricule} className="table-row-hover">
                            <td className="px-5 py-3 text-xs font-semibold text-[#1A56DB]">{w.matricule}</td>
                            <td className="px-5 py-3 text-xs font-medium text-gray-800">{w.nom} {w.prenom}</td>
                            <td className="px-5 py-3 text-xs text-gray-500">{w.fonction}</td>
                            <td className="px-5 py-3 text-xs text-gray-500">{w.chantier || '—'}</td>
                            <td className="px-5 py-3">
                              {w.lastModifiedBy ? (
                                <span className="text-[9px] text-gray-500">Modifié · <span className="text-gray-500 font-medium">{w.lastModifiedBy}</span></span>
                              ) : (
                                <span className="text-[9px] text-gray-500">Créé · <span className="text-gray-500 font-medium">{w.createdBy}</span></span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                               <button 
                                 onClick={() => {
                                   setSearchResults(w);
                                   setHasSearched(true);
                                   setSearchQuery(w.matricule);
                                   setSearchMode('id');
                                   setCurrentView('search');
                                 }}
                                 className="btn-press text-[9px] font-semibold text-[#1A56DB] hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors uppercase tracking-wide"
                               >
                                 Consulter
                               </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {workers.length > 100 && (
                       <div className="text-center py-3 bg-gray-50 border-t border-gray-200">
                          <p className="text-[9px] text-gray-500 font-medium uppercase tracking-widest">Affichage limité aux 100 premiers résultats</p>
                       </div>
                    )}
                 </div>
               </div>
            </div>
          )}

          {/* USERS VIEW */}
          {currentView === 'users' && currentUser.role === 'ADMIN' && (
            <div className="max-w-4xl mx-auto w-full pt-4 space-y-4 animate-fade-in">

              {/* Pending approvals banner */}
              {users.filter(u => u.status === 'PENDING').length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0 border border-amber-200">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-amber-700 text-sm">{users.filter(u => u.status === 'PENDING').length} inscription(s) en attente d'approbation</p>
                    <p className="text-xs text-amber-600">Faites défiler la liste pour les approuver ou refuser.</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Gestion des Utilisateurs</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{users.length} compte(s) enregistré(s)</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowPasswords(!showPasswords)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${showPasswords ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={showPasswords ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} /></svg>
                      {showPasswords ? 'Masquer MDP' : 'Voir MDP'}
                    </button>
                    <button
                      onClick={() => { setNewUserError(''); setActiveModal('ADD_USER'); }}
                      className="flex items-center gap-2 px-5 py-2 bg-[#1A56DB] text-white rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-[#1E40AF] transition-all shadow-lg shadow-blue-500/20"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                      Ajouter
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="px-6 py-3 border-b border-gray-100">
                  <input
                    type="text"
                    placeholder="Rechercher un utilisateur..."
                    value={userSearchQuery}
                    onChange={e => setUserSearchQuery(e.target.value)}
                    className="premium-input w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium text-gray-800 placeholder-gray-400 focus:bg-gray-100"
                  />
                </div>

                {/* User list */}
                <div className="divide-y divide-gray-100">
                  {filteredUsers.map((u, i) => (
                    <div key={i} className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors ${u.status === 'PENDING' ? 'bg-amber-50/50' : ''}`}>
                      <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${u.role === 'ADMIN' ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-[#1A56DB]'}`}>
                          {u.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-800 text-sm">{u.fullName}</p>
                            {u.status === 'PENDING' && (
                              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide border border-amber-200">En attente</span>
                            )}
                            {u.role === 'ADMIN' && (
                              <span className="bg-blue-100 text-[#1A56DB] px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide">Admin</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 font-medium mt-0.5">{u.username}</p>
                          {showPasswords && (
                            <p className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded mt-1 border border-emerald-200">
                              {decrypt(u.password)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.status === 'PENDING' && (
                          <button
                            onClick={() => handleApproveUser(u.username)}
                            className="btn-press flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-semibold hover:bg-emerald-100 transition-colors border border-emerald-200"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                            Approuver
                          </button>
                        )}
                        {u.username !== currentUser.username && (
                          <button
                            onClick={() => handleDeleteUser(u.username)}
                            className="btn-press flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-semibold hover:bg-red-50 hover:text-red-600 transition-colors border border-gray-200"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50">
                  <p className="text-[9px] text-gray-400 text-center">{APP_CREDITS}</p>
                </div>
              </div>
            </div>
          )}

        </div>
        </>
        )}
      </main>

      {/* MODALS RENDER LOGIC */}
      
      {activeModal === 'ADD' && (
        <WorkerForm onSave={saveWorker} onCancel={() => setActiveModal(null)} />
      )}

      {activeModal === 'EDIT' && searchResults && (
        <WorkerForm 
          initialData={searchResults} 
          onSave={saveWorker} 
          onCancel={() => setActiveModal(null)} 
          isEdit 
        />
      )}

      {activeModal === 'IMPORT' && (
        <ImportModal
          onClose={() => setActiveModal(null)}
          onImportComplete={handleImportComplete}
          currentUser={currentUser}
          users={users}
        />
      )}

      {activeModal === 'BULK_DOC_IMPORT' && bulkImportConfig && (
        <BulkDocImportModal
          config={bulkImportConfig}
          workers={workers}
          onClose={() => setActiveModal(null)}
          onConfirm={handleBulkImportConfirm}
        />
      )}

      {activeModal === 'CONFIRM_DELETE' && (() => {
        const [delPwd, setDelPwd] = React.useState('');
        const [delErr, setDelErr] = React.useState('');
        const [delShow, setDelShow] = React.useState(false);
        const confirmDelete = () => {
          const adminUser = users.find(u => u.role === 'ADMIN');
          if (!adminUser || decrypt(adminUser.password) !== delPwd) { setDelErr('Mot de passe administrateur incorrect.'); return; }
          executeDelete();
        };
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-sm w-full overflow-hidden animate-scale-in">
              <div className="p-8">
                <div className="text-center mb-5">
                  <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Confirmer la suppression</h3>
                  <p className="text-gray-500 text-sm">Cette action est irréversible. Entrez le mot de passe administrateur pour confirmer.</p>
                </div>
                <div className="relative mb-2">
                  <input type={delShow ? 'text' : 'password'} value={delPwd} onChange={e => { setDelPwd(e.target.value); setDelErr(''); }}
                    onKeyDown={e => e.key === 'Enter' && confirmDelete()}
                    placeholder="Mot de passe administrateur"
                    className="w-full px-4 py-3 pr-11 bg-gray-100 border border-gray-200 rounded-xl focus:outline-none focus:border-red-400 font-semibold text-gray-800 placeholder-gray-400 text-sm" />
                  <button type="button" onClick={() => setDelShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{delShow ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/> : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>}</svg>
                  </button>
                </div>
                {delErr && <p className="text-xs font-semibold text-red-500 mb-3">{delErr}</p>}
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2.5 text-gray-500 font-semibold hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors">Annuler</button>
                  <button onClick={confirmDelete} className="flex-1 px-4 py-2.5 bg-rose-500 text-white font-semibold rounded-xl hover:bg-rose-600 transition-colors">Supprimer</button>
                </div>
              </div>
              <div className="px-8 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-[10px] text-gray-400 text-center">{APP_CREDITS}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {activeModal === 'CONFIRM_CLEAR' && (() => {
        const [clrPwd, setClrPwd] = React.useState('');
        const [clrErr, setClrErr] = React.useState('');
        const [clrShow, setClrShow] = React.useState(false);
        const confirmClear = () => {
          const adminUser = users.find(u => u.role === 'ADMIN');
          if (!adminUser || decrypt(adminUser.password) !== clrPwd) { setClrErr('Mot de passe administrateur incorrect.'); return; }
          executeClear();
        };
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-sm w-full overflow-hidden animate-scale-in">
              <div className="p-8">
                <div className="text-center mb-5">
                  <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Vider la base de données ?</h3>
                  <p className="text-gray-500 text-sm">Toutes les données seront effacées définitivement. Entrez le mot de passe administrateur pour confirmer.</p>
                </div>
                <div className="relative mb-2">
                  <input type={clrShow ? 'text' : 'password'} value={clrPwd} onChange={e => { setClrPwd(e.target.value); setClrErr(''); }}
                    onKeyDown={e => e.key === 'Enter' && confirmClear()}
                    placeholder="Mot de passe administrateur"
                    className="w-full px-4 py-3 pr-11 bg-gray-100 border border-gray-200 rounded-xl focus:outline-none focus:border-red-400 font-semibold text-gray-800 placeholder-gray-400 text-sm" />
                  <button type="button" onClick={() => setClrShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{clrShow ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/> : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>}</svg>
                  </button>
                </div>
                {clrErr && <p className="text-xs font-semibold text-red-500 mb-3">{clrErr}</p>}
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2.5 text-gray-500 font-semibold hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors">Annuler</button>
                  <button onClick={confirmClear} className="flex-1 px-4 py-2.5 bg-rose-500 text-white font-semibold rounded-xl hover:bg-rose-600 transition-colors">Tout Effacer</button>
                </div>
              </div>
              <div className="px-8 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-[10px] text-gray-400 text-center">{APP_CREDITS}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ADD USER MODAL */}
      {activeModal === 'ADD_USER' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-gray-200 animate-scale-in">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-gray-900">Ajouter un utilisateur</h2>
                <p className="text-xs text-gray-500 mt-0.5">Créer un nouveau compte d'accès</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {newUserError && (
                <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{newUserError}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest pl-0.5">Nom</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={e => { setNewUserName(e.target.value.toUpperCase()); setNewUserError(''); }}
                    placeholder="NOM"
                    className="premium-input w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 font-semibold text-gray-800 placeholder-gray-400 text-sm uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest pl-0.5">Prénom</label>
                  <input
                    type="text"
                    value={newUserSurname}
                    onChange={e => { setNewUserSurname(e.target.value); setNewUserError(''); }}
                    placeholder="Prénom"
                    className="premium-input w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 font-semibold text-gray-800 placeholder-gray-400 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest pl-0.5">Mot de passe</label>
                <input
                  type="text"
                  value={newUserPassword}
                  onChange={e => { setNewUserPassword(e.target.value); setNewUserError(''); }}
                  placeholder="Mot de passe"
                  className="premium-input w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 font-semibold text-gray-800 placeholder-gray-400 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest pl-0.5">Rôle</label>
                <div className="flex gap-2 p-1 bg-gray-100 rounded-xl border border-gray-200">
                  <button
                    onClick={() => setNewUserRole('USER')}
                    className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${newUserRole === 'USER' ? 'bg-blue-50 text-[#1A56DB] border border-blue-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Utilisateur
                  </button>
                  <button
                    onClick={() => setNewUserRole('ADMIN')}
                    className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${newUserRole === 'ADMIN' ? 'bg-blue-50 text-[#1A56DB] border border-blue-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Administrateur
                  </button>
                </div>
              </div>
              <button
                onClick={handleAddUser}
                className="btn-press w-full bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/20 mt-1"
              >
                Créer le compte
              </button>
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-[9px] text-gray-400 text-center">{APP_CREDITS}</p>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Filter Modal */}
      {showAdvancedFilterModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
           <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-gray-200 animate-scale-in">
              <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">Filtres Avancés (Brevets)</h2>
                <button onClick={() => setShowAdvancedFilterModal(false)} className="text-gray-500 hover:text-red-600 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 space-y-6 overflow-y-auto max-h-[65vh]">
                 <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700">Aucun Brevet</span>
                    <button 
                       onClick={() => handleAdvancedFilterChange('aucunBrevet', !advancedFilters.aucunBrevet)}
                       className={`w-12 h-6 rounded-full p-1 transition-colors ${advancedFilters.aucunBrevet ? 'bg-[#1A56DB]' : 'bg-gray-100'}`}
                    >
                       <div className={`w-4 h-4 bg-white rounded-full transition-transform ${advancedFilters.aucunBrevet ? 'translate-x-6' : ''}`}></div>
                    </button>
                 </div>
                 
                 <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700">Avec Brevet (Au moins un)</span>
                    <button 
                       onClick={() => handleAdvancedFilterChange('avecBrevet', !advancedFilters.avecBrevet)}
                       className={`w-12 h-6 rounded-full p-1 transition-colors ${advancedFilters.avecBrevet ? 'bg-[#1A56DB]' : 'bg-gray-100'}`}
                    >
                       <div className={`w-4 h-4 bg-white rounded-full transition-transform ${advancedFilters.avecBrevet ? 'translate-x-6' : ''}`}></div>
                    </button>
                 </div>
                 
                 <hr className="border-gray-200" />
                 
                 <div className="space-y-4">
                    {/* Permis de Conduire */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] font-semibold text-[#1A56DB] uppercase tracking-wider">Permis de Conduire</span>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-gray-500 uppercase">Expiration</span>
                        <div className="flex gap-1.5">
                          {(['ALL', 'VALID', 'EXPIRED'] as const).map(opt => (
                            <button key={opt} onClick={() => handleAdvancedFilterChange('expirationPermis', opt)}
                              className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold uppercase transition-all ${advancedFilters.expirationPermis === opt ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                              {opt === 'ALL' ? 'Tous' : opt === 'VALID' ? 'Valide' : 'Expiré'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Brevet Marchandises */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] font-semibold text-[#1A56DB] uppercase tracking-wider">Brevet Marchandises</span>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-gray-500 uppercase">Possession / Utilisation</span>
                        <div className="flex gap-1.5">
                          {(['ALL', 'HAS', 'OUI', 'NON'] as const).map(opt => (
                            <button key={opt} onClick={() => handleAdvancedFilterChange('march', opt)}
                              className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold uppercase transition-all ${advancedFilters.march === opt ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                              {opt === 'ALL' ? 'Tous' : opt === 'HAS' ? 'Possède' : opt === 'OUI' ? 'Utilisé' : 'Non Ut.'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-gray-500 uppercase">Expiration</span>
                        <div className="flex gap-1.5">
                          {(['ALL', 'VALID', 'EXPIRED'] as const).map(opt => (
                            <button key={opt} onClick={() => handleAdvancedFilterChange('expirationMarch', opt)}
                              className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold uppercase transition-all ${advancedFilters.expirationMarch === opt ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                              {opt === 'ALL' ? 'Tous' : opt === 'VALID' ? 'Valide' : 'Expiré'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Brevet Matières Dangereuses */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] font-semibold text-[#1A56DB] uppercase tracking-wider">Brevet Matières Dangereuses</span>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-gray-500 uppercase">Possession / Utilisation</span>
                        <div className="flex gap-1.5">
                          {(['ALL', 'HAS', 'OUI', 'NON'] as const).map(opt => (
                            <button key={opt} onClick={() => handleAdvancedFilterChange('dang', opt)}
                              className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold uppercase transition-all ${advancedFilters.dang === opt ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                              {opt === 'ALL' ? 'Tous' : opt === 'HAS' ? 'Possède' : opt === 'OUI' ? 'Utilisé' : 'Non Ut.'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-gray-500 uppercase">Expiration</span>
                        <div className="flex gap-1.5">
                          {(['ALL', 'VALID', 'EXPIRED'] as const).map(opt => (
                            <button key={opt} onClick={() => handleAdvancedFilterChange('expirationDang', opt)}
                              className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold uppercase transition-all ${advancedFilters.expirationDang === opt ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                              {opt === 'ALL' ? 'Tous' : opt === 'VALID' ? 'Valide' : 'Expiré'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Brevet Personnel */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] font-semibold text-[#1A56DB] uppercase tracking-wider">Brevet Personnel</span>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-gray-500 uppercase">Possession / Utilisation</span>
                        <div className="flex gap-1.5">
                          {(['ALL', 'HAS', 'OUI', 'NON'] as const).map(opt => (
                            <button key={opt} onClick={() => handleAdvancedFilterChange('pers', opt)}
                              className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold uppercase transition-all ${advancedFilters.pers === opt ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                              {opt === 'ALL' ? 'Tous' : opt === 'HAS' ? 'Possède' : opt === 'OUI' ? 'Utilisé' : 'Non Ut.'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold text-gray-500 uppercase">Expiration</span>
                        <div className="flex gap-1.5">
                          {(['ALL', 'VALID', 'EXPIRED'] as const).map(opt => (
                            <button key={opt} onClick={() => handleAdvancedFilterChange('expirationPers', opt)}
                              className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold uppercase transition-all ${advancedFilters.expirationPers === opt ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                              {opt === 'ALL' ? 'Tous' : opt === 'VALID' ? 'Valide' : 'Expiré'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                 </div>
              </div>
              <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between items-center">
                 <button onClick={resetAdvancedFilters} className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors">Réinitialiser</button>
                 <button onClick={() => setShowAdvancedFilterModal(false)} className="bg-[#1A56DB] text-white font-semibold px-6 py-2 rounded-xl text-xs uppercase tracking-widest hover:bg-[#1E40AF] transition-colors">Appliquer</button>
              </div>
           </div>
        </div>
      )}

      {/* Password Guard Modal — for document deletion */}
      {pwdGuard && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[350] p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-sm w-full overflow-hidden animate-scale-in">
            <div className="bg-rose-600/90 px-8 py-5 flex items-center gap-3">
              <svg className="w-6 h-6 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              <h2 className="text-lg font-bold text-white">{pwdGuard.label}</h2>
            </div>
            <div className="p-8 space-y-4">
              <p className="text-sm text-gray-500">{pwdGuard.sub}</p>
              <div className="relative">
                <input
                  type={pwdGuardShow ? 'text' : 'password'}
                  value={pwdGuardInput}
                  onChange={e => { setPwdGuardInput(e.target.value); setPwdGuardError(''); }}
                  onKeyDown={e => e.key === 'Enter' && executePwdGuard()}
                  placeholder="Mot de passe administrateur"
                  autoFocus
                  className="w-full px-4 py-3 pr-11 bg-gray-100 border border-gray-200 rounded-xl focus:outline-none focus:border-red-400 font-semibold text-gray-800 placeholder-gray-400 text-sm"
                />
                <button type="button" onClick={() => setPwdGuardShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{pwdGuardShow ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/> : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>}</svg>
                </button>
              </div>
              {pwdGuardError && <p className="text-xs font-semibold text-red-500">{pwdGuardError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setPwdGuard(null); setPwdGuardInput(''); setPwdGuardError(''); }} className="flex-1 px-4 py-2.5 text-gray-500 font-semibold hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors">Annuler</button>
                <button onClick={executePwdGuard} className="flex-1 px-4 py-2.5 bg-rose-500 text-white font-semibold rounded-xl hover:bg-rose-600 transition-colors">Confirmer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {docViewer && (
        <DocViewer
          data={docViewer.data}
          label={docViewer.label}
          filename={docViewer.filename}
          onClose={() => setDocViewer(null)}
        />
      )}

      {/* APP INTRO MODAL */}
      {showIntro && currentUser?.role === 'ADMIN' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[500] p-4">
          <div className="bg-white border border-gray-200 rounded-3xl shadow-xl max-w-lg w-full overflow-hidden"
            style={{ animation: 'introSlideIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <style>{`@keyframes introSlideIn { from { opacity:0; transform:scale(0.88) translateY(24px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>

            {/* Hero */}
            <div className="bg-gradient-to-br from-[#1A56DB] to-[#6366F1] px-10 py-10 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full"></div>
                <div className="absolute -bottom-12 -left-12 w-56 h-56 bg-white rounded-full"></div>
              </div>
              <div className="relative z-10">
                <div className="inline-flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  </div>
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">CSGM AMROUS</h1>
                <p className="text-gray-600 text-sm font-bold uppercase tracking-[0.25em] mt-1">Gestion Materiel HMD</p>
              </div>
            </div>

            {/* Content */}
            <div className="px-10 py-8">
              <p className="text-gray-800 font-bold text-lg mb-1">Welcome to CSGM AMROUS</p>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                A secure, all-in-one personnel and document management platform built for <span className="font-semibold text-[#1A56DB]">HMD construction sites</span>. Manage your workforce, track certifications, and stay on top of expiration dates — all in one place.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', label: 'Worker Profiles', desc: 'Full dossiers for every employee' },
                  { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Brevet Tracking', desc: 'Permits, licenses & expiry alerts' },
                  { icon: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'ZIP / Excel Export', desc: 'Full packages with all documents' },
                  { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Bordereau d\'Envoi', desc: 'Site arrival & departure receipts' },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-[#1A56DB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon}/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                      <p className="text-[10px] text-gray-500 font-medium mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
                <svg className="w-4 h-4 text-[#1A56DB] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p className="text-xs text-[#1A56DB] font-semibold leading-relaxed">
                  All data is stored <span className="font-bold">locally on this device</span> using IndexedDB. Use the ZIP or SQLite export features to back up your data regularly.
                </p>
              </div>

              <button
                onClick={() => { localStorage.setItem('csgm_intro_seen', '1'); setShowIntro(false); }}
                className="w-full py-4 bg-gradient-to-r from-[#1A56DB] to-[#6366F1] text-white font-bold rounded-2xl hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-blue-500/20 text-sm uppercase tracking-widest"
              >
                Get Started →
              </button>
              <p className="text-center text-[10px] text-gray-400 font-medium mt-3">{APP_CREDITS}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Expiry Panel (admin, Ctrl+Shift+F12) ── */}
      {showExpiryPanel && (
        <ExpiryPanel
          currentUser={currentUser}
          onClose={() => {
            setShowExpiryPanel(false);
            const info = getExpiryInfo();
            setIsExpired(info.expired);
            setExpiryDaysLeft(info.daysLeft);
          }}
        />
      )}

      {/* ── App Expired: full-screen block ── */}
      {isExpired && !showExpiryPanel && currentUser?.role !== 'ADMIN' && (
        <div className="fixed inset-0 bg-gray-900/95 backdrop-blur-md flex items-center justify-center z-[9999] p-6">
          <div className="bg-white border border-gray-200 rounded-3xl shadow-xl max-w-md w-full overflow-hidden text-center"
            style={{ animation: 'introSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div className="bg-gradient-to-br from-rose-600 to-rose-700 px-8 pt-10 pb-8">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <h2 className="text-2xl font-black text-white mb-2">Licence Expirée</h2>
              <p className="text-rose-200 text-sm font-bold">L'accès à cette application a expiré.</p>
            </div>
            <div className="px-8 py-8 space-y-4">
              <p className="text-gray-800 font-black text-sm">Pour continuer, veuillez contacter :</p>
              <div className="space-y-3 text-left">
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Propriétaire</p>
                  <p className="text-gray-900 font-black text-base">AMROUS Abdallah</p>
                  <a href="tel:0699407036" className="text-[#1A56DB] font-black text-xl hover:underline tracking-wide">06 99 40 70 36</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Expiry warning indicator (≤14 days remaining) — right-side badge ── */}
      {!isExpired && expiryDaysLeft !== Infinity && expiryDaysLeft <= 14 && !showExpiryPanel && (
        <>
          <button
            onClick={() => currentUser?.role === 'ADMIN' ? setShowExpiryPanel(true) : setShowExpiryContactPopup(true)}
            className="fixed right-4 top-1/2 -translate-y-1/2 z-[300] w-14 h-14 bg-amber-500 hover:bg-amber-400 active:scale-95 rounded-2xl shadow-xl flex flex-col items-center justify-center gap-0.5 transition-all"
            title={`Licence expire dans ${expiryDaysLeft} jour${expiryDaysLeft > 1 ? 's' : ''}`}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span className="text-white font-black text-[10px] leading-none">{expiryDaysLeft}j</span>
          </button>

          {/* Contact popup for normal users */}
          {showExpiryContactPopup && currentUser?.role !== 'ADMIN' && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[400] p-4" onClick={() => setShowExpiryContactPopup(false)}>
              <div className="bg-white border border-gray-200 rounded-3xl shadow-xl max-w-sm w-full overflow-hidden" style={{ animation: 'introSlideIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }} onClick={e => e.stopPropagation()}>
                <div className="bg-amber-500 px-6 py-5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/25 rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-black text-base">Licence Expire Bientôt</p>
                    <p className="text-white/80 text-xs font-bold">Dans {expiryDaysLeft} jour{expiryDaysLeft > 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="px-6 py-6">
                  <p className="text-gray-500 text-sm font-medium leading-relaxed mb-5">
                    La date d'expiration de l'application approche. Veuillez contacter le propriétaire <span className="font-black text-gray-800">AMROUS Abdallah</span> pour obtenir un délai supplémentaire.
                  </p>
                  <a
                    href="tel:0699407036"
                    className="flex items-center justify-center gap-3 w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-white font-black rounded-2xl transition-all active:scale-95 shadow-md text-sm"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    06 99 40 70 36
                  </a>
                  <button onClick={() => setShowExpiryContactPopup(false)} className="w-full mt-3 py-2.5 text-gray-500 font-bold text-sm hover:text-gray-400 transition-all">
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
};

export default App;
