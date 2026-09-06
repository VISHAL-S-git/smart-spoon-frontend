import React, { useState, useEffect } from 'react';
import { Download, Loader2 } from 'lucide-react';

export default function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if the app is already installed and running as an app
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true);
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert("Chrome is still preparing the app install. Please refresh the page or clear cache and try again.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Only hide the button completely if the app is already installed
  if (isStandalone) return null;

  return (
    <button
      onClick={handleInstallClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
        deferredPrompt 
          ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]" 
          : "bg-slate-800 border border-slate-700 text-slate-400"
      }`}
    >
      {deferredPrompt ? <Download className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      <span>{deferredPrompt ? "Install App" : "Preparing..."}</span>
    </button>
  );
}