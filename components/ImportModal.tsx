
import React, { useState } from 'react';
import { Worker, User } from '../types';
import { api } from '../utils/api';
import * as XLSX from 'xlsx';

interface ImportModalProps {
  onClose: () => void;
  onImportComplete: (workers: Worker[]) => void;
  currentUser: User;
}

const APP_CREDITS = "Application créée par AMROUS Ayham — Propriété de AMROUS Abdallah";

const fieldMap: Record<string, keyof Worker> = {
  matricule: 'matricule', id: 'matricule', mat: 'matricule', code: 'matricule', num: 'matricule',
  nom: 'nom', last_name: 'nom', surname: 'nom', lastname: 'nom',
  prenom: 'prenom', first_name: 'prenom', firstname: 'prenom',
  fonction: 'fonction', job: 'fonction', poste: 'fonction', occupation: 'fonction',
  wilaya: 'wilaya', ville: 'wilaya', city: 'wilaya', region: 'wilaya',
  affiliation: 'affiliation', service: 'affiliation', dept: 'affiliation',
  chantier: 'chantier', site: 'chantier', project: 'chantier', projet: 'chantier',
  affair: 'affair', affaire: 'affair', code_affaire: 'affair',
};

function mapRow(obj: Record<string, any>): Worker {
  const w: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined || val === '') continue;
    const k = key.toLowerCase().trim().replace(/[^a-z_]/g, '');
    if (fieldMap[k]) { w[fieldMap[k]] = String(val); continue; }
    if (k.includes('naissance') || k.includes('birth')) w.dateNaissance = String(val);
    else if (k.includes('entree') || k.includes('hired') || k.includes('start')) w.dateEntree = String(val);
    else if ((k.includes('fin') || k.includes('end') || k.includes('quit')) && !k.includes('affiliation')) w.dateFin = String(val);
    else if (k.includes('numeropermis') || k === 'n_permis') w.numeroPermis = String(val);
    else if (k.includes('expirationpermis') || k.includes('exp_permis')) w.dateExpirationPermis = String(val);
    else if (k.includes('numerobrevet') && k.includes('march')) w.numeroBrevetMarch = String(val);
    else if (k.includes('expirationbrevet') && k.includes('march')) w.dateExpirationBrevetMarch = String(val);
    else if (k.includes('numerobrevet') && k.includes('dang')) w.numeroBrevetDang = String(val);
    else if (k.includes('expirationbrevet') && k.includes('dang')) w.dateExpirationBrevetDang = String(val);
    else if (k.includes('numerobrevet') && k.includes('pers')) w.numeroBrevetPers = String(val);
    else if (k.includes('expirationbrevet') && k.includes('pers')) w.dateExpirationBrevetPers = String(val);
    else { w[key] = val; }
  }
  return {
    matricule: w.matricule || '0000',
    nom: w.nom || 'INCONNU',
    prenom: w.prenom || '',
    dateNaissance: w.dateNaissance || '',
    fonction: w.fonction || 'NON DÉFINI',
    dateEntree: w.dateEntree || '',
    dateFin: w.dateFin || '',
    wilaya: w.wilaya || '',
    affiliation: w.affiliation || '',
    chantier: w.chantier || '',
    affair: w.affair || '',
    numeroPermis: w.numeroPermis,
    dateExpirationPermis: w.dateExpirationPermis,
    numeroBrevetMarch: w.numeroBrevetMarch,
    dateExpirationBrevetMarch: w.dateExpirationBrevetMarch,
    numeroBrevetDang: w.numeroBrevetDang,
    dateExpirationBrevetDang: w.dateExpirationBrevetDang,
    numeroBrevetPers: w.numeroBrevetPers,
    dateExpirationBrevetPers: w.dateExpirationBrevetPers,
  } as Worker;
}

