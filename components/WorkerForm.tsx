
import React, { useState } from 'react';
import { Worker } from '../types';
import { JOB_FUNCTIONS } from '../constants';
import Autocomplete from './Autocomplete';

interface WorkerFormProps {
  initialData?: Worker;
  onSave: (worker: Worker) => void;
  onCancel: () => void;
  isEdit?: boolean;
}

const ACCEPTED_DOC_TYPES = '*';
const BLOCKED_DOC_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.db', '.sqlite', '.sqlite3', '.db3'];

const WorkerForm: React.FC<WorkerFormProps> = ({ initialData, onSave, onCancel, isEdit = false }) => {
  const [formData, setFormData] = useState<Worker>(
    initialData || {
      matricule: '',
      nom: '',
      prenom: '',
      dateNaissance: '',
      fonction: '',
      dateEntree: '',
      dateFin: '',
      wilaya: '',
      affiliation: '',
      chantier: '',
      affair: '',
      numeroBrevet: '',
      dateExpirationBrevet: '',
      numeroPermis: '',
      dateExpirationPermis: '',
      numeroBrevetMarch: '',
      dateExpirationBrevetMarch: '',
      numeroBrevetDang: '',
      dateExpirationBrevetDang: '',
      numeroBrevetPers: '',
      dateExpirationBrevetPers: '',
      docPermisUtilisation: 'NON',
      docBrevetMarchUtilisation: 'NON',
      docBrevetDangUtilisation: 'NON',
      docBrevetPersUtilisation: 'NON',
    }
  );

  const isSpecialRole = formData.fonction.toUpperCase().includes('CHAUFFEUR') ||
    formData.fonction.toUpperCase().includes('GRUTIER');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'matricule' && !/^\d*$/.test(value)) return;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: keyof Worker, filenameField: keyof Worker) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const blocked = BLOCKED_DOC_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    if (blocked) {
      alert("Ce format de fichier n'est pas autorisé comme document brevet.\nFichiers acceptés : PDF, images, Word, etc. (pas Excel ni base de données)");
      e.target.value = '';
      return;
    }

    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    const toBase64 = (f: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

    const compressImage = (f: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = (ev) => {
          const img = new Image();
          img.src = ev.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 1200;
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h = h * MAX / w; w = MAX; } }
            else { if (h > MAX) { w = w * MAX / h; h = MAX; } }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', 0.75));
            } else reject(new Error('Canvas error'));
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });

    try {
      let data: string;
      if (isPdf) {
        data = await toBase64(file);
      } else if (isImage) {
        data = await compressImage(file);
      } else {
        data = await toBase64(file);
      }
      setFormData(prev => ({ ...prev, [field]: data, [filenameField]: file.name }));
    } catch {
      alert("Erreur lors du chargement du fichier.");
    }
  };

  const handleRemoveFile = (field: keyof Worker, filenameField: keyof Worker) => {
    setFormData(prev => ({ ...prev, [field]: undefined, [filenameField]: undefined }));
  };

  const handleUtilisationChange = (field: keyof Worker, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFonctionChange = (val: string) => {
    setFormData(prev => ({ ...prev, fonction: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.matricule || !formData.nom || !formData.prenom) {
      alert("Veuillez remplir au moins le matricule, le nom et le prénom.");
      return;
    }
    onSave(formData);
  };

  const today = new Date().toISOString().split('T')[0];

  const getFileIcon = (filename?: string) => {
    if (!filename) return null;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['jpg','jpeg','png','gif','bmp','webp','tiff','heic'].includes(ext || '')) return '🖼️';
    return '📎';
  };

  const FileUploadField = ({
    label, field, filenameField, value, filename, utilField, utilValue,
    numeroField, numeroValue, dateField, dateValue,
  }: {
    label: string;
    field: keyof Worker;
    filenameField: keyof Worker;
    value?: string;
    filename?: string;
    utilField?: keyof Worker;
    utilValue?: string;
    numeroField?: keyof Worker;
    numeroValue?: string;
    dateField?: keyof Worker;
    dateValue?: string;
  }) => {
    const isExpired = dateValue && dateValue < today;
    const isValid = dateValue && dateValue >= today;
    const isPdf = value?.startsWith('data:application/pdf');

    return (
      <div className="flex flex-col gap-3 p-3 border border-white/6 rounded-xl bg-white/4">
        <div className="flex justify-between items-center">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</label>
          {value ? (
            <div className="flex items-center gap-1.5">
              {isPdf ? (
                <span className="text-base">📄</span>
              ) : (
                <div className="w-6 h-6 rounded border border-white/10 overflow-hidden bg-white/8">
                  <img src={value} className="w-full h-full object-cover" alt="preview" />
                </div>
              )}
              <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-tighter">OK</span>
            </div>
          ) : (
            <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-tighter italic">Vide</span>
          )}
        </div>

        {/* Per-section Numéro + Date d'expiration */}
        {numeroField && dateField && (
          <div className="grid grid-cols-2 gap-2 pb-2 border-b border-white/6">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">N° Brevet</label>
              <input
                name={numeroField as string}
                type="text"
                value={numeroValue || ''}
                onChange={handleChange}
                placeholder="Ex: 123456"
                className="border border-white/10 px-2.5 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#345d6e] bg-white/5 font-semibold text-slate-200 placeholder-slate-600 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                Date Exp.
                {isExpired && <span className="bg-red-900/30 text-red-400 px-1 rounded text-[8px] font-semibold">EXPIRÉ</span>}
                {isValid && <span className="bg-emerald-900/20 text-emerald-400 px-1 rounded text-[8px] font-semibold">VALIDE</span>}
              </label>
              <input
                name={dateField as string}
                type="date"
                value={dateValue || ''}
                onChange={handleChange}
                className={`border px-2.5 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#345d6e] bg-white/5 font-semibold text-xs ${isExpired ? 'border-red-500/30 text-red-400' : isValid ? 'border-emerald-500/25 text-emerald-400' : 'border-white/10 text-slate-300'}`}
              />
            </div>
          </div>
        )}

        {/* File name display */}
        {filename && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/8">
            <span className="text-xs">{getFileIcon(filename)}</span>
            <span className="text-[9px] text-slate-400 font-semibold truncate flex-1" title={filename}>{filename}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="cursor-pointer bg-white/6 border border-white/10 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-[#7ecde8] hover:bg-[#345d6e]/20 transition-all flex-1 text-center">
            {value ? 'Remplacer' : 'Choisir fichier'}
            <input type="file" accept={ACCEPTED_DOC_TYPES} onChange={(e) => handleFileChange(e, field, filenameField)} className="hidden" />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => handleRemoveFile(field, filenameField)}
              className="bg-white/5 border border-white/8 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-slate-500 hover:bg-rose-900/20 hover:text-rose-400 transition-all"
            >
              ✕
            </button>
          )}
        </div>

        {utilField && (
          <div className="flex items-center justify-between border-t border-white/6 pt-2 mt-1">
            <span className="text-[9px] font-semibold text-slate-500 uppercase">Utilisation</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => handleUtilisationChange(utilField, 'OUI')}
                className={`px-3 py-1 rounded-md text-[9px] font-semibold transition-all ${utilValue === 'OUI' ? 'bg-red-500 text-white' : 'bg-white/8 text-slate-500 hover:bg-white/12'}`}>
                Oui
              </button>
              <button type="button" onClick={() => handleUtilisationChange(utilField, 'NON')}
                className={`px-3 py-1 rounded-md text-[9px] font-semibold transition-all ${utilValue === 'NON' || !utilValue ? 'bg-emerald-600 text-white' : 'bg-white/8 text-slate-500 hover:bg-white/12'}`}>
                Non
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[#0e1520] w-full max-w-3xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden border border-white/8 animate-scale-in">
        <div className="border-b border-white/6 px-6 py-4 flex justify-between items-center bg-[#0a1018]">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              {isEdit ? "Édition du Dossier" : "Nouveau Dossier RH"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{isEdit ? "Modifier les informations du collaborateur" : "Ajouter un nouveau collaborateur"}</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-lg bg-white/8 hover:bg-white/12 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 max-h-[80vh] overflow-y-auto space-y-6">
          {isEdit && (
            <div className="bg-white/4 border border-white/6 rounded-xl p-3.5 flex flex-col md:flex-row gap-4 text-xs">
              <div className="flex flex-col">
                <span className="font-semibold text-slate-500 uppercase tracking-wider text-[9px]">Créé par</span>
                <span className="font-semibold text-slate-300 mt-0.5">{formData.createdBy || '—'}</span>
                <span className="text-[9px] text-slate-500">{formData.createdAt || '—'}</span>
              </div>
              <div className="w-px bg-white/6 hidden md:block"></div>
              <div className="flex flex-col">
                <span className="font-semibold text-slate-500 uppercase tracking-wider text-[9px]">Dernière modif. par</span>
                <span className="font-semibold text-slate-300 mt-0.5">{formData.lastModifiedBy || '—'}</span>
                <span className="text-[9px] text-slate-500">{formData.updatedAt || '—'}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Matricule *</label>
              <input name="matricule" type="text" value={formData.matricule} onChange={handleChange} required className="premium-input border border-white/10 px-4 py-2.5 rounded-xl bg-white/5 font-semibold text-slate-200 text-sm placeholder-slate-600" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Nom *</label>
              <input name="nom" type="text" value={formData.nom} onChange={handleChange} required className="premium-input border border-white/10 px-4 py-2.5 rounded-xl bg-white/5 font-semibold text-slate-200 text-sm placeholder-slate-600" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Prénom *</label>
              <input name="prenom" type="text" value={formData.prenom} onChange={handleChange} required className="premium-input border border-white/10 px-4 py-2.5 rounded-xl bg-white/5 font-semibold text-slate-200 text-sm placeholder-slate-600" />
            </div>
          </div>

          <div>
            <Autocomplete label="Fonction / Poste" value={formData.fonction} onChange={handleFonctionChange} suggestions={JOB_FUNCTIONS} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Chantier</label>
              <input name="chantier" type="text" value={formData.chantier} onChange={handleChange} className="premium-input border border-white/10 px-4 py-2.5 rounded-xl bg-white/5 font-semibold text-slate-200 text-sm placeholder-slate-600" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Affair</label>
              <input name="affair" type="text" value={formData.affair} onChange={handleChange} className="premium-input border border-white/10 px-4 py-2.5 rounded-xl bg-white/5 font-semibold text-slate-200 text-sm placeholder-slate-600" />
            </div>
          </div>

          {isSpecialRole && (
            <div className="bg-[#345d6e]/10 border border-[#345d6e]/25 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-[#345d6e]/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#7ecde8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-[#7ecde8] uppercase tracking-wider">Documents — Chauffeur / Grutier</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Formats acceptés: PDF, JPG, PNG, et autres</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FileUploadField({
                  label: "Permis de Conduire",
                  field: "docPermis",
                  filenameField: "docPermisFilename",
                  value: formData.docPermis,
                  filename: formData.docPermisFilename,
                  numeroField: "numeroPermis",
                  numeroValue: formData.numeroPermis,
                  dateField: "dateExpirationPermis",
                  dateValue: formData.dateExpirationPermis,
                })}
                {FileUploadField({
                  label: "Brevet Marchandises",
                  field: "docBrevetMarch",
                  filenameField: "docBrevetMarchFilename",
                  value: formData.docBrevetMarch,
                  filename: formData.docBrevetMarchFilename,
                  utilField: "docBrevetMarchUtilisation",
                  utilValue: formData.docBrevetMarchUtilisation,
                  numeroField: "numeroBrevetMarch",
                  numeroValue: formData.numeroBrevetMarch,
                  dateField: "dateExpirationBrevetMarch",
                  dateValue: formData.dateExpirationBrevetMarch,
                })}
                {FileUploadField({
                  label: "Brevet Matières Dangereuses",
                  field: "docBrevetDang",
                  filenameField: "docBrevetDangFilename",
                  value: formData.docBrevetDang,
                  filename: formData.docBrevetDangFilename,
                  utilField: "docBrevetDangUtilisation",
                  utilValue: formData.docBrevetDangUtilisation,
                  numeroField: "numeroBrevetDang",
                  numeroValue: formData.numeroBrevetDang,
                  dateField: "dateExpirationBrevetDang",
                  dateValue: formData.dateExpirationBrevetDang,
                })}
                {FileUploadField({
                  label: "Brevet Personnel",
                  field: "docBrevetPers",
                  filenameField: "docBrevetPersFilename",
                  value: formData.docBrevetPers,
                  filename: formData.docBrevetPersFilename,
                  utilField: "docBrevetPersUtilisation",
                  utilValue: formData.docBrevetPersUtilisation,
                  numeroField: "numeroBrevetPers",
                  numeroValue: formData.numeroBrevetPers,
                  dateField: "dateExpirationBrevetPers",
                  dateValue: formData.dateExpirationBrevetPers,
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-5 border-t border-white/6">
            <button type="button" onClick={onCancel} className="btn-press px-5 py-2.5 rounded-xl border border-white/8 text-slate-400 font-semibold text-sm hover:bg-white/5 transition-colors">Annuler</button>
            <button type="submit" className="btn-press px-8 py-2.5 rounded-xl bg-[#345d6e] text-white font-semibold text-sm hover:bg-[#2c5263] transition-colors shadow-lg shadow-[#345d6e]/30">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WorkerForm;
