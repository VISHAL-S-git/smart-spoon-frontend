import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import InstallApp from './components/InstallApp';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import {
  Wifi, WifiOff, Activity, Cpu, Download, Volume2, VolumeX, Eye, Share2,
  HeartPulse, Scale, TrendingDown, DollarSign, Pill, Camera, MessageSquare, Send,
  Zap, BarChart3, ScanFace, CheckCircle2, XCircle, ClipboardCheck, FlaskConical, 
  ActivitySquare, ShieldCheck, ShieldAlert, Milk, Leaf, Droplets, UploadCloud, Loader2,
  Sparkles
} from "lucide-react";

// ============================================================================
// BACKEND WEBSOCKET CONFIGURATION
// ============================================================================
const WS_URL = "wss://smart-spoon-backend.onrender.com/ws";
const HTTP_URL = "https://smart-spoon-backend.onrender.com"; // Added for POST requests
// ============================================================================

const HISTORY_LEN = 40;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

const GLOBAL_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", ttsCode: "en-US" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", ttsCode: "ta-IN" }
];

const INTERNAL_DICTIONARY = {
  en: {
    app_title: "Smart Spoon AI",
    subtitle: "Spectroscopic Metrology",
    live: "Neural Live",
    reconnecting: "Re-calibrating",
    offline: "Link Lost",
    verdict: "Diagnostic Verdict",
    confidence: "AI Confidence",
    safety_score: "Safety Index",
    ph_meter: "Active Dielectric pH",
    countertop_timer: "Ambient Shelf Life",
    fridge_timer: "Cold-Chain Longevity",
    kitchen_directive: "Actionable Directive",
    consumer_intel: "Consumer Intelligence",
    deep_lab: "Multi-Model Diagnostics",
    eis_waveform: "Real-Time EIS Stream",
    ai_prob: "Ensemble Probability Matrix"
  },
  ta: {
    app_title: "ஸ்மார்ட் ஸ்பூன் ஏஐ",
    subtitle: "திரவ பகுப்பாய்வு அளவியல்",
    live: "நேரலை",
    reconnecting: "இணைக்கிறது",
    offline: "துண்டிக்கப்பட்டது",
    verdict: "ஆய்வு முடிவு",
    confidence: "நம்பகத்தன்மை",
    safety_score: "பாதுகாப்பு குறியீடு",
    ph_meter: "செயலில் உள்ள pH",
    countertop_timer: "அறை ஆயுள்",
    fridge_timer: "குளிர்பதன ஆயுள்",
    kitchen_directive: "வழிகாட்டல்",
    consumer_intel: "நுகர்வோர் நுண்ணறிவு",
    deep_lab: "தொழில்நுட்ப பகுப்பாய்வு",
    eis_waveform: "மின்மறிப்பு அலைவரிசை",
    ai_prob: "நிகழ்தகவு பரவல்"
  }
};

function parseProbabilityDistribution(raw) {
  if (!raw || typeof raw !== "string") {
    return [
      { name: "Pure Milk", value: 92.4 },
      { name: "Water Dilution", value: 4.1 },
      { name: "Apple Extract", value: 2.2 },
      { name: "Detergent", value: 1.3 }
    ];
  }
  try {
    const sanitized = raw.replace(/'/g, '"');
    const parsed = JSON.parse(sanitized);
    return Object.entries(parsed).map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value: Number(value) || 0
    }));
  } catch {
    return [
      { name: "Pure Milk", value: 92.4 },
      { name: "Water Dilution", value: 4.1 },
      { name: "Apple Extract", value: 2.2 },
      { name: "Detergent", value: 1.3 }
    ];
  }
}

function firstNumber(raw, fallback = 0) {
  if (typeof raw === "number") return isNaN(raw) ? fallback : raw;
  if (typeof raw !== "string") return fallback;
  const match = raw.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
}

