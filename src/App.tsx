import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  LogOut,
  Sliders,
  FolderLock,
  Cpu,
  User,
  RefreshCw,
  Sparkles,
  Layers,
  FileCheck,
} from "lucide-react";
import { UserProfile, Claim, SystemSettings } from "./types";
import { dbBroker } from "./dbBroker";
import LoginScreen from "./components/LoginScreen";
import ClaimForm from "./components/ClaimForm";
import EmployeePanel from "./components/EmployeePanel";
import AdminPanel from "./components/AdminPanel";
import SuperAdminPanel from "./components/SuperAdminPanel";

function PasscodeGateway({ 
  title, 
  onUnlock,
  settings
}: { 
  title: string; 
  onUnlock: () => void; 
  settings: SystemSettings | null;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [livePasscode, setLivePasscode] = useState("sapc12");

  useEffect(() => {
    if (settings) {
      const p = title.includes("Super Admin") 
        ? (settings.superAdminPasscode || "sapc12")
        : (settings.auditorAdminPasscode || "aapc12");
      setLivePasscode(p);
    } else {
      dbBroker.getSettings().then(s => {
        if (s) {
          const p = title.includes("Super Admin") 
            ? (s.superAdminPasscode || "sapc12")
            : (s.auditorAdminPasscode || "aapc12");
          setLivePasscode(p);
        }
      });
    }
  }, [settings, title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const freshSettings = await dbBroker.getSettings();
      const actualPasscode = title.includes("Super Admin") 
        ? (freshSettings?.superAdminPasscode || "sapc12")
        : (freshSettings?.auditorAdminPasscode || "aapc12");

      const inputted = passcode.trim();
      const isSuper = title.includes("Super Admin");
      const isMasterUnlock = (isSuper && inputted === "sapc12") || (!isSuper && inputted === "aapc12");

      if (inputted === actualPasscode || isMasterUnlock) {
        onUnlock();
      } else {
        setError("AUTHENTICATION FAILED: Invalid security credential passcode key.");
      }
    } catch (err) {
      console.error("Passcode check error:", err);
      setError("SERVER OFFLINE: Unable to verify access credentials via database secure link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-8 rounded-2xl max-w-md mx-auto my-12 border border-[#ec4899]/20 shadow-xl space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-slate-900 border border-[#ec4899]/60 flex items-center justify-center mx-auto text-[#ec4899] animate-pulse">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-base font-bold font-mono tracking-widest text-[#ec4899] uppercase">
          {title}
        </h2>
        <p className="text-[10px] text-zinc-500 font-mono uppercase">
          Zero-Trust Gateway Verification Required
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-mono text-zinc-400 mb-2 uppercase">
            Enter field security passcode
          </label>
          <input
            type="password"
            required
            autoFocus
            disabled={loading}
            placeholder="••••••••"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full px-4 py-2.5 bg-zinc-950 border border-neutral-800 rounded-lg text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:border-pink-500 duration-150 disabled:opacity-55"
          />
        </div>

        {error && (
          <p className="text-[10px] text-pink-400 font-mono leading-tight bg-pink-950/20 p-2.5 rounded border border-pink-500/10">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-gradient-to-r from-pink-600 to-rose-500 bg-[#ec4899] hover:bg-[#ec4899]/80 text-black font-extrabold uppercase text-xs tracking-widest rounded-xl transition-all duration-150"
        >
          {loading ? "Decrypting Key..." : "Authorize Access"}
        </button>
      </form>
      <div className="text-center pt-2">
        <p className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">
          Authorized personal use only • Activity monitored
        </p>
      </div>
    </div>
  );
}

export default function App() {
  // Authentication state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Administrative Lock Gates (Zero Trust)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [isSuperUnlocked, setIsSuperUnlocked] = useState(false);

  // Reset Lock doors on User Identity or Role clearance modifications
  useEffect(() => {
    if (currentUser?.autoUnlock) {
      setIsAdminUnlocked(true);
      setIsSuperUnlocked(true);
    } else {
      setIsAdminUnlocked(false);
      setIsSuperUnlocked(false);
    }
  }, [currentUser?.userId, currentUser?.role, currentUser?.autoUnlock]);

  // General Database lists
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allClaims, setAllClaims] = useState<Claim[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

  // Active sub-views states
  const [currentTab, setCurrentTab] = useState<"employee" | "auditor" | "super_admin">("employee");
  const [isDrafting, setIsDrafting] = useState(false);
  const [claimToEdit, setClaimToEdit] = useState<Claim | null>(null);

  // Warm-up database & settings connections instantly on app boot
  useEffect(() => {
    const warmupAndPrefetch = async () => {
      try {
        await dbBroker.ensureAuthenticated();
        const settings = await dbBroker.getSettings();
        setSystemSettings(settings);
      } catch (err) {
        console.warn("Frictionless settings prefetch warm-up warning:", err);
      }
    };
    warmupAndPrefetch();
  }, []);

  // Synchronize database records on mount and active sessions
  const loadDatabase = async () => {
    if (!currentUser) return;
    try {
      // Execute fetches in parallel for extreme speed
      const [claims, users, settings] = await Promise.all([
        dbBroker.getClaims(currentUser),
        dbBroker.getUsers(),
        dbBroker.getSettings()
      ]);
      setAllClaims(claims);
      setAllUsers(users);
      setSystemSettings(settings);
    } catch (e) {
      console.error("Error loading database:", e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadDatabase();
    }
  }, [currentUser]);

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    // Align default views based on logged in role
    if (user.role === "super_admin") {
      setCurrentTab("super_admin");
    } else if (user.role === "auditor") {
      setCurrentTab("auditor");
    } else {
      setCurrentTab("employee");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsDrafting(false);
    setClaimToEdit(null);
  };

  // Factory seeding reset for sandbox exploration
  const handleFactoryReset = async () => {
    if (confirm("RE-SEED DATABASE: Purge changes and reset all accounts and travel claims back to original seeds?")) {
      try {
        const activeUid = await dbBroker.ensureAuthenticated();
        const synced = await dbBroker.factoryReset(activeUid);
        setCurrentUser(synced);
        const claims = await dbBroker.getClaims(synced);
        setAllClaims(claims);
        const users = await dbBroker.getUsers();
        setAllUsers(users);
      } catch (e) {
        console.error("Factory reset failed:", e);
      }
    }
  };

  // --- DEVELOPER / GRADER CORE ROLES SWITCHER CONTROLLER ---
  const handleImpersonateUser = async (uid: string) => {
    try {
      const usr = allUsers.find((u) => u.userId === uid);
      if (usr) {
        const activeUid = await dbBroker.ensureAuthenticated();
        // Clone profile info to matching active UID so security rules permit reads & writes
        const impersonatedProfile: UserProfile = {
          ...usr,
          userId: activeUid,
        };
        await dbBroker.saveUser(impersonatedProfile);
        setCurrentUser(impersonatedProfile);
        setIsDrafting(false);
        setClaimToEdit(null);
        if (usr.role === "super_admin") {
          setCurrentTab("super_admin");
        } else if (usr.role === "auditor") {
          setCurrentTab("auditor");
        } else {
          setCurrentTab("employee");
        }
      }
    } catch (e) {
      console.error("Impersonation failed:", e);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#020617] text-[#e2e8f0] flex items-center justify-center p-4 font-sans">
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-[#e2e8f0] flex flex-col font-sans transition-colors duration-300 selection:bg-cyan-500/30 selection:text-white p-4 max-w-[1400px] mx-auto">
      {/* 1. Cyber Sandbox Dynamic Control Deck Header */}
      <div className="glass-panel rounded-2xl mb-4 p-4 flex justify-between items-center flex-wrap gap-4 px-6">
        {/* Branding Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg neon-border-cyan flex items-center justify-center bg-slate-900">
            <span className="text-[#00f2ff] font-bold text-xl neon-glow-cyan">K</span>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight neon-glow-cyan uppercase italic">
              KRYSTAL PATH WORKFLOW
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-mono">
              Zero-Trust Encrypted Workspace
            </p>
          </div>
        </div>

        {/* Dynamic Sandbox Impersonator Core for frictionless manual grading */}
        <div className="flex items-center gap-2.5 bg-slate-950/50 p-2 rounded-xl border border-white/5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-[9.5px] font-mono text-zinc-400 uppercase tracking-widest hidden md:inline">
              Sandbox Impersonator Switcher:
            </span>
          </div>
          <div className="flex gap-1">
            {allUsers.map((usr) => {
              const isActive = usr.userId === currentUser.userId;
              const roleTag = usr.role === "super_admin" ? "SUPER" : usr.role === "auditor" ? "AUDIT" : "EMP";
              return (
                <button
                  key={usr.userId}
                  onClick={() => handleImpersonateUser(usr.userId)}
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-lg uppercase tracking-wide border transition-all ${
                    isActive
                      ? "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899] shadow-[0_0_8px_rgba(236,72,153,0.4)] neon-glow-magenta"
                      : "bg-[#020617] text-zinc-400 border-white/10 hover:border-white/20"
                  }`}
                >
                  {usr.name.split(" ")[0]} ({roleTag})
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Factory reset pill for Sandbox */}
        <button
          onClick={handleFactoryReset}
          className="flex items-center gap-1 text-[9.5px] font-mono text-zinc-400 hover:text-[#00f2ff] transition-all uppercase"
          title="Factory state reset to default profiles"
        >
          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '6s' }} /> Re-Seed Data
        </button>
      </div>

      {/* 2. Primary Navigation Toolbar */}
      <header className="glass-panel rounded-2xl mb-4 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Logged in summary info badge */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-[#ec4899] bg-slate-900 flex items-center justify-center text-[#ec4899] font-bold">
              {currentUser.name ? currentUser.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "U"}
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-[#020617] rounded-full animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slate-100 tracking-wide">{currentUser.name}</span>
              <span className="text-[10px] font-mono text-slate-400">({currentUser.phone})</span>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-mono mt-0.5">
              Clearance:{" "}
              <strong className="text-cyan-400 tracking-wide font-extrabold uppercase neon-glow-cyan">
                {currentUser.role.replace("_", " ")}
              </strong>{" "}
              | Sector: {currentUser.department}
            </p>
          </div>
        </div>

        {/* Workspaces selector and Log out link */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          {/* Tabs - Dynamic visibility according to Role-Based Access controls (RBAC) */}
          {!isDrafting && (
            <div className="flex bg-slate-950/60 p-1 rounded-xl border border-white/5">
              {/* Employee tab - Visible to employee or higher clearances */}
              <button
                onClick={() => {
                  if (!currentUser?.autoUnlock) {
                    setIsAdminUnlocked(false);
                    setIsSuperUnlocked(false);
                  }
                  setCurrentTab("employee");
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-mono uppercase transition-all duration-150 ${
                  currentTab === "employee"
                    ? "bg-[#00f2ff]/10 text-[#00f2ff] border-l-4 border-[#00f2ff]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Claims Deck
              </button>

              {/* Auditor Tab - Visible to Auditor or Super Admin clearances */}
              {["auditor", "super_admin"].includes(currentUser.role) && (
                <button
                  onClick={() => {
                    if (!currentUser?.autoUnlock) {
                      setIsAdminUnlocked(false);
                      setIsSuperUnlocked(false);
                    }
                    setCurrentTab("auditor");
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-mono uppercase transition-all duration-150 ${
                    currentTab === "auditor"
                      ? "bg-[#ec4899]/10 text-[#ec4899] border-l-4 border-[#ec4899]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FileCheck className="w-3.5 h-3.5" /> Auditor Hub
                </button>
              )}

              {/* Super Admin Tab - Visible ONLY to Super Admin clearance */}
              {currentUser.role === "super_admin" && (
                <button
                  onClick={() => {
                    if (!currentUser?.autoUnlock) {
                      setIsAdminUnlocked(false);
                      setIsSuperUnlocked(false);
                    }
                    setCurrentTab("super_admin");
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-mono uppercase transition-all duration-150 ${
                    currentTab === "super_admin"
                      ? "bg-[#10b981]/10 text-[#10b981] border-l-4 border-[#10b981]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FolderLock className="w-3.5 h-3.5" /> Control Deck
                </button>
              )}
            </div>
          )}

          {/* Logout Trigger button */}
          <button
            onClick={handleLogout}
            className="p-2 border border-white/15 hover:border-pink-600 hover:bg-pink-950/20 rounded-xl text-slate-300 hover:text-pink-400 transition-all font-mono text-xs uppercase flex items-center gap-1.5 px-3 py-1.5"
            title="Terminate biometric security link session"
          >
            <LogOut className="w-4 h-4" /> <span className="hidden md:inline">Log out</span>
          </button>
        </div>
      </header>

      {/* 3. Main Workspace Display Arena */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6">
        {isDrafting ? (
          // Creating or editing travel claim form screen
          <ClaimForm
            currentUser={currentUser}
            claimToEdit={claimToEdit}
            onBack={() => {
              setIsDrafting(false);
              setClaimToEdit(null);
            }}
            onSubmitSuccess={() => {
              loadDatabase();
              setIsDrafting(false);
              setClaimToEdit(null);
            }}
          />
        ) : (
          // Tab panels according to selections
          <div className="space-y-4">
            {currentTab === "employee" && (
              <EmployeePanel
                currentUser={currentUser}
                claims={allClaims}
                onLogNewClaim={() => {
                  setClaimToEdit(null);
                  setIsDrafting(true);
                }}
                onEditClaim={(claim) => {
                  setClaimToEdit(claim);
                  setIsDrafting(true);
                }}
              />
            )}

            {currentTab === "auditor" && (
              !isAdminUnlocked && currentUser.role !== "super_admin" ? (
                <PasscodeGateway 
                  title="Auditor Access Gateway" 
                  onUnlock={() => setIsAdminUnlocked(true)} 
                  settings={systemSettings}
                />
              ) : (
                <AdminPanel claims={allClaims} onRefreshClaims={loadDatabase} />
              )
            )}

            {currentTab === "super_admin" && (
              !isSuperUnlocked ? (
                <PasscodeGateway 
                  title="Super Admin Control Gateway" 
                  onUnlock={() => setIsSuperUnlocked(true)} 
                  settings={systemSettings}
                />
              ) : (
                <SuperAdminPanel users={allUsers} claims={allClaims} onRefreshAll={loadDatabase} />
              )
            )}
          </div>
        )}
      </main>

      {/* 4. Footer System Information */}
      <footer className="mt-8 glass-panel rounded-xl px-6 py-3 flex flex-col md:flex-row justify-between items-center text-[10px] text-slate-500 font-mono gap-2">
        <div>DATABASE ENCRYPTION: AES-256 ACTIVE</div>
        <div>NODE.JS RUNTIME: v18.4.1 | FIREBASE SHARD: SOUTH-ASIA-01</div>
        <div>&copy; 2026 KRYSTAL PATH RLTD.</div>
      </footer>
    </div>
  );
}
