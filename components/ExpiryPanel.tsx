
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { getExpiryInfo, saveLicenseData, clearLicense, ExpiryInfo } from '../utils/expiry';

interface Props {
  currentUser: User | null;
  onClose: () => void;
}

const ExpiryPanel: React.FC<Props> = ({ currentUser, onClose }) => {
  const [info, setInfo] = useState<ExpiryInfo>(getExpiryInfo());
  const [mode, setMode] = useState<'date' | 'days'>('date');
  const [dateInput, setDateInput] = useState('');
  const [daysInput, setDaysInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setDateInput(info.expiryDate || today);
  }, [info.expiryDate]);

  const refresh = () => setInfo(getExpiryInfo());

  const handleSave = () => {
    let expiryDate: string;
    if (mode === 'date') {
      if (!dateInput) return;
      expiryDate = dateInput;
    } else {
      const days = parseInt(daysInput, 10);
      if (isNaN(days) || days <= 0) return;
      const d = new Date();
      d.setDate(d.getDate() + days);
      expiryDate = d.toISOString().split('T')[0];
    }
    saveLicenseData({
      expiryDate,
      setDate: new Date().toISOString(),
      setBy: `${currentUser?.nom || ''} ${currentUser?.prenom || ''}`.trim() || 'Admin',
    });
    setSaved(true);
    refresh();
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClear = () => {
    clearLicense();
    setConfirmClear(false);
    refresh();
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const statusColor = !info.hasExpiry
    ? 'bg-slate-100 text-slate-500'
    : info.expired
      ? 'bg-rose-100 text-rose-700'
      : info.daysLeft <= 14
        ? 'bg-amber-100 text-amber-700'
        : 'bg-emerald-100 text-emerald-700';

  const statusLabel = !info.hasExpiry
    ? 'Pas de limite'
    : info.expired
      ? 'EXPIRÉE'
      : `${info.daysLeft} jour${info.daysLeft !== 1 ? 's' : ''} restant${info.daysLeft !== 1 ? 's' : ''}`;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[500] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'introSlideIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both' }}>

        {/* Header */}
        <div className="bg-gradient-to-r from-[#1e3a47] to-[#345d6e] px-7 py-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-black text-white tracking-wide">Gestion de Licence</h2>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Expiration de l'application</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Current status */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5 border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">État actuel</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold">Statut</span>
              <span className={`text-xs font-black px-2.5 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold">Date d'expiration</span>
              <span className="text-xs font-black text-slate-700">{fmtDate(info.expiryDate)}</span>
            </div>
            {info.setBy && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold">Défini par</span>
                <span className="text-xs font-bold text-slate-600">{info.setBy}</span>
              </div>
            )}
            {info.setDate && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold">Le</span>
                <span className="text-xs font-bold text-slate-600">{fmtDate(info.setDate)}</span>
              </div>
            )}
          </div>

          {/* Only admin can edit */}
          {isAdmin && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('date')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${mode === 'date' ? 'bg-[#345d6e] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  Par date
                </button>
                <button
                  onClick={() => setMode('days')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${mode === 'days' ? 'bg-[#345d6e] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  Par durée (jours)
                </button>
              </div>

              {/* Input */}
              {mode === 'date' ? (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Nouvelle date d'expiration</label>
                  <input
                    type="date"
                    value={dateInput}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setDateInput(e.target.value)}
                    className="w-full border-2 border-slate-200 focus:border-[#345d6e] focus:ring-2 focus:ring-[#345d6e]/20 px-4 py-2.5 rounded-xl text-slate-800 font-bold text-sm outline-none transition-all"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Nombre de jours à partir d'aujourd'hui</label>
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={daysInput}
                    onChange={e => setDaysInput(e.target.value)}
                    placeholder="Ex: 365"
                    className="w-full border-2 border-slate-200 focus:border-[#345d6e] focus:ring-2 focus:ring-[#345d6e]/20 px-4 py-2.5 rounded-xl text-slate-800 font-bold text-sm outline-none transition-all"
                  />
                </div>
              )}

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={mode === 'date' ? !dateInput : !daysInput || parseInt(daysInput) <= 0}
                className="w-full py-3 bg-[#345d6e] hover:bg-[#2c5263] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {saved ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                    Enregistré
                  </>
                ) : 'Enregistrer la licence'}
              </button>

              {/* Clear expiry */}
              {info.hasExpiry && !confirmClear && (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="w-full py-2 text-slate-400 hover:text-rose-500 font-bold text-xs rounded-xl hover:bg-rose-50 transition-all border border-slate-200"
                >
                  Supprimer la limite d'expiration
                </button>
              )}
              {confirmClear && (
                <div className="flex gap-2">
                  <button onClick={handleClear} className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs rounded-xl transition-all">Confirmer</button>
                  <button onClick={() => setConfirmClear(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold text-xs rounded-xl transition-all">Annuler</button>
                </div>
              )}
            </>
          )}

          {!isAdmin && (
            <p className="text-center text-slate-400 text-xs font-bold py-2">Seuls les administrateurs peuvent modifier la licence.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpiryPanel;