export default function App() {
  const [hero, setHero] = useState({ adulteration_type: "Connecting Neural Link…", accuracy: 0, status_color: "#71717a" });
  const [primary, setPrimary] = useState({});
  const [secondary, setSecondary] = useState({});
  const [meta, setMeta] = useState({ timestamp: "--", raw_adc: 0, probe_temperature_c: 0, excitation_frequency_hz: 0 });
  const [zHistory, setZHistory] = useState([]);
  const [lang, setLang] = useState("en");
  const [activeTab, setActiveTab] = useState("telemetry");
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("CONNECTING");

  const [targetProfile, setTargetProfile] = useState("milk");

  const [labImage, setLabImage] = useState(null);
  const [labResults, setLabResults] = useState(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const visionCanvasRef = useRef(null);

  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    {
      sender: "bot",
      text: "Universal Spectrometer initialized. Select your target matrix (Milk, Apple, or Water) and I will evaluate its purity."
    }
  ]);
  const chatScrollRef = useRef(null);

  const t = useMemo(() => INTERNAL_DICTIONARY[lang] || INTERNAL_DICTIONARY.en, [lang]);

  // ============================================================================
  // NEW MODE SWITCHER FUNCTION (Updates UI & tells Python Backend)
  // ============================================================================
  const handleModeSwitch = async (modeId) => {
    setTargetProfile(modeId); // Instantly update UI

    try {
      // Send the mode change command to your Python backend
      await fetch(`${HTTP_URL}/set_mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Fallback 'water' to 'milk' since backend only has apple/milk right now
        body: JSON.stringify({ mode: modeId === "apple" ? "apple" : "milk" }) 
      });
      console.log(`Backend logic successfully switched to: ${modeId}`);
    } catch (err) {
      console.error("Failed to switch backend mode:", err);
    }
  };
  // ============================================================================

  useEffect(() => {
    let ws;
    let reconnectTimer;
    let retryAttempt = 0;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          setIsConnected(true);
          setConnectionState("OPEN");
          retryAttempt = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.hero) setHero(data.hero);
            if (data.primary) setPrimary(data.primary);
            if (data.secondary) setSecondary(data.secondary);
            if (data.system_meta) setMeta(data.system_meta);

            // Using the processed mean from your backend
            const zMag = firstNumber(data?.system_meta?.processed_mean_hz || data?.system_meta?.excitation_frequency_hz, 0);
            setZHistory(prev => [...prev, { t: prev.length + 1, z: zMag }].slice(-40));
          } catch (err) {
            console.error("Frame Parser Exception:", err);
          }
        };

        ws.onerror = () => ws.close();

        ws.onclose = () => {
          setIsConnected(false);
          setConnectionState("RECONNECTING");
          const backoff = Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * Math.pow(2, retryAttempt));
          retryAttempt += 1;
          reconnectTimer = setTimeout(connect, backoff + Math.floor(Math.random() * 500));
        };
      } catch {
        setIsConnected(false);
        setConnectionState("RECONNECTING");
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const query = chatInput.trim();
    setChatHistory((prev) => [...prev, { sender: "user", text: query }]);
    setChatInput("");

    setTimeout(() => {
      const q = query.toLowerCase();
      let reply = `Target matrix is set to ${targetProfile}. Current live frequency is ${meta.processed_mean_hz || meta.excitation_frequency_hz} Hz.`;
      if (q.includes("apple") || q.includes("fruit")) {
        reply = "Apples contain malic acid and fructose, which dramatically increase ionic conductivity, pushing frequencies to 6000+ Hz.";
      } else if (q.includes("milk")) {
        reply = "Pure milk stabilizes around 2200-2400 Hz. If it drops to ~2000 Hz, water dilution is detected.";
      }
      setChatHistory((prev) => [...prev, { sender: "bot", text: reply }]);
    }, 500);
  };

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setLabImage(event.target?.result);
      setLabResults(null);
    };
    reader.readAsDataURL(file);
  };

  const executeOpticalAnalysis = () => {
    if (!labImage || !visionCanvasRef.current) return;
    setIsAnalyzingImage(true);
    const canvas = visionCanvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = new Image();
    
    img.onload = () => {
      try {
        const MAX_SIZE = 150;
        const scale = Math.min(MAX_SIZE / img.width, MAX_SIZE / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        let rT = 0, gT = 0, bT = 0;
        let pixelCount = 0;

        for (let i = 0; i < data.length; i += 4) {
          rT += data[i];
          gT += data[i + 1];
          bT += data[i + 2];
          pixelCount++;
        }
        
        const r = Math.round(rT / pixelCount);
        const g = Math.round(gT / pixelCount);
        const b = Math.round(bT / pixelCount);
        const brightness = (r + g + b) / 3;

        let verdict = "Unknown Sample";
        let alertLevel = "safe";

        if (r > 200 && g > 200 && b > 200) {
          verdict = "Pure Milk Suspend Detected (High White Reflectance)";
          alertLevel = "safe";
        } else if (r > g + 20 && r > b + 40) {
          verdict = "Apple / Fruit Extract Detected (Red/Yellow Dominant)";
          alertLevel = "safe";
        } else if (b > r + 15 && b > g + 10) {
          verdict = "Water / Dilution Signature (High Cyan Scattering)";
          alertLevel = "danger";
        } else if (brightness < 100) {
          verdict = "Suspended Particulate / Turbidity Anomaly Detected";
          alertLevel = "warning";
        } else {
          verdict = "Mixed/Unknown Biological Matrix";
          alertLevel = "warning";
        }

        setTimeout(() => {
          setLabResults({ r, g, b, verdict, alertLevel });
          setIsAnalyzingImage(false);
        }, 1200); 

      } catch (err) {
        console.error("Canvas Execution Error:", err);
        setIsAnalyzingImage(false);
      }
    };

    img.onerror = () => {
      console.error("Image loading failed.");
      setIsAnalyzingImage(false);
    };

    img.src = labImage;
  };

  // We rely entirely on the backend data for these now!
  const liveFreq = meta.processed_mean_hz || 0;
  const dynamicHero = hero;
  const dynamicSafetyScore = primary["1_safety_score"] || 0;
  const dynamicPh = primary["21_REAL_TIME_TEMP_C"] ? primary["21_REAL_TIME_TEMP_C"] : 6.7; // Using temp spot for UI placeholder if needed

  const isToxic = dynamicHero.status_color === "#ef4444" || dynamicHero.status_color === "#f59e0b";
  const safetyColor = dynamicHero.status_color || "#71717a";
  const radarData = useMemo(() => parseProbabilityDistribution(secondary?.ai_and_regulatory_metrology?.["35_Class_Probability_Distribution"]), [secondary]);

  return (
    <div className="min-h-screen font-sans bg-black text-zinc-100 selection:bg-white/20 relative overflow-hidden pb-24">
      
      {/* Aurora Glass Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
        <div 
          className="absolute w-[800px] h-[800px] rounded-full blur-[160px] opacity-[0.15] transition-all duration-[3000ms] ease-in-out" 
          style={{ 
            backgroundColor: dynamicHero.status_color,
            transform: 'translate(-20%, -30%) scale(1.2)'
          }} 
        />
        <div className="absolute w-[600px] h-[600px] bg-cyan-600 rounded-full blur-[140px] opacity-[0.08] translate-x-1/2 translate-y-1/3" />
        <div className="absolute w-[900px] h-[400px] bg-indigo-600 rounded-full blur-[180px] opacity-[0.1] -translate-x-1/4 translate-y-1/2" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] mix-blend-overlay" />
      </div>

      {/* Floating Spatial Header */}
      <div className="sticky top-6 z-50 px-6 max-w-7xl mx-auto">
        <header className="flex items-center justify-between gap-4 px-5 py-3.5 bg-white/[0.03] backdrop-blur-3xl border border-white/[0.08] rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-4">
            <div className="relative w-10 h-10 flex items-center justify-center bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-full shadow-inner">
              <Sparkles className="w-5 h-5 text-zinc-200" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-zinc-100 leading-none">{t.app_title}</h1>
                <span className="px-1.5 py-0.5 rounded-[4px] text-[9px] font-mono font-bold bg-white/10 text-zinc-300">
                  AI PRO
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-medium mt-1 leading-none">{t.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="bg-transparent border-none text-zinc-300 text-xs font-semibold uppercase outline-none cursor-pointer hidden sm:block appearance-none pr-2"
            >
              {GLOBAL_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-zinc-900 text-white">{l.code}</option>
              ))}
            </select>
            <div className="w-[1px] h-4 bg-white/10 hidden sm:block" />
            <InstallApp />
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-bold tracking-wide uppercase transition-all backdrop-blur-md ${
              isConnected ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "border-rose-500/30 text-rose-400 bg-rose-500/10 animate-pulse"
            }`}>
              {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isConnected ? t.live : connectionState === "RECONNECTING" ? t.reconnecting : t.offline}</span>
            </div>
          </div>
        </header>
      </div>

      {/* Floating Segmented Navigation */}
      <div className="max-w-7xl mx-auto px-6 mt-10 mb-8 relative z-10 flex justify-center sm:justify-start">
        <div className="flex p-1.5 bg-white/[0.04] backdrop-blur-2xl border border-white/[0.05] rounded-full shadow-2xl overflow-x-auto scrollbar-hide">
          {[
            { id: "telemetry", icon: ActivitySquare, label: "Telemetry" },
            { id: "health", icon: HeartPulse, label: "Bio-Grid" },
            { id: "vision", icon: ScanFace, label: "Vision Lab" },
            { id: "assistant", icon: MessageSquare, label: "AI Agent" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-colors z-10 whitespace-nowrap ${
                activeTab === tab.id ? "text-black" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTabPill"
                  className="absolute inset-0 bg-white rounded-full -z-10 shadow-sm"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 relative z-10">
        
        {/* ======================= TAB 1: TELEMETRY ======================= */}
        {activeTab === "telemetry" && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >

            {/* Target Matrix Pills */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mr-2 flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5" /> Matrix
              </span>
              {[
                { id: "milk", label: "Dairy (Milk)", icon: Milk },
                { id: "apple", label: "Apple Extract", icon: Leaf },
                { id: "water", label: "Pure Water", icon: Droplets }
              ].map((profile) => (
                <button
                  key={profile.id}
                  // ==========================================
                  // EXECUTING THE NEW MODE SWITCH FUNCTION HERE!
                  // ==========================================
                  onClick={() => handleModeSwitch(profile.id)} 
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 border backdrop-blur-xl ${
                    targetProfile === profile.id
                      ? `border-white/20 bg-white/10 text-white shadow-lg`
                      : `border-white/5 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200`
                  }`}
                >
                  <profile.icon className={`w-4 h-4 ${targetProfile === profile.id ? 'text-white' : 'text-zinc-500'}`} />
                  {profile.label}
                </button>
              ))}
            </div>

            {/* Aurora Glass Hero Section */}
            <AnimatePresence mode="wait">
              <motion.div
                key={dynamicHero.adulteration_type}
                initial={{ opacity: 0, filter: "blur(10px)", scale: 0.98 }}
                animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                exit={{ opacity: 0, filter: "blur(10px)", scale: 0.98 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-[32px] p-8 md:p-14 overflow-hidden border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl shadow-[0_24px_48px_rgba(0,0,0,0.5)]"
              >
                {/* Dynamic Inner Glow */}
                <div 
                  className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full blur-[100px] opacity-20 pointer-events-none mix-blend-screen"
                  style={{ backgroundColor: dynamicHero.status_color }}
                />
                
                {isToxic && (
                   <motion.div 
                     className="absolute inset-0 rounded-[32px] border border-rose-500/0 pointer-events-none"
                     animate={{ borderColor: ["rgba(244,63,94,0)", "rgba(244,63,94,0.3)", "rgba(244,63,94,0)"] }}
                     transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                   />
                )}

                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-10 z-10">
                  <div className="flex-1 space-y-5">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border bg-black/40 backdrop-blur-md text-xs font-bold uppercase tracking-widest"
                         style={{ borderColor: `${dynamicHero.status_color}40`, color: dynamicHero.status_color }}>
                      {isToxic ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                      <span>{t.verdict} / {targetProfile}</span>
                    </div>
                    <h2 className="text-5xl sm:text-7xl font-semibold text-white tracking-tighter leading-[1.1] pb-1">
                      {dynamicHero.adulteration_type}
                    </h2>
                  </div>

                  <div className="flex items-center gap-6 bg-white/[0.03] p-6 rounded-[28px] border border-white/[0.05] shrink-0 shadow-xl backdrop-blur-2xl">
                    <div className="w-24 h-24 drop-shadow-[0_0_12px_rgba(255,255,255,0.1)]">
                      <CircularProgressbar
                        value={dynamicHero.accuracy || 0}
                        text={`${(dynamicHero.accuracy || 0).toFixed(1)}%`}
                        styles={buildStyles({
                          pathColor: dynamicHero.status_color || '#71717a',
                          trailColor: "rgba(255,255,255,0.04)",
                          textColor: "#ffffff",
                          textSize: "22px",
                          strokeLinecap: "round",
                        })}
                      />
                    </div>
                    <div>
                      <div className="text-zinc-400 text-[10px] font-semibold uppercase tracking-widest mb-1">{t.confidence}</div>
                      <div className="text-3xl font-semibold text-white tabular-nums tracking-tight">
                        {(dynamicHero.accuracy || 0).toFixed(1)}<span className="text-xl text-zinc-500 ml-0.5">%</span>
                      </div>
                      <div className="text-xs text-zinc-300 font-mono mt-2 bg-white/5 px-2.5 py-1 rounded-md border border-white/10 inline-block">
                        {liveFreq} Hz Live
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Safety Score Card */}
              <div className="lg:col-span-4 rounded-[32px] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl p-8 flex flex-col items-center justify-center relative shadow-xl overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
                <div className="w-full flex items-center justify-between absolute top-6 px-8">
                  <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Safety Index</span>
                  <ActivitySquare className="w-4 h-4 text-zinc-500" />
                </div>
                <div className="w-36 h-36 mt-8 relative">
                  <CircularProgressbar
                    value={dynamicSafetyScore}
                    text={`${dynamicSafetyScore}`}
                    styles={buildStyles({
                      pathColor: safetyColor,
                      trailColor: "rgba(255,255,255,0.03)",
                      textColor: "#ffffff",
                      textSize: "28px",
                      strokeLinecap: "round"
                    })}
                  />
                  {/* Inner glow behind the circular progress bar */}
                  <div className="absolute inset-0 rounded-full blur-xl opacity-20 -z-10" style={{ backgroundColor: safetyColor }} />
                </div>
              </div>

              {/* Directive & Hardware Stats */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                <div className="rounded-[32px] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl p-8 shadow-xl relative overflow-hidden h-full flex flex-col justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                  
                  <div className="flex items-center gap-2 text-zinc-400 mb-4 relative z-10">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-widest font-semibold">Live AI Directive</span>
                  </div>
                  
                  <div className="text-xl sm:text-2xl font-semibold text-white tracking-tight leading-relaxed relative z-10">
                    {primary["11_kitchen_directive"] || "Awaiting sensor matrix insertion..."}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.015] p-6 shadow-md flex flex-col items-center justify-center relative backdrop-blur-2xl">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Probe Temp</div>
                    <div className="text-3xl font-semibold text-white tabular-nums">{meta.probe_temperature_c}<span className="text-lg text-zinc-500 font-normal ml-1">°C</span></div>
                  </div>
                  <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.015] p-6 shadow-md flex flex-col items-center justify-center relative backdrop-blur-2xl">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Internal Impedance</div>
                    <div className="text-3xl font-semibold text-white tabular-nums">
                      {liveFreq} <span className="text-lg text-zinc-500 font-normal ml-1">Hz</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Lab Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              {/* EIS Waveform */}
              <div className="rounded-[32px] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl p-8 shadow-xl">
                <div className="flex items-center justify-between mb-8">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.eis_waveform}</div>
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-md">
                    <span className="text-xs font-mono text-zinc-300 font-medium tabular-nums">
                      {zHistory.length > 0 ? `${zHistory[zHistory.length - 1]?.z} Hz` : "0 Hz"}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={zHistory} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={['auto', 'auto']} hide />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "rgba(0, 0, 0, 0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", color: "#f4f4f5", fontSize: "12px", backdropFilter: "blur(16px)" }}
                      itemStyle={{ color: "#22d3ee", fontWeight: "600" }}
                      formatter={(v) => [`${v} Hz`, "Frequency"]}
                      labelFormatter={() => ""}
                      cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                    />
                    <Line type="monotone" dataKey="z" stroke="#22d3ee" strokeWidth={2.5} dot={false} isAnimationActive={false} style={{ filter: "drop-shadow(0px 4px 10px rgba(34, 211, 238, 0.4))" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* AI Probability Radar */}
              <div className="rounded-[32px] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl p-8 shadow-xl">
                <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-6">{t.ai_prob}</div>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} outerRadius={90}>
                    <PolarGrid stroke="rgba(255,255,255,0.05)" />
                    <PolarAngleAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 10, fontWeight: 500 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                    <Radar dataKey="value" stroke="#818cf8" strokeWidth={2} fill="#818cf8" fillOpacity={0.2} style={{ filter: "drop-shadow(0px 0px 10px rgba(129, 140, 248, 0.3))" }} isAnimationActive={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "rgba(0, 0, 0, 0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", color: "#f4f4f5", fontSize: "12px", backdropFilter: "blur(16px)" }}
                      itemStyle={{ color: "#a5b4fc", fontWeight: "600" }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}

        {/* ======================= TAB 2: HEALTH ======================= */}
        {activeTab === "health" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-[32px] border border-rose-500/10 bg-rose-950/10 backdrop-blur-3xl p-10 shadow-xl relative overflow-hidden group">
              <div className="absolute -top-32 -right-32 w-[400px] h-[400px] bg-rose-500/10 blur-[80px] rounded-full pointer-events-none transition-opacity group-hover:opacity-70 opacity-40" />
              <div className="w-14 h-14 bg-white/5 rounded-[20px] flex items-center justify-center border border-white/10 text-rose-400 mb-8 backdrop-blur-md">
                <TrendingDown className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-rose-400 mb-3">Estimated Loss Penalty</h3>
              <div className="text-6xl font-semibold text-white mb-5 tabular-nums tracking-tighter">
                <span className="text-3xl text-rose-500 font-medium mr-1.5">₹</span>
                {Math.round(firstNumber(primary["19_fraud_loss_penalty_inr"], 0))}
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-sm">
                Capital lost paying pure organic rates for fraudulent biological matrices containing adulterants.
              </p>
            </div>

            <div className="rounded-[32px] border border-emerald-500/10 bg-emerald-950/10 backdrop-blur-3xl p-10 shadow-xl relative overflow-hidden group">
              <div className="absolute -top-32 -right-32 w-[400px] h-[400px] bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none transition-opacity group-hover:opacity-70 opacity-40" />
              <div className="w-14 h-14 bg-white/5 rounded-[20px] flex items-center justify-center border border-white/10 text-emerald-400 mb-8 backdrop-blur-md">
                <DollarSign className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3">Safety Index Benchmark</h3>
              <div className="text-6xl font-semibold text-white mb-5 tabular-nums tracking-tighter">
                {dynamicSafetyScore}
                <span className="text-2xl text-zinc-500 font-normal ml-2">/ 100</span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-sm">
                Safety index computed directly from active impedance vectors and dielectric cellular health.
              </p>
            </div>
          </motion.div>
        )}

        {/* ======================= TAB 3: OPTICAL CV LAB ======================= */}
        {activeTab === "vision" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="rounded-[32px] border border-white/[0.08] bg-white/[0.02] p-8 shadow-2xl backdrop-blur-3xl">
            <div className="flex items-center gap-5 mb-10">
              <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
                <ScanFace className="w-6 h-6 text-zinc-200" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-white tracking-tight">Optical Lab</h3>
                <p className="text-sm text-zinc-400 mt-1">Evaluate liquid scattering vectors using device optics</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Input Zone */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col items-center justify-center w-full h-52 border border-white/10 border-dashed rounded-[28px] cursor-pointer bg-white/[0.01] hover:bg-white/[0.04] transition-all group relative overflow-hidden backdrop-blur-md">
                    <div className="absolute inset-0 bg-gradient-to-t from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Camera className="w-8 h-8 text-zinc-300 mb-4 group-hover:scale-110 transition-transform duration-500" />
                    <span className="text-sm font-semibold text-white">Live Camera</span>
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase mt-1 tracking-widest">Capture</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
                  </label>

                  <label className="flex flex-col items-center justify-center w-full h-52 border border-white/10 border-dashed rounded-[28px] cursor-pointer bg-white/[0.01] hover:bg-white/[0.04] transition-all group relative overflow-hidden backdrop-blur-md">
                    <UploadCloud className="w-8 h-8 text-zinc-500 mb-4 group-hover:text-zinc-300 transition-colors duration-500" />
                    <span className="text-sm font-semibold text-zinc-200">Upload File</span>
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase mt-1 tracking-widest">Gallery</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>

                {labImage && (
                  <button
                    onClick={executeOpticalAnalysis}
                    disabled={isAnalyzingImage}
                    className="w-full py-4.5 bg-white text-black hover:bg-zinc-200 font-semibold uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50 text-[13px]"
                  >
                    {isAnalyzingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span>{isAnalyzingImage ? "Computing Pixel Matrix..." : "Run Spectrophotometry"}</span>
                  </button>
                )}
              </div>

              {/* Analysis Results Panel */}
              <div className="bg-black/20 rounded-[28px] border border-white/5 p-8 flex flex-col justify-center relative overflow-hidden backdrop-blur-xl">
                {!labImage ? (
                  <div className="text-center flex flex-col items-center justify-center h-full">
                    <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-5">
                      <BarChart3 className="w-8 h-8 text-zinc-600" />
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Awaiting Image Matrix</p>
                  </div>
                ) : (
                  <div className="space-y-8 relative z-10">
                    <div className="flex gap-6 items-center">
                      <div className="relative shrink-0">
                        <div className="absolute inset-0 bg-white/10 animate-pulse rounded-[20px] blur-md" />
                        <img src={labImage} alt="Sample" className="relative w-28 h-28 object-cover rounded-[20px] border border-white/10 shadow-2xl" />
                      </div>
                      <div className="flex flex-col justify-center">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-zinc-300 uppercase tracking-widest mb-2 w-max">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Staged
                        </div>
                        <div className="text-base font-semibold text-white">Image Loaded</div>
                        <div className="text-xs text-zinc-500 font-mono mt-1">Ready for classification</div>
                      </div>
                    </div>

                    <canvas ref={visionCanvasRef} className="hidden" />

                    {labResults && (
                      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="bg-white/[0.03] rounded-[20px] p-6 border border-white/10 space-y-5">
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Extracted RGB Vector</div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col items-center justify-center py-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                            <span className="text-[10px] font-semibold uppercase mb-1 opacity-60 tracking-wider">Red</span>
                            <span className="font-mono text-lg font-semibold">{labResults.r}</span>
                          </div>
                          <div className="flex flex-col items-center justify-center py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <span className="text-[10px] font-semibold uppercase mb-1 opacity-60 tracking-wider">Green</span>
                            <span className="font-mono text-lg font-semibold">{labResults.g}</span>
                          </div>
                          <div className="flex flex-col items-center justify-center py-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <span className="text-[10px] font-semibold uppercase mb-1 opacity-60 tracking-wider">Blue</span>
                            <span className="font-mono text-lg font-semibold">{labResults.b}</span>
                          </div>
                        </div>
                        <div className={`mt-2 pt-5 border-t border-white/5 text-lg font-semibold tracking-tight ${
                          labResults.alertLevel === 'danger' ? 'text-rose-400' : 
                          labResults.alertLevel === 'warning' ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {labResults.verdict}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ======================= TAB 4: ASSISTANT ======================= */}
        {activeTab === "assistant" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="rounded-[32px] border border-white/[0.08] bg-white/[0.02] h-[680px] flex flex-col overflow-hidden shadow-2xl backdrop-blur-3xl">
            <div className="bg-white/[0.02] backdrop-blur-xl p-5 border-b border-white/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 relative">
                <MessageSquare className="w-5 h-5" />
                <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-black" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-base tracking-tight">Spectrometer AI</h3>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/80 font-medium mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="uppercase tracking-widest">Ensemble Inference Active</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {chatHistory.map((item, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
                  key={idx} 
                  className={`flex ${item.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[75%] rounded-3xl px-6 py-4 text-sm leading-relaxed shadow-lg ${
                    item.sender === "user" 
                      ? "bg-white text-black rounded-br-sm" 
                      : "bg-white/5 text-zinc-200 border border-white/10 rounded-bl-sm backdrop-blur-md"
                  }`}>
                    {item.text}
                  </div>
                </motion.div>
              ))}
              <div ref={chatScrollRef} />
            </div>

            <div className="p-5 bg-black/40 backdrop-blur-xl border-t border-white/5">
              <form onSubmit={handleChatSubmit} className="flex gap-3 relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Inquire about matrix data, FSSAI regulations..."
                  className="flex-1 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/10 rounded-[20px] px-6 py-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600"
                />
                <button 
                  type="submit" 
                  disabled={!chatInput.trim()} 
                  className="bg-white hover:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-white text-black px-6 rounded-[20px] transition-all shadow-lg flex items-center justify-center group"
                >
                  <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}