const ImportModal: React.FC<ImportModalProps> = ({ onClose, onImportComplete, currentUser }) => {
  const [step, setStep] = useState<'confirm' | 'admin_password' | 'loading' | 'success' | 'error'>('confirm');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPwdError, setAdminPwdError] = useState('');
  const [showAdminPwd, setShowAdminPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importCount, setImportCount] = useState(0);

  const processFile = async (file: File) => {
    setStep('loading');
    try {
      const buf = await file.arrayBuffer();
      let imported: Worker[] = [];

      if (file.name.endsWith('.json')) {
        const text = new TextDecoder().decode(buf);
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : parsed.workers ?? Object.values(parsed);
        imported = (arr as any[]).map(mapRow);
      } else {
        // XLSX / XLS / CSV
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
        if (rows.length === 0) throw new Error("La feuille sélectionnée est vide.");
        imported = rows.map(mapRow);
      }

      if (imported.length === 0) throw new Error("Aucun dossier trouvé dans le fichier.");
      setImportCount(imported.length);
      setStep('success');
      setTimeout(() => {
        onImportComplete(imported);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || "Erreur lors de la lecture du fichier.");
      setStep('error');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
  };

  const handleConfirmYes = () => {
    if (!pendingFile) return;
    if (currentUser.role === 'ADMIN') {
      processFile(pendingFile);
    } else {
      setStep('admin_password');
    }
  };

  const handleAdminPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/auth/verify-password', { password: adminPassword });
      if (pendingFile) processFile(pendingFile);
    } catch {
      setAdminPwdError("Mot de passe administrateur incorrect.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-gray-200 animate-scale-in">
        <div className="border-b border-gray-200 px-8 py-5 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Importation de Données</h2>
          {step !== 'loading' && (
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="p-8 flex flex-col items-center gap-6 text-center">

          {step === 'confirm' && (
            <>
              <div className="bg-blue-50 border border-blue-200 p-6 rounded-full">
                <svg className="h-12 w-12 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>

              {!pendingFile ? (
                <>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-gray-900">Importer des données</h3>
                    <p className="text-sm text-gray-500">Formats acceptés : <span className="font-semibold">.xlsx, .xls, .csv, .json</span></p>
                  </div>
                  <div className="w-full">
                    <label className="block w-full border-2 border-dashed border-gray-200 rounded-xl p-6 cursor-pointer hover:border-[#1A56DB]/50 hover:bg-blue-50/50 transition-all">
                      <input type="file" accept=".xlsx,.xls,.csv,.json" className="hidden" onChange={handleFileSelect} />
                      <span className="text-sm font-bold text-[#1A56DB]">Sélectionner le fichier</span>
                    </label>
                    <button onClick={onClose} className="mt-4 text-sm text-gray-400 font-semibold hover:text-gray-600 transition-colors">Annuler</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-gray-900">Remplacer la base de données ?</h3>
                    <p className="text-sm text-gray-500">Fichier : <span className="font-bold text-[#1A56DB]">{pendingFile.name}</span></p>
                    <p className="text-sm text-amber-600 font-medium">Cette action remplacera toutes les données actuelles.</p>
                  </div>
                  <div className="flex gap-3 w-full">
                    <button onClick={() => setPendingFile(null)} className="flex-1 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all">Non</button>
                    <button onClick={handleConfirmYes} className="flex-1 py-3 bg-[#1A56DB] text-white font-black rounded-xl hover:bg-[#1E40AF] transition-all shadow-sm">Oui, Remplacer</button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 'admin_password' && (
            <>
              <div className="bg-amber-50 border border-amber-200 p-6 rounded-full">
                <svg className="h-12 w-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-gray-900">Confirmation administrateur requise</h3>
                <p className="text-sm text-gray-500">Entrez le mot de passe administrateur pour procéder.</p>
              </div>
              <form onSubmit={handleAdminPasswordSubmit} className="w-full space-y-4">
                {adminPwdError && (
                  <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{adminPwdError}</p>
                )}
                <div className="relative">
                  <input
                    type={showAdminPwd ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => { setAdminPassword(e.target.value); setAdminPwdError(''); }}
                    placeholder="Mot de passe administrateur"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pr-12 py-3 font-bold text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-[#1A56DB]/20 focus:border-[#1A56DB] focus:outline-none transition-all"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowAdminPwd(!showAdminPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  </button>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all">Annuler</button>
                  <button type="submit" className="flex-1 py-3 bg-[#1A56DB] text-white font-black rounded-xl hover:bg-[#1E40AF] shadow-sm transition-all">Confirmer</button>
                </div>
              </form>
            </>
          )}

          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-[#1A56DB] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500 font-semibold">Lecture du fichier...</p>
            </div>
          )}

          {step === 'success' && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-full">
                <svg className="h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-gray-900">Données Chargées</h3>
                <p className="text-sm text-gray-500">{importCount} dossier(s) extrait(s) avec succès.</p>
              </div>
            </>
          )}

          {step === 'error' && (
            <>
              <div className="bg-red-50 border border-red-200 p-6 rounded-full">
                <svg className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-gray-900">Erreur d'Importation</h3>
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
              <button onClick={() => { setStep('confirm'); setPendingFile(null); setError(null); }} className="text-sm text-[#1A56DB] font-bold underline px-4 py-2 hover:bg-blue-50 rounded-lg transition-all">
                Réessayer
              </button>
            </>
          )}
        </div>

        <div className="px-8 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] text-gray-400 font-bold text-center">{APP_CREDITS}</p>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
