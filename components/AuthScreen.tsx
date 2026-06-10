
import React, { useState } from 'react';
import { User } from '../types';
import { decrypt } from '../utils/crypto';

interface AuthScreenProps {
  users: User[];
  onLogin: (user: User) => void;
  onSignup: (newUser: User) => void;
}

const APP_CREDITS = "Application créée par AMROUS Ayham — Propriété de AMROUS Abdallah";

const AuthScreen: React.FC<AuthScreenProps> = ({ users, onLogin, onSignup }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showSignupPending, setShowSignupPending] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = `${name.trim()} ${surname.trim()}`;
    const user = users.find(u => u.username.toLowerCase() === fullName.toLowerCase());
    if (!user) { setError("Identifiants incorrects. Vérifiez votre nom et mot de passe."); return; }
    const decryptedPwd = decrypt(user.password);
    if (decryptedPwd !== password) { setError("Identifiants incorrects. Vérifiez votre nom et mot de passe."); return; }
    if (user.status === 'PENDING') { setError("Votre compte est en attente d'approbation par l'administrateur."); return; }
    onLogin(user);
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !surname || !password) { setError("Tous les champs sont obligatoires."); return; }
    const fullName = `${name.trim()} ${surname.trim()}`;
    const exists = users.some(u => u.username.toLowerCase() === fullName.toLowerCase());
    if (exists) { setError("Cet utilisateur existe déjà."); return; }
    onSignup({ username: fullName, fullName, password, role: 'USER', status: 'PENDING' });
    setShowSignupPending(true);
  };

  if (showSignupPending) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50 rounded-full blur-3xl pointer-events-none opacity-60" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-50 rounded-full blur-3xl pointer-events-none opacity-60" />

        <div className="animate-scale-in w-full max-w-sm relative z-10">
          <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden">
            <div className="px-8 py-10 text-center">
              <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Inscription en attente</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Votre inscription est en attente d'approbation. Contactez le créateur de l'application :
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-6 py-4 mb-8">
                <p className="text-[#1A56DB] font-black text-2xl tracking-[0.15em]">06 99 40 70 36</p>
              </div>
              <button
                onClick={() => { setShowSignupPending(false); setIsLoginMode(true); setName(''); setSurname(''); setPassword(''); }}
                className="btn-press w-full bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-semibold py-3 rounded-xl transition-colors text-sm shadow-sm"
              >
                Retour à la connexion
              </button>
            </div>
            <div className="px-8 py-4 border-t border-gray-100 text-center bg-gray-50">
              <p className="text-[10px] text-gray-400">{APP_CREDITS}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex overflow-hidden relative">
      <div className="absolute top-[-15%] right-[-10%] w-[700px] h-[700px] bg-blue-50 rounded-full blur-3xl pointer-events-none opacity-70" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-50 rounded-full blur-3xl pointer-events-none opacity-70" />

      {/* Left panel — branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-14 relative z-10">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-[#1A56DB] rounded-xl flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <div>
              <p className="text-gray-900 font-black text-sm tracking-tight leading-none">CSGM AMROUS</p>
              <p className="text-gray-500 text-[10px] font-medium uppercase tracking-widest">Gestion Materiel HMD</p>
            </div>
          </div>

          <div className="animate-fade-up">
            <h1 className="text-5xl font-black text-gray-900 leading-tight tracking-tight mb-4">
              Plateforme de<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1A56DB] to-[#6366F1]">
                Suivi BP
              </span>
            </h1>
            <p className="text-gray-500 text-base leading-relaxed max-w-sm">
              Système de gestion sécurisé pour le personnel et les documents des chantiers HMD.
            </p>
          </div>

          <div className="mt-8 space-y-5 animate-fade-up stagger-2">
            {[
              { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', label: 'Gestion du personnel', desc: 'Dossiers complets avec traçabilité' },
              { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Suivi des brevets', desc: "Alertes d'expiration automatiques" },
              { icon: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Export & Backup', desc: 'ZIP, Excel et base SQLite' },
            ].map((item, i) => (
              <div key={item.label} className={`flex items-center gap-4 animate-slide-right stagger-${i+2}`}>
                <div className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-5 h-5 text-[#1A56DB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d={item.icon}/>
                  </svg>
                </div>
                <div>
                  <p className="text-gray-900 text-sm font-semibold">{item.label}</p>
                  <p className="text-gray-500 text-xs">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-gray-400 text-xs font-medium">Système sécurisé — Données stockées localement</p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-sm animate-scale-in">
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-9 h-9 bg-[#1A56DB] rounded-xl flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <p className="text-gray-900 font-black text-sm">CSGM AMROUS</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden">
            <div className="px-8 pt-8 pb-2">
              <h2 className="text-2xl font-black text-gray-900 mb-1">
                {isLoginMode ? 'Connexion' : 'Créer un compte'}
              </h2>
              <p className="text-gray-500 text-sm mb-7">
                {isLoginMode ? 'Accédez à votre espace de gestion.' : 'Votre compte sera soumis à approbation.'}
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-4 py-3 rounded-xl mb-5 flex items-center gap-2.5">
                  <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={isLoginMode ? handleLogin : handleSignup} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Nom</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value.toUpperCase()); setError(''); }}
                      className="premium-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-semibold text-gray-900 placeholder-gray-400 text-sm uppercase"
                      placeholder="NOM"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Prénom</label>
                    <input
                      type="text"
                      value={surname}
                      onChange={(e) => { setSurname(e.target.value); setError(''); }}
                      className="premium-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-semibold text-gray-900 placeholder-gray-400 text-sm capitalize"
                      placeholder="Prénom"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      className="premium-input w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-12 py-3 font-semibold text-gray-900 placeholder-gray-400 text-sm"
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPassword
                        ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      }
                    </button>
                  </div>
                </div>

                <button type="submit"
                  className="btn-press w-full bg-[#1A56DB] hover:bg-[#1E40AF] text-white font-bold py-3.5 rounded-xl transition-colors text-sm mt-2 shadow-sm">
                  {isLoginMode ? 'Accéder au système' : "S'inscrire"}
                </button>
              </form>

              <div className="mt-6 pb-6 text-center">
                <button onClick={() => { setIsLoginMode(!isLoginMode); setError(''); setName(''); setSurname(''); setPassword(''); }}
                  className="text-xs text-gray-500 hover:text-[#1A56DB] transition-colors font-medium">
                  {isLoginMode ? 'Nouvel utilisateur ? Créer un compte' : 'Déjà un compte ? Se connecter'}
                </button>
              </div>
            </div>
            <div className="px-8 py-4 border-t border-gray-100 text-center bg-gray-50">
              <p className="text-[10px] text-gray-400">{APP_CREDITS}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
