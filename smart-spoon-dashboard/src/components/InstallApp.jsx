import React, { useState, useEffect } from 'react';

export default function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    // If they are already using the downloaded app, DO NOTHING!
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return; 
    }

    // This browser event ONLY fires if the app is NOT installed yet
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault(); // Stop Chrome's default ugly popup
      setDeferredPrompt(e);
      setShowPopup(true); // Show our beautiful custom popup
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the official install prompt
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    // If they click install, hide our button
    if (outcome === 'accepted') {
      setShowPopup(false);
    }
    setDeferredPrompt(null);
  };

  if (!showPopup) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 bg-slate-900 border border-teal-500 p-4 rounded-xl shadow-[0_0_20px_rgba(45,212,191,0.3)] z-[9999] flex justify-between items-center text-white backdrop-blur-md bg-opacity-90">
      <div>
        <h3 className="font-bold text-teal-400 text-lg">Install Smart Spoon</h3>
        <p className="text-xs text-slate-400 font-medium">Add to home screen for God-Mode UI</p>
      </div>
      <button
        onClick={handleInstallClick}
        className="bg-teal-500 hover:bg-teal-400 text-slate-900 font-extrabold py-2 px-5 rounded-lg shadow-[0_0_15px_rgba(45,212,191,0.6)] transition-all uppercase tracking-wider text-sm"
      >
        Install
      </button>
    </div>
  );
}