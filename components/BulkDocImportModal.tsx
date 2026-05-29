
import React, { useState } from 'react';
import { Worker, BulkImportConfig } from '../types';

interface ImportAction {
  type: 'UPDATE' | 'CREATE';
  matricule: string;
  field: keyof Worker;
  data: string;
  workerData?: Partial<Worker>;
}

interface BulkDocImportModalProps {
  config: BulkImportConfig;
  workers: Worker[];
  onClose: () => void;
  onConfirm: (actions: ImportAction[]) => void;
}

interface ProcessResult {
  filename: string;
  status: 'SUCCESS_UPDATE' | 'SUCCESS_CREATE' | 'ERROR' | 'SKIPPED';
  message: string;
  workerName?: string;
  data?: string;
  matricule?: string;
  workerData?: Partial<Worker>;
}

const BulkDocImportModal: React.FC<BulkDocImportModalProps> = ({ config, workers, onClose, onConfirm }) => {
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
          } else {
              reject(new Error("Canvas context error"));
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsProcessing(true);
    setResults([]);
    const files = Array.from(e.target.files) as File[];
    const newResults: ProcessResult[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProcessedCount(i + 1);
        
        const fileNameNoExt = file.name.split('.').slice(0, -1).join('.').toLowerCase();
        
        let extractedMatricule: string | null = null;
        
        const explicitMatMatch = fileNameNoExt.match(/matricule\s*(\d+)/i);
        if (explicitMatMatch) {
            extractedMatricule = explicitMatMatch[1];
        } else {
            const matMatch = fileNameNoExt.match(/(\d+)/);
            extractedMatricule = matMatch ? matMatch[0] : null;
        }

        const extractedNameClean = fileNameNoExt
            .replace(/matricule/ig, '')
            .replace(/\d+/g, '')
            .replace(/[_\-\.]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();

        let targetWorker: Worker | undefined;
        let status: 'SUCCESS_UPDATE' | 'SUCCESS_CREATE' | 'ERROR' = 'ERROR';
        let msg = '';
        let workerData: Partial<Worker> | undefined;

        if (extractedMatricule) {
            targetWorker = workers.find(w => w.matricule === extractedMatricule);
            if (targetWorker) {
                msg = "Trouvé par Matricule.";
                status = 'SUCCESS_UPDATE';
            }
        }

        if (!targetWorker && extractedNameClean.length > 2) {
            const nameCandidates = workers.filter(w => {
                const wNom = w.nom?.trim().toUpperCase();
                const wPrenom = w.prenom?.trim().toUpperCase();
                if (!wNom || !wPrenom) return false;
                return extractedNameClean.includes(wNom) && extractedNameClean.includes(wPrenom);
            });

            if (nameCandidates.length === 1) {
                targetWorker = nameCandidates[0];
                msg = "Trouvé par Nom Complet (Nom + Prénom).";
                status = 'SUCCESS_UPDATE';
            } else if (nameCandidates.length > 1) {
                 if (extractedMatricule) {
                     const exact = nameCandidates.find(w => w.matricule === extractedMatricule);
                     if (exact) {
                         targetWorker = exact;
                         status = 'SUCCESS_UPDATE';
                         msg = "Trouvé par Nom + Matricule.";
                     }
                 }
                 if (!targetWorker) {
                    msg = `Ambiguïté (Nom) : ${nameCandidates.length} collaborateurs trouvés.`;
                 }
            }
        }

        if (!targetWorker) {
            if (extractedMatricule) {
                const exists = workers.some(w => w.matricule === extractedMatricule);
                if (exists) {
                    msg = "Erreur: Matricule existant non détecté.";
                    status = 'ERROR';
                } else {
                    const parts = extractedNameClean.split(' ');
                    const nom = parts.length > 0 ? parts[0] : "INCONNU";
                    const prenom = parts.length > 1 ? parts.slice(1).join(' ') : "INCONNU";
                    workerData = {
                        matricule: extractedMatricule,
                        nom: nom,
                        prenom: prenom,
                        fonction: "CHAUFFEUR TC",
                        dateNaissance: "",
                        dateEntree: new Date().toISOString().split('T')[0],
                        dateFin: "",
                        wilaya: "Non défini",
                        affiliation: "",
                        chantier: "Non défini",
                        affair: ""
                    };
                    status = 'SUCCESS_CREATE';
                    msg = "Nouveau dossier généré (Automatique).";
                }
            } else {
                if (!msg) msg = "Impossible de créer : Matricule introuvable dans le nom du fichier.";
                status = 'ERROR';
            }
        }

        if (status === 'SUCCESS_UPDATE' || status === 'SUCCESS_CREATE') {
            try {
                const isPdfFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                let base64: string;
                if (isPdfFile) {
                    base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                    });
                } else {
                    base64 = await compressImage(file);
                }
                const finalMatricule = targetWorker ? targetWorker.matricule : workerData?.matricule;
                const finalName = targetWorker ? `${targetWorker.nom} ${targetWorker.prenom}` : `${workerData?.nom} ${workerData?.prenom}`;

                newResults.push({
                    filename: file.name,
                    status: status,
                    message: msg,
                    workerName: finalName,
                    matricule: finalMatricule,
                    data: base64,
                    workerData: workerData
                });
            } catch (err) {
                newResults.push({
                    filename: file.name,
                    status: 'ERROR',
                    message: "Fichier corrompu ou illisible."
                });
            }
        } else {
             newResults.push({
                filename: file.name,
                status: 'ERROR',
                message: msg || "Aucune correspondance trouvée."
            });
        }
    }

    setResults(newResults);
    setIsProcessing(false);
  };

  const handleConfirm = () => {
    const validUpdates: ImportAction[] = results
        .filter(r => (r.status === 'SUCCESS_UPDATE' || r.status === 'SUCCESS_CREATE') && r.matricule && r.data)
        .map(r => ({
            type: r.status === 'SUCCESS_CREATE' ? 'CREATE' : 'UPDATE',
            matricule: r.matricule!,
            field: config.docType,
            data: r.data!,
            workerData: r.workerData
        }));
    onConfirm(validUpdates);
  };

  const successUpdateCount = results.filter(r => r.status === 'SUCCESS_UPDATE').length;
  const successCreateCount = results.filter(r => r.status === 'SUCCESS_CREATE').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;
  const totalSuccess = successUpdateCount + successCreateCount;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-[#0e1520] w-full max-w-5xl rounded-3xl shadow-2xl shadow-black/60 overflow-hidden border border-white/8 flex flex-col max-h-[90vh] animate-scale-in">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1e3a47] to-[#345d6e] px-8 py-5 flex justify-between items-center text-white shrink-0">
            <div>
                <h2 className="text-lg font-black tracking-wide uppercase">Importation {config.title}</h2>
                <p className="text-[10px] text-white/60 font-medium">Algorithme: Matricule BD &rarr; Nom Complet BD &rarr; Création Auto (Chauffeur)</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Content */}
        <div className="p-8 flex-1 overflow-y-auto">
            {results.length === 0 && !isProcessing && (
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-white/10 rounded-3xl bg-white/3 hover:bg-white/5 transition-colors">
                    <div className="w-16 h-16 bg-[#345d6e]/15 border border-[#345d6e]/25 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-[#7ecde8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </div>
                    <label className="cursor-pointer">
                        <span className="bg-[#345d6e] text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#2c5263] transition-all shadow-lg shadow-[#345d6e]/25 inline-block">Sélectionner les fichiers</span>
                        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.bmp,.webp" className="hidden" onChange={handleFiles} />
                    </label>
                    <p className="mt-4 text-xs text-slate-500 font-bold uppercase tracking-wider">Formats: PDF, PNG, JPG, BMP</p>
                    <p className="mt-1 text-[10px] text-slate-600 font-medium">Nommage: Matricule obligatoire pour création auto. Sinon Nom + Prénom requis.</p>
                </div>
            )}

            {isProcessing && (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-[#345d6e] border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-400 font-bold text-sm">Analyse intelligente du fichier {processedCount}...</p>
                </div>
            )}

            {results.length > 0 && !isProcessing && (
                <div className="space-y-6">
                    <div className="flex gap-4">
                        <div className="flex-1 bg-emerald-900/20 border border-emerald-500/25 p-4 rounded-xl">
                            <span className="text-2xl font-black text-emerald-400">{successUpdateCount}</span>
                            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">Mises à jour</p>
                        </div>
                        <div className="flex-1 bg-[#345d6e]/15 border border-[#345d6e]/30 p-4 rounded-xl">
                            <span className="text-2xl font-black text-[#7ecde8]">{successCreateCount}</span>
                            <p className="text-[10px] font-bold text-[#7ecde8]/60 uppercase tracking-widest mt-0.5">Nouveaux Dossiers</p>
                        </div>
                        <div className="flex-1 bg-rose-900/20 border border-rose-500/25 p-4 rounded-xl">
                            <span className="text-2xl font-black text-rose-400">{errorCount}</span>
                            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mt-0.5">Échecs</p>
                        </div>
                    </div>

                    <div className="border border-white/8 rounded-2xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-white/4 border-b border-white/8">
                                <tr>
                                    <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Fichier</th>
                                    <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Action</th>
                                    <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Détail</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {results.map((res, idx) => (
                                    <tr key={idx} className={res.status.includes('SUCCESS') ? 'hover:bg-white/3' : 'bg-rose-900/10 hover:bg-rose-900/15'}>
                                        <td className="px-4 py-3 font-bold text-slate-300 truncate max-w-[200px]">{res.filename}</td>
                                        <td className="px-4 py-3">
                                            {res.status === 'SUCCESS_UPDATE' && <span className="bg-emerald-900/25 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-black uppercase text-[9px]">Mise à jour</span>}
                                            {res.status === 'SUCCESS_CREATE' && <span className="bg-[#345d6e]/20 text-[#7ecde8] border border-[#345d6e]/30 px-2 py-1 rounded font-black uppercase text-[9px]">Création</span>}
                                            {res.status === 'ERROR' && <span className="text-rose-400 font-black">ERREUR</span>}
                                        </td>
                                        <td className="px-4 py-3 text-slate-400">
                                            {res.workerName && <span className="font-bold text-[#7ecde8] mr-2">{res.workerName} ({res.matricule})</span>}
                                            <span>{res.message}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/6 bg-white/3 flex justify-end gap-3 shrink-0">
            <button onClick={onClose} className="px-6 py-3 rounded-xl border border-white/8 text-slate-400 font-bold hover:bg-white/5 transition-all">Annuler</button>
            {totalSuccess > 0 && (
                <button onClick={handleConfirm} className="px-8 py-3 rounded-xl bg-[#345d6e] text-white font-black hover:bg-[#2c5263] transition-all shadow-lg shadow-[#345d6e]/25 active:scale-95 uppercase text-xs tracking-widest">
                    Valider {totalSuccess} Opérations
                </button>
            )}
        </div>

      </div>
    </div>
  );
};

export default BulkDocImportModal;
