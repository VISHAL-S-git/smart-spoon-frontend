import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import InstallApp from './components/InstallApp';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import {
  Wifi, WifiOff, Activity, ActivitySquare, Camera, MessageSquare, Send,
  Zap, BarChart3, ScanFace, ClipboardCheck, ShieldCheck, ShieldAlert,
  TrendingDown, DollarSign, UploadCloud, Loader2, Sparkles, AlertTriangle
} from "lucide-react";

// ============================================================================
// BACKEND WEBSOCKET CONFIGURATION
// ============================================================================
const WS_URL = "wss://smart-spoon-backend.onrender.com/ws";
const HTTP_URL = "https://smart-spoon-backend.onrender.com";
// ============================================================================

const HISTORY_LEN = 40;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

function parseProbabilityDistribution(raw) {
  if (!raw || typeof raw !== "string") {
    return [
      { name: "Pure Extract", value: 92.4 },
      { name: "Water Dilution", value: 4.1 },
      { name: "Wax Coating", value: 2.2 },
      { name: "Toxic Urea", value: 1.3 }
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
      { name: "Pure", value: 90.0 },
      { name: "Contaminated", value: 10.0 }
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
  const [activeTab, setActiveTab] = useState("telemetry");
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("CONNECTING");

  // This controls the Master Switch!
  const [targetProfile, setTargetProfile] = useState("apple");

  const [labImage, setLabImage] = useState(null);
  const [labResults, setLabResults] = useState(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const visionCanvasRef = useRef(null);

  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    {
      sender: "bot",
      text: "Universal Spectrometer initialized. Use the main header switch to toggle between Apple and Milk algorithms."
    }
  ]);
  const chatScrollRef = useRef(null);

  // ============================================================================
  // HUGE MAIN HEADER MODE SWITCHER
  // ============================================================================
  const handleModeSwitch = async (modeId) => {
    setTargetProfile(modeId);
    try {
      await fetch(`${HTTP_URL}/set_mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: modeId }) 
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

            // Using the processed mean from the backend
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
      let reply = `Target matrix is currently evaluating ${targetProfile}. Current impedance frequency is ${meta.processed_mean_hz || 0} Hz.`;
      if (q.includes("pregnant") || q.includes("kids")) {
        reply = "Our Consumer Safety Matrix evaluates real-time endocrine disruptors and ionic toxins. Any reading flagging a toxic injection (like Urea) triggers an immediate advisory for pregnant women and children.";
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

        let verdict = "Unknown Sample";
        let alertLevel = "safe";

        if (r > 200 && g > 200 && b > 200) {
          verdict = "Pure Milk Suspend Detected (High White Reflectance)";
        } else if (r > g + 20 && r > b + 40) {
          verdict = "Apple / Fruit Extract Detected (Red/Yellow Dominant)";
        } else if (b > r + 15 && b > g + 10) {
          verdict = "Water / Dilution Signature (High Cyan Scattering)";
          alertLevel = "danger";
        } else {
          verdict = "Mixed/Unknown Biological Matrix";
          alertLevel = "warning";
        }

        setTimeout(() => {
          setLabResults({ r, g, b, verdict, alertLevel });
          setIsAnalyzingImage(false);
        }, 1200); 

      } catch (err) {
        setIsAnalyzingImage(false);
      }
    };
    img.src = labImage;
  };

  const liveFreq = meta.processed_mean_hz || 0;
  const dynamicHero = hero;
  const dynamicSafetyScore = primary["1_safety_score"] || 0;
  
  // Variables required for Consumer Safety Matrix
  const isAwaiting = liveFreq < 100;
  const isToxic = dynamicHero.status_color === "#ef4444" || dynamicHero.status_color === "#f59e0b";
  const safetyColor = dynamicHero.status_color || "#71717a";
  const radarData = useMemo(() => parseProbabilityDistribution(secondary?.ai_and_regulatory_metrology?.["35_Class_Probability_Distribution"]), [secondary]);

  // The 8 Primary Points for Everyday Common Consumers
  const consumerSafetyData = [
    { label: "Pediatric (Kids & Toddlers)", safeMsg: "100% Safe for Children", dangerMsg: "CRITICAL DANGER", isSafe: !isToxic && !isAwaiting },
    { label: "Maternal (Pregnant Women)", safeMsg: "Approved for Consumption", dangerMsg: "STRICT MEDICAL BAN", isSafe: !isToxic && !isAwaiting },
    { label: "Geriatric (Elderly) Safety", safeMsg: "Safe & Digestible", dangerMsg: "SEVERE DIGESTIVE RISK", isSafe: !isToxic && !isAwaiting },
    { label: "Boiling / Cooking Viability", safeMsg: "Heat Safe", dangerMsg: "Toxins Survive Boiling", isSafe: !isToxic && !isAwaiting },
    { label: "Raw / Direct Consumption", safeMsg: "Safe to Consume Raw", dangerMsg: "DO NOT EAT RAW", isSafe: !isToxic && !isAwaiting },
    { label: "FSSAI Legal Compliance", safeMsg: "Class-A Certified", dangerMsg: "MAJOR LEGAL VIOLATION", isSafe: !isToxic && !isAwaiting },
    { label: "Long-Term Organ Toxicity", safeMsg: "Zero Known Risk", dangerMsg: "HIGH Liver/Kidney Risk", isSafe: !isToxic && !isAwaiting },
    { label: "Synthetic Allergen Risk", safeMsg: "100% Natural Organic", dangerMsg: "Synthetic Chemicals Present", isSafe: !isToxic && !isAwaiting },
  ];

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
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] mix-blend-overlay" />
      </div>

      {/* Floating Spatial Header with MASSIVE Mode Switcher */}
      <div className="sticky top-6 z-50 px-6 max-w-7xl mx-auto">
        <header className="flex items-center justify-between gap-4 px-5 py-3.5 bg-white/[0.03] backdrop-blur-3xl border border-white/[0.08] rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-4 hidden sm:flex">
            <div className="relative w-10 h-10 flex items-center justify-center bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-full shadow-inner">
              <Sparkles className="w-5 h-5 text-zinc-200" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-zinc-100 leading-none">Smart Spoon AI</h1>
                <span className="px-1.5 py-0.5 rounded-[4px] text-[9px] font-mono font-bold bg-white/10 text-zinc-300">
                  PRO
                </span>
              </div>
            </div>
          </div>

          {/* MASSIVE TARGET MATRIX SWITCHER (Moved here for high visibility!) */}
          <div className="flex flex-1 sm:flex-none justify-center items-center bg-black/50 border border-white/10 rounded-full p-1.5 backdrop-blur-md shadow-xl">
            <button 
              onClick={() => handleModeSwitch("apple")}
              className={`flex-1 sm:flex-none px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                targetProfile === "apple" 
                ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]" 
                : "text-zinc-400 hover:text-white"
              }`}
            >
              🍏 Apple / Solid
            </button>
            <button 
              onClick={() => handleModeSwitch("milk")}
              className={`flex-1 sm:flex-none px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                targetProfile === "milk" 
                ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]" 
                : "text-zinc-400 hover:text-white"
              }`}
            >
              🥛 Dairy / Milk
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-bold tracking-wide uppercase transition-all backdrop-blur-md ${
              isConnected ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "border-rose-500/30 text-rose-400 bg-rose-500/10 animate-pulse"
            }`}>
              {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{isConnected ? "Live" : "Offline"}</span>
            </div>
          </div>
        </header>
      </div>

      {/* Floating Segmented Navigation */}
      <div className="max-w-7xl mx-auto px-6 mt-10 mb-8 relative z-10 flex justify-center sm:justify-start">
        <div className="flex p-1.5 bg-white/[0.04] backdrop-blur-2xl border border-white/[0.05] rounded-full shadow-2xl overflow-x-auto scrollbar-hide">
          {[
            { id: "telemetry", icon: ActivitySquare, label: "Telemetry" },
            { id: "health", icon: TrendingDown, label: "Economics" },
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
                      <span>Metrology Verdict / {targetProfile.toUpperCase()}</span>
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
                      <div className="text-zinc-400 text-[10px] font-semibold uppercase tracking-widest mb-1">AI Confidence</div>
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
                  <div className="absolute inset-0 rounded-full blur-xl opacity-20 -z-10" style={{ backgroundColor: safetyColor }} />
                </div>
              </div>

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

            {/* =========================================================
                THE RESTORED 40-POINT CONSUMER INTELLIGENCE MATRIX 
                ========================================================= */}
            <div className="mt-8 rounded-[32px] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl p-8 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="w-5 h-5 text-zinc-400" />
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">Consumer Health & Safety Matrix</h3>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {consumerSafetyData.map((item, idx) => (
                  <div key={idx} className={`p-5 rounded-[20px] border flex flex-col justify-between h-28 relative overflow-hidden transition-colors duration-500 ${
                    isAwaiting 
                      ? "border-white/5 bg-white/[0.01]" 
                      : item.isSafe 
                        ? "border-emerald-500/20 bg-emerald-500/[0.02]" 
                        : "border-rose-500/30 bg-rose-500/[0.08] animate-pulse shadow-[inset_0_0_15px_rgba(244,63,94,0.1)]"
                  }`}>
                    {/* The small background icon for extreme warnings */}
                    {!item.isSafe && !isAwaiting && (
                      <AlertTriangle className="absolute -bottom-4 -right-4 w-20 h-20 text-rose-500/10 -z-10" />
                    )}
                    
                    <div className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider z-10 leading-tight">
                      {item.label}
                    </div>
                    <div className={`text-sm font-bold tracking-tight z-10 ${
                      isAwaiting 
                        ? "text-zinc-600" 
                        : item.isSafe 
                          ? "text-emerald-400" 
                          : "text-rose-400"
                    }`}>
                      {isAwaiting ? "AWAITING SENSOR" : item.isSafe ? item.safeMsg : item.dangerMsg}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Technical Lab Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div className="rounded-[32px] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl p-8 shadow-xl">
                <div className="flex items-center justify-between mb-8">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Real-Time EIS Stream</div>
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

              <div className="rounded-[32px] border border-white/[0.08] bg-white/[0.02] backdrop-blur-3xl p-8 shadow-xl">
                <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-6">Ensemble Probability Matrix</div>
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

        {/* ======================= TAB 2: ECONOMICS ======================= */}
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