import React, { useState, useEffect, useRef } from 'react';
import { Worker, BordereauEntry, User } from '../types';
import JSZip from 'jszip';

const BORDEREAU_KEY = 'csgm_bordereau_entries';
const BORDEREAU_HIDDEN_KEY = 'csgm_bordereau_hidden_chantiers';
const BORDEREAU_MANUAL_KEY = 'csgm_bordereau_manual_chantiers';

interface Props {
  workers: Worker[];
  currentUser: User | null;
}

const BordereauEnvoi: React.FC<Props> = ({ workers, currentUser }) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  const [entries, setEntries] = useState<BordereauEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(BORDEREAU_KEY) || '[]'); }
    catch { return []; }
  });

  const [hiddenChantiers, setHiddenChantiers] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(BORDEREAU_HIDDEN_KEY) || '[]')); }
    catch { return new Set(); }
  });

  const [popup, setPopup] = useState<{ chantier: string; type: 'arrivee' | 'depart' } | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<BordereauEntry | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteChantierTarget, setDeleteChantierTarget] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [selectedChantiers, setSelectedChantiers] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [manualChantiers, setManualChantiers] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(BORDEREAU_MANUAL_KEY) || '[]'); }
    catch { return []; }
  });
  const [showAddChantier, setShowAddChantier] = useState(false);
  const [addChantierInput, setAddChantierInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const workerChantiers = Array.from(new Set(
    workers.map(w => w.chantier?.trim()).filter(Boolean) as string[]
  )).sort().filter(c => !hiddenChantiers.has(c));

  const bordereauOnlyChantiers = Array.from(new Set(
    entries.map(e => e.chantier)
  )).filter(c => !workerChantiers.includes(c) && !hiddenChantiers.has(c)).sort();

  const manualOnlyChantiers = manualChantiers
    .filter(c => !workerChantiers.includes(c) && !bordereauOnlyChantiers.includes(c) && !hiddenChantiers.has(c))
    .sort();

  const allChantiers = [...workerChantiers, ...bordereauOnlyChantiers, ...manualOnlyChantiers];

  useEffect(() => {
    localStorage.setItem(BORDEREAU_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(BORDEREAU_HIDDEN_KEY, JSON.stringify(Array.from(hiddenChantiers)));
  }, [hiddenChantiers]);

  useEffect(() => {
    localStorage.setItem(BORDEREAU_MANUAL_KEY, JSON.stringify(manualChantiers));
  }, [manualChantiers]);

  const confirmAddChantier = () => {
    const name = addChantierInput.trim().toUpperCase();
    if (!name) return;
    if (allChantiers.map(c => c.toUpperCase()).includes(name)) {
      alert('Ce chantier existe déjà.');
      return;
    }
    setManualChantiers(prev => [...prev, name]);
    setHiddenChantiers(prev => { const n = new Set(prev); n.delete(name); return n; });
    setAddChantierInput('');
    setShowAddChantier(false);
  };

  const exportBordereauZip = async (entriesToExport: BordereauEntry[]) => {
    if (entriesToExport.length === 0) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const dateStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
      const safe = (s: string) => s.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim();
      const toBytes = (uri: string) => {
        const [, b64] = uri.split(',');
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      };
      const byChantier: Record<string, BordereauEntry[]> = {};
      for (const e of entriesToExport) {
        if (!byChantier[e.chantier]) byChantier[e.chantier] = [];
        byChantier[e.chantier].push(e);
      }
      for (const [ch, chEntries] of Object.entries(byChantier)) {
        for (const e of chEntries) {
          const d = new Date(e.date);
          const dt = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const tm = `${String(d.getHours()).padStart(2,'0')}h${String(d.getMinutes()).padStart(2,'0')}`;
          const tag = e.type === 'arrivee' ? 'Arrivee' : 'Depart';
          zip.file(`${safe(ch)}/${tag}_${dt}_${tm}_${safe(e.filename)}`, toBytes(e.data));
        }
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Bordereau_Envoi_${dateStr}.zip`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const handleImportZip = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert('Veuillez sélectionner un fichier ZIP.');
      return;
    }
    setImporting(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const newEntries: BordereauEntry[] = [];
      const importedChantiers: string[] = [];
      const importTime = new Date().toISOString();
      const importUser = currentUser?.fullName || currentUser?.username || 'Importé';

      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const cleanPath = path.replace(/^\.\//, '');
        const slashIdx = cleanPath.indexOf('/');
        if (slashIdx === -1) continue;
        const chantier = cleanPath.slice(0, slashIdx).trim().toUpperCase();
        const filename = cleanPath.slice(slashIdx + 1);
        const match = filename.match(/^(Arrivee|Depart)_(\d{4}-\d{2}-\d{2})_(\d{2}h\d{2})_(.+)$/i);
        if (!match) continue;
        const [, tag, dateStr, timeStr, actualFilename] = match;
        const type: 'arrivee' | 'depart' = tag.toLowerCase() === 'arrivee' ? 'arrivee' : 'depart';
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split('h').map(Number);
        const date = new Date(year, month - 1, day, hours || 0, minutes || 0);
        const b64 = await zipEntry.async('base64');
        const ext = actualFilename.toLowerCase().split('.').pop() || '';
        const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const dataUri = `data:${mime};base64,${b64}`;
        newEntries.push({
          id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chantier, type, filename: actualFilename, data: dataUri,
          date: date.toISOString(), uploadedBy: importUser, uploadedAt: importTime,
        });
        if (!importedChantiers.includes(chantier)) importedChantiers.push(chantier);
      }

      if (newEntries.length === 0) {
        alert('Aucun document valide trouvé. Assurez-vous que le fichier est un export Bordereau d\'Envoi.');
        return;
      }

      setEntries(prev => {
        const existingKeys = new Set(prev.map(e => `${e.chantier}|${e.type}|${e.filename}`));
        const toAdd = newEntries.filter(e => !existingKeys.has(`${e.chantier}|${e.type}|${e.filename}`));
        const skipped = newEntries.length - toAdd.length;
        if (toAdd.length > 0) {
          setHiddenChantiers(hid => { const n = new Set(hid); toAdd.forEach(e => n.delete(e.chantier)); return n; });
          setManualChantiers(mc => { const existing = new Set(mc); const toAddC = importedChantiers.filter(c => !existing.has(c)); return toAddC.length > 0 ? [...mc, ...toAddC] : mc; });
        }
        let msg = toAdd.length > 0 ? `✓ ${toAdd.length} document(s) importé(s) avec succès.` : 'Tous les documents sont déjà présents dans le bordereau.';
        if (skipped > 0 && toAdd.length > 0) msg += `\n${skipped} doublon(s) ignoré(s).`;
        alert(msg);
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    } catch (err) {
      console.error('Import error:', err);
      alert('Erreur lors de la lecture du fichier ZIP. Vérifiez que c\'est un export Bordereau d\'Envoi valide.');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const openPopup = (chantier: string, type: 'arrivee' | 'depart') => {
    setHiddenChantiers(prev => { const n = new Set(prev); n.delete(chantier); return n; });
    setPopup({ chantier, type });
    setTimeout(() => setPopupVisible(true), 10);
  };
  const closePopup = () => { setPopupVisible(false); setTimeout(() => setPopup(null), 300); };

  const openPreview = (e: BordereauEntry) => { setPreviewEntry(e); setTimeout(() => setPreviewVisible(true), 10); };
  const closePreview = () => { setPreviewVisible(false); setTimeout(() => setPreviewEntry(null), 300); };

  const processFile = (file: File) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/bmp'];
    const allowedExt = ['.pdf', '.jpg', '.jpeg', '.png', '.bmp'];
    const lc = file.name.toLowerCase();
    if (!allowed.includes(file.type) && !allowedExt.some(e => lc.endsWith(e))) {
      alert('Fichier non supporté. Formats acceptés : PDF, JPG, PNG, BMP'); return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const entry: BordereauEntry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        chantier: popup!.chantier, type: popup!.type,
        date: new Date().toISOString(), filename: file.name, data,
        mimeType: file.type || (lc.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        uploadedBy: currentUser?.fullName || currentUser?.username || 'Inconnu',
        uploadedAt: new Date().toISOString(),
      };
      setEntries(prev => [entry, ...prev]);
      setUploading(false); closePopup();
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = '';
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0]; if (f) processFile(f);
  };

  const doDeleteSingle = async (id: string, withBackup: boolean) => {
    if (withBackup) await exportBordereauZip(entries);
    setEntries(prev => prev.filter(e => e.id !== id));
    setDeleteTarget(null);
  };

  const doDeleteSelectedChantiers = async (withBackup: boolean) => {
    const toDelete = Array.from(selectedChantiers);
    if (withBackup) {
      const toBackup = entries.filter(e => toDelete.includes(e.chantier));
      if (toBackup.length > 0) await exportBordereauZip(toBackup);
    }
    setEntries(prev => prev.filter(e => !toDelete.includes(e.chantier)));
    setHiddenChantiers(prev => { const n = new Set(prev); toDelete.forEach(c => n.add(c)); return n; });
    setManualChantiers(prev => prev.filter(c => !toDelete.includes(c)));
    setSelectedChantiers(new Set()); setSelectMode(false); setDeleteTarget(null);
  };

  const doDeleteChantier = async (chantier: string, withBackup: boolean) => {
    if (withBackup) await exportBordereauZip(entries);
    setEntries(prev => prev.filter(e => e.chantier !== chantier));
    setHiddenChantiers(prev => { const n = new Set(prev); n.add(chantier); return n; });
    setManualChantiers(prev => prev.filter(c => c !== chantier));
    setDeleteChantierTarget(null);
  };

  const toggleSelectChantier = (chantier: string) => setSelectedChantiers(prev => {
    const n = new Set(prev); n.has(chantier) ? n.delete(chantier) : n.add(chantier); return n;
  });
  const toggleSelectAll = () =>
    setSelectedChantiers(selectedChantiers.size === allChantiers.length && allChantiers.length > 0
      ? new Set() : new Set(allChantiers));

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const getEntriesFor = (chantier: string, type: 'arrivee' | 'depart') =>
    entries.filter(e => e.chantier === chantier && e.type === type);
  const isPdf = (e: BordereauEntry) =>
    e.mimeType === 'application/pdf' || e.filename.toLowerCase().endsWith('.pdf');

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-[#1A56DB] to-[#6366F1] px-8 py-6 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Bordereau d'Envoi</h1>
              <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-0.5">
                {allChantiers.length} chantier{allChantiers.length !== 1 ? 's' : ''} · {entries.length} document{entries.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setShowAddChantier(true); setAddChantierInput(''); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/>
              </svg>
              Ajouter
            </button>

            <button
              onClick={() => { setSelectMode(p => !p); setSelectedChantiers(new Set()); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                selectMode ? 'bg-white text-[#1A56DB] shadow-md' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              {selectMode ? 'Annuler' : 'Sélectionner'}
            </button>

            {isAdmin && (
            <button
              onClick={() => exportBordereauZip(entries)}
              disabled={entries.length === 0 || exporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md"
            >
              {exporting
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              }
              Exporter ZIP
            </button>
            )}

            {isAdmin && (
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              title="Importer un export ZIP précédent pour récupérer le Bordereau"
              className="flex items-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md"
            >
              {importing
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 16V10m0 0l-3 3m3-3l3 3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/></svg>
              }
              Importer ZIP
            </button>
            )}
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportZip(f); }}
            />

            {isAdmin && (
              <button
                onClick={() => setShowAuditLog(true)}
                title="Journal d'activité (Admin)"
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                </svg>
                Journal
              </button>
            )}
          </div>
        </div>

        {/* Multi-select bar */}
        {selectMode && (
          <div className="mt-4 flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-3 flex-wrap">
            <button onClick={toggleSelectAll} className="text-xs font-black text-white hover:text-white/80 transition-colors">
              {selectedChantiers.size === allChantiers.length && allChantiers.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            <span className="text-white/30">·</span>
            <span className="text-xs font-bold text-white/70">{selectedChantiers.size} chantier{selectedChantiers.size > 1 ? 's' : ''} sélectionné{selectedChantiers.size > 1 ? 's' : ''}</span>
            {selectedChantiers.size > 0 && isAdmin && (
              <>
                <span className="text-white/30">·</span>
                <button
                  onClick={() => setDeleteTarget('__selected__')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-400 text-white rounded-lg text-xs font-black transition-all active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  Supprimer ({selectedChantiers.size})
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-[#F8F9FA] p-6">
        {allChantiers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-20 h-20 bg-gray-100 border border-gray-200 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
            </div>
            <p className="text-gray-500 font-bold">Aucun chantier trouvé</p>
            <p className="text-gray-400 text-sm mt-1">Ajoutez des collaborateurs avec un chantier assigné.</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {allChantiers.map(chantier => {
              const arrivees = getEntriesFor(chantier, 'arrivee');
              const departs = getEntriesFor(chantier, 'depart');

              return (
                <div
                  key={chantier}
                  onClick={selectMode ? () => toggleSelectChantier(chantier) : undefined}
                  className={`bg-white rounded-2xl border overflow-hidden transition-all duration-150 shadow-sm ${
                    selectMode && selectedChantiers.has(chantier)
                      ? 'border-red-400 ring-2 ring-red-200 cursor-pointer'
                      : selectMode
                        ? 'border-gray-200 hover:border-red-300 cursor-pointer'
                        : 'border-gray-200'
                  }`}
                >
                  {/* Chantier header */}
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-[#1A56DB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"/>
                        </svg>
                      </div>
                      <span className="font-black text-gray-900 text-base uppercase tracking-wide">{chantier}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {arrivees.length > 0 && (
                        <span className="text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {arrivees.length} arrivée{arrivees.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {departs.length > 0 && (
                        <span className="text-xs font-bold bg-red-50 text-red-500 border border-red-200 px-2 py-0.5 rounded-full">
                          {departs.length} départ{departs.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {/* Select mode indicator */}
                      {selectMode && (
                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                          selectedChantiers.has(chantier) ? 'bg-rose-500 border-rose-500' : 'bg-gray-100 border-gray-300'
                        }`}>
                          {selectedChantiers.has(chantier) && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {/* Admin-only: delete entire section */}
                      {isAdmin && !selectMode && (
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteChantierTarget(chantier); }}
                          title="Supprimer cette section du bordereau (admin)"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Arrivée / Départ buttons + document list */}
                  <div className="p-5">
                    <div className="flex gap-3 mb-4">
                      <button
                        onClick={() => openPopup(chantier, 'arrivee')}
                        className="flex-1 flex items-center justify-center gap-2.5 py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black rounded-xl shadow-sm transition-all duration-150 text-sm uppercase tracking-wider"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                        </svg>
                        Arrivée
                      </button>
                      <button
                        onClick={() => openPopup(chantier, 'depart')}
                        className="flex-1 flex items-center justify-center gap-2.5 py-3.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-black rounded-xl shadow-sm transition-all duration-150 text-sm uppercase tracking-wider"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
                        </svg>
                        Départ
                      </button>
                    </div>

                    {(arrivees.length > 0 || departs.length > 0) && (
                      <div className="space-y-2 mt-2">
                        {[...arrivees, ...departs]
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map(entry => (
                            <div
                              key={entry.id}
                              onClick={e => e.stopPropagation()}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                                entry.type === 'arrivee'
                                  ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-50'
                                  : 'bg-red-50 border-red-200 hover:bg-red-50'
                              }`}
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${entry.type === 'arrivee' ? 'bg-emerald-100' : 'bg-red-50'}`}>
                                {isPdf(entry) ? (
                                  <svg className={`w-4 h-4 ${entry.type === 'arrivee' ? 'text-emerald-600' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                                  </svg>
                                ) : (
                                  <svg className={`w-4 h-4 ${entry.type === 'arrivee' ? 'text-emerald-600' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-black text-gray-800 truncate">{entry.filename}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${entry.type === 'arrivee' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                                    {entry.type === 'arrivee' ? '↑ Arrivée' : '↓ Départ'}
                                  </span>
                                  <p className="text-[10px] text-gray-500 font-bold">{formatDate(entry.date)}</p>
                                </div>
                              </div>
                              <button onClick={e => { e.stopPropagation(); openPreview(entry); }} className="shrink-0 p-1.5 text-gray-500 hover:text-[#1A56DB] hover:bg-gray-100 rounded-lg transition-all" title="Voir">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                </svg>
                              </button>
                              {isAdmin && (
                              <button onClick={e => { e.stopPropagation(); setDeleteTarget(entry.id); }} className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Supprimer">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                              </button>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Chantier Modal ── */}
      {showAddChantier && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowAddChantier(false); setAddChantierInput(''); } }}
        >
          <div className="bg-white border border-gray-200 rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-scale-in">
            <div className="bg-gradient-to-r from-[#1A56DB] to-[#6366F1] px-7 py-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-black text-white">Ajouter un chantier</h2>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Saisie manuelle</p>
              </div>
              <button
                onClick={() => { setShowAddChantier(false); setAddChantierInput(''); }}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all shrink-0"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-6">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Nom du chantier</label>
              <input
                autoFocus
                type="text"
                value={addChantierInput}
                onChange={e => setAddChantierInput(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') confirmAddChantier(); if (e.key === 'Escape') { setShowAddChantier(false); setAddChantierInput(''); } }}
                placeholder="Ex: CHANTIER ALGER NORD"
                className="premium-input w-full bg-gray-50 border border-gray-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-200 px-4 py-3 rounded-xl text-gray-900 font-black text-sm outline-none transition-all uppercase placeholder:font-normal placeholder:normal-case placeholder:text-gray-400 mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={confirmAddChantier}
                  disabled={!addChantierInput.trim()}
                  className="flex-1 py-3 bg-[#1A56DB] hover:bg-[#1E40AF] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-blue-500/15"
                >
                  Ajouter
                </button>
                <button
                  onClick={() => { setShowAddChantier(false); setAddChantierInput(''); }}
                  className="px-5 py-3 text-gray-500 font-bold border border-gray-200 rounded-xl hover:bg-gray-100 text-sm transition-all"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Popup ── */}
      {popup && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4"
          onClick={e => { if (e.target === e.currentTarget) closePopup(); }}
        >
          <div
            className="bg-white border border-gray-200 rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
            style={{
              transform: popupVisible ? 'scale(1) translateY(0)' : 'scale(0.85) translateY(20px)',
              opacity: popupVisible ? 1 : 0,
              transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease',
            }}
          >
            <div className={`px-8 py-6 ${popup.type === 'arrivee' ? 'bg-gradient-to-r from-emerald-600 to-emerald-700' : 'bg-gradient-to-r from-rose-600 to-rose-700'}`}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  {popup.type === 'arrivee'
                    ? <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                    : <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                  }
                </div>
                <div>
                  <h2 className="text-xl font-black text-white">{popup.type === 'arrivee' ? 'Arrivée' : 'Départ'}</h2>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-widest">{popup.chantier}</p>
                </div>
                <button onClick={closePopup} className="ml-auto w-9 h-9 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <div className="p-8">
              <div
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 cursor-pointer ${dragOver ? 'border-blue-400 bg-blue-50 scale-[1.02]' : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.bmp" className="hidden" onChange={handleFileInput} />
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-blue-100 border-t-[#1A56DB] rounded-full animate-spin"></div>
                    <p className="text-sm font-bold text-gray-500">Traitement en cours…</p>
                  </div>
                ) : (
                  <>
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${dragOver ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <svg className={`w-8 h-8 transition-colors ${dragOver ? 'text-[#1A56DB]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                      </svg>
                    </div>
                    <p className="text-sm font-black text-gray-800 mb-1">Glissez-déposez un fichier ici</p>
                    <p className="text-xs text-gray-500 font-bold mb-3">ou cliquez pour choisir</p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {['PDF', 'JPG', 'PNG', 'BMP'].map(fmt => (
                        <span key={fmt} className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-widest">{fmt}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={closePopup} className="mt-4 w-full py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Document Preview ── */}
      {previewEntry && (
        <div
          className="fixed inset-0 bg-black/90 flex flex-col z-[300]"
          style={{ opacity: previewVisible ? 1 : 0, transition: 'opacity 0.2s ease' }}
          onClick={e => { if (e.target === e.currentTarget) closePreview(); }}
        >
          <div className="flex items-center justify-between px-6 py-4 bg-black/50 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${previewEntry.type === 'arrivee' ? 'bg-emerald-500/30 text-emerald-700' : 'bg-rose-500/30 text-red-400'}`}>
                {previewEntry.type === 'arrivee' ? '↑ Arrivée' : '↓ Départ'}
              </span>
              <p className="text-white font-bold text-sm truncate max-w-xs">{previewEntry.filename}</p>
              <p className="text-white/40 text-xs hidden sm:block">{formatDate(previewEntry.date)}</p>
            </div>
            <div className="flex gap-2">
              <a href={previewEntry.data} download={previewEntry.filename} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Télécharger
              </a>
              <button onClick={closePreview} className="w-9 h-9 bg-white/10 hover:bg-white/20 text-white rounded-xl flex items-center justify-center transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
            {isPdf(previewEntry)
              ? <iframe src={previewEntry.data} className="w-full h-full rounded-xl" title={previewEntry.filename} />
              : <img src={previewEntry.data} alt={previewEntry.filename} className="max-w-full max-h-full object-contain rounded-xl" />
            }
          </div>
        </div>
      )}

      {/* ── Delete: single / selected entries ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[400] p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-sm w-full p-6 text-center animate-scale-in">
            <div className="w-12 h-12 bg-amber-100 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <p className="text-gray-800 font-black mb-1">
              {deleteTarget === '__selected__'
                ? `Supprimer ${selectedChantiers.size} chantier${selectedChantiers.size > 1 ? 's' : ''} et leurs documents ?`
                : 'Supprimer ce document ?'}
            </p>
            <p className="text-red-500 text-xs font-bold mb-5">Cette action est irréversible.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => deleteTarget === '__selected__' ? doDeleteSelectedChantiers(true) : doDeleteSingle(deleteTarget, true)}
                className="w-full py-2.5 bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/15"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Supprimer avec backup
              </button>
              <button
                onClick={() => deleteTarget === '__selected__' ? doDeleteSelectedChantiers(false) : doDeleteSingle(deleteTarget, false)}
                className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Supprimer sans backup
              </button>
              <button onClick={() => setDeleteTarget(null)} className="w-full py-2.5 text-gray-500 font-bold border border-gray-200 rounded-xl hover:bg-gray-100 text-sm transition-all">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete: entire chantier section (admin) ── */}
      {deleteChantierTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[400] p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-sm w-full p-6 text-center animate-scale-in">
            <div className="w-12 h-12 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </div>
            <p className="text-gray-800 font-black mb-1">
              Supprimer la section <span className="text-[#1A56DB] uppercase">{deleteChantierTarget}</span> ?
            </p>
            <p className="text-gray-500 text-xs mb-1 leading-relaxed">
              Cette section disparaîtra du bordereau.<br/>
              <strong className="text-gray-700">Le chantier reste intact dans l'application.</strong>
            </p>
            <p className="text-red-500 text-xs font-bold mb-5">Cette action est irréversible.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => doDeleteChantier(deleteChantierTarget, true)}
                className="w-full py-2.5 bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/15"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Supprimer avec backup
              </button>
              <button
                onClick={() => doDeleteChantier(deleteChantierTarget, false)}
                className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Supprimer sans backup
              </button>
              <button onClick={() => setDeleteChantierTarget(null)} className="w-full py-2.5 text-gray-500 font-bold border border-gray-200 rounded-xl hover:bg-gray-100 text-sm transition-all">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Log Modal (Admin Only) ── */}
      {showAuditLog && isAdmin && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowAuditLog(false)}
        >
          <div
            className="bg-white border border-gray-200 rounded-3xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#1A56DB] to-[#6366F1] px-8 py-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-white font-black text-lg tracking-tight">Journal d'Activité</h2>
                  <p className="text-white/60 text-xs font-bold uppercase tracking-widest">
                    {entries.length} document{entries.length !== 1 ? 's' : ''} · Bordereau d'Envoi
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAuditLog(false)}
                className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="overflow-auto flex-1">
              {entries.length === 0 ? (
                <div className="p-20 text-center">
                  <p className="text-gray-500 font-black uppercase tracking-widest text-sm">Aucun document enregistré</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                    <tr>
                      <th className="px-5 py-3.5 font-black text-gray-500 uppercase tracking-wider whitespace-nowrap">Date Upload</th>
                      <th className="px-5 py-3.5 font-black text-gray-500 uppercase tracking-wider">Uploadé par</th>
                      <th className="px-5 py-3.5 font-black text-gray-500 uppercase tracking-wider">Chantier</th>
                      <th className="px-5 py-3.5 font-black text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-5 py-3.5 font-black text-gray-500 uppercase tracking-wider">Fichier</th>
                      <th className="px-5 py-3.5 font-black text-gray-500 uppercase tracking-wider whitespace-nowrap">Date Doc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...entries]
                      .sort((a, b) => new Date(b.uploadedAt || b.date).getTime() - new Date(a.uploadedAt || a.date).getTime())
                      .map((e, i) => (
                        <tr
                          key={e.id}
                          className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50'}`}
                        >
                          <td className="px-5 py-3 text-gray-700 font-bold whitespace-nowrap">
                            {e.uploadedAt
                              ? formatDate(e.uploadedAt)
                              : <span className="text-gray-400 italic">—</span>}
                          </td>
                          <td className="px-5 py-3">
                            {e.uploadedBy
                              ? <span className="bg-blue-100 text-[#1A56DB] border border-blue-200 px-2 py-0.5 rounded font-black uppercase text-[10px] tracking-wide">{e.uploadedBy}</span>
                              : <span className="text-gray-400 italic">—</span>}
                          </td>
                          <td className="px-5 py-3 font-black text-gray-800 uppercase">{e.chantier}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase ${e.type === 'arrivee' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-500 border border-red-200'}`}>
                              {e.type === 'arrivee' ? 'Arrivée' : 'Départ'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-500 max-w-[220px] truncate font-medium">{e.filename}</td>
                          <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(e.date)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0 flex items-center justify-between">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                {entries.filter(e => e.uploadedBy).length} / {entries.length} avec info utilisateur
              </span>
              <button
                onClick={() => setShowAuditLog(false)}
                className="px-5 py-2 bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-black text-xs rounded-xl transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BordereauEnvoi;
