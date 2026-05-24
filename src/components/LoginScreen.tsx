import React, { useState } from "react";
import { User, ShieldCheck, UserPlus, Cpu, AlertTriangle, Key } from "lucide-react";
import { UserProfile, UserRole } from "../types";
import { dbBroker } from "../dbBroker";

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState<UserProfile["department"]>("IT");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // States for the new Passcode Authenticator box
  const [simulatorPasscode, setSimulatorPasscode] = useState("");
  const [passcodeSuccess, setPasscodeSuccess] = useState<string | null>(null);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [verifyingPasscode, setVerifyingPasscode] = useState(false);

  // Live passcodes from database
  const [liveSuperCode, setLiveSuperCode] = useState("abc123");
  const [liveAuditCode, setLiveAuditCode] = useState("xyz123");
  const [liveSettings, setLiveSettings] = React.useState<any>(null);

  React.useEffect(() => {
    dbBroker.getSettings().then((s) => {
      if (s) {
        setLiveSettings(s);
        setLiveSuperCode(s.superAdminPasscode || "abc123");
        setLiveAuditCode(s.auditorAdminPasscode || "xyz123");
        const depts = s.departments || ["IT", "HR", "Operations", "Finance", "Marketing"];
        if (depts.length > 0) {
          setDepartment(depts[0] as any);
        }
      }
    }).catch(console.error);
  }, []);

  // Pre-configured elegant sandbox accounts for quick testing
  const sandboxAccounts = [
    { name: "Super Admin", department: "Operations" as const, role: "super_admin" as const, label: "Super Admin (Ops)" },
    { name: "Auditor Admin", department: "Finance" as const, role: "auditor" as const, label: "Auditor Admin (Finance)" },
    { name: "Employee", department: "IT" as const, role: "employee" as const, label: "Employee (IT)" },
  ];

  const handleEnterPortal = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2) {
      setError("INVALID INPUT: Please provide a valid employee full name.");
      return;
    }

    setIsLoading(true);

    setTimeout(async () => {
      try {
        const activeUid = await dbBroker.ensureAuthenticated();
        const existingUser = await dbBroker.findUserByNameAndDept(cleanName, department);

        if (existingUser) {
          const syncedUser: UserProfile = {
            ...existingUser,
            userId: activeUid,
            employeeId: employeeId.trim() || existingUser.employeeId || "",
          };
          await dbBroker.saveUser(syncedUser);
          setIsLoading(false);
          setStatusMessage(`Welcome back, ${syncedUser.name}! Session authorized.`);
          setTimeout(() => onLoginSuccess(syncedUser), 300);
        } else {
          const newProfile: UserProfile = {
            userId: activeUid,
            name: cleanName,
            phone: "+919876543210",
            role: "employee",
            department: department,
            employeeId: employeeId.trim(),
            createdAt: new Date().toISOString(),
          };

          await dbBroker.saveUser(newProfile);
          setIsLoading(false);
          setStatusMessage(`Created new employee profile for ${newProfile.name}! Entered portal.`);
          setTimeout(() => onLoginSuccess(newProfile), 300);
        }
      } catch (err: any) {
        setIsLoading(false);
        setError("PORTAL SERVICE ERROR: " + (err.message || String(err)));
      }
    }, 150);
  };

  const handleSandboxLogin = (sandbox: typeof sandboxAccounts[number]) => {
    setError(null);
    setIsLoading(true);
    setStatusMessage(`Entering sandbox environment as ${sandbox.name}...`);

    setTimeout(async () => {
      try {
        const activeUid = await dbBroker.ensureAuthenticated();

        const sandboxProfile: UserProfile = {
          userId: activeUid,
          name: sandbox.name,
          phone: "+919876543210",
          role: sandbox.role,
          department: sandbox.department,
          autoUnlock: false, // Enforce passcode challenge for administrative panels
          createdAt: sandbox.name === "Employee" ? "2026-05-14T10:00:00Z" : new Date().toISOString(),
        };

        await dbBroker.saveUser(sandboxProfile);
        setIsLoading(false);
        onLoginSuccess(sandboxProfile);
      } catch (err: any) {
        setIsLoading(false);
        setError("SANDBOX INGRESS ERROR: " + (err.message || String(err)));
      }
    }, 50);
  };

  const handlePasscodeSimulatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeError(null);
    setPasscodeSuccess(null);
    setVerifyingPasscode(true);

    const code = simulatorPasscode.trim();
    if (!code) {
      setPasscodeError("Passcode cannot be empty.");
      setVerifyingPasscode(false);
      return;
    }

    try {
      // Call the secure passport/passcode-login REST API!
      const res = await fetch("/api/auth/passcode-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Invalid administrator passcode key.");
      }

      const data = await res.json();
      if (data.token) {
        localStorage.setItem("krystal_auth_token", data.token);
      }

      setPasscodeSuccess(`SUCCESS: Authenticated as ${data.role}!`);
      
      const activeUid = await dbBroker.ensureAuthenticated();
      const profileName = data.role === "super_admin" ? "Super Admin" : "Auditor Admin";
      const dept = data.role === "super_admin" ? "Operations" : "Finance";

      const syncedProfile: UserProfile = {
        userId: activeUid,
        name: profileName,
        phone: "+919876543210",
        role: data.role as any,
        department: dept,
        autoUnlock: true, // Gate bypass unlocked automatically
        createdAt: new Date().toISOString(),
      };

      await dbBroker.saveUser(syncedProfile);
      
      setTimeout(() => {
        setVerifyingPasscode(false);
        onLoginSuccess(syncedProfile);
      }, 300);

    } catch (err: any) {
      setVerifyingPasscode(false);
      setPasscodeError(err.message || "Failed verifying passcode.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] p-4 font-sans text-gray-200">
      {/* Visual Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-widest leading-none text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-emerald-400 uppercase drop-shadow italic">
          KRYSTAL PATH
        </h1>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Cpu className="w-4 h-4 text-[#00f2ff] animate-spin" />
          <span className="text-xs font-mono text-[#00f2ff] tracking-widest uppercase">
            Tour Approval & Expense Logging Terminal
          </span>
        </div>
      </div>

      <div className="w-full max-w-md glass-panel rounded-2xl p-6 md:p-8 neon-border-cyan transition-all duration-300">
        <form onSubmit={handleEnterPortal} id="auth-form" className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-wider">
              Portal Access
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Enter your Name and company Department division to verify authorization
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-xs flex gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-3 bg-cyan-950/40 border border-cyan-500/40 rounded-lg text-xs flex gap-2 text-cyan-200 font-mono">
              <ShieldCheck className="w-4 h-4 shrink-0 text-cyan-400 animate-bounce" />
              <span>{statusMessage}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Name Input */}
            <div className="space-y-2">
              <label className="block text-xs font-mono text-cyan-300 uppercase">
                Employee Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-zinc-500" />
                </div>
                <input
                  type="text"
                  id="name-input"
                  required
                  placeholder="e.g. Anand Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-zinc-900 border border-neutral-750 rounded-lg text-white font-sans placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 transition-all text-sm"
                />
              </div>
            </div>

            {/* Employee ID Input */}
            <div className="space-y-2">
              <label className="block text-xs font-mono text-cyan-300 uppercase">
                Employee ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Cpu className="h-5 w-5 text-zinc-500" />
                </div>
                <input
                  type="text"
                  id="employee-id-input"
                  required
                  placeholder="e.g. EMP1042"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-zinc-900 border border-neutral-750 rounded-lg text-white font-sans placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 transition-all text-sm"
                />
              </div>
            </div>

            {/* Department Input */}
            <div className="space-y-2">
              <label className="block text-xs font-mono text-cyan-300 uppercase">
                Department Division
              </label>
              <select
                id="department-select"
                value={department}
                onChange={(e) => setDepartment(e.target.value as any)}
                className="block w-full px-3 py-3 bg-zinc-900 border border-neutral-750 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 transition-all text-sm font-semibold"
              >
                {(liveSettings?.departments || ["IT", "HR", "Operations", "Finance", "Marketing"]).map((dept: string) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            id="login-submit-button"
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-400 hover:from-cyan-500 hover:to-cyan-300 text-black font-extrabold uppercase tracking-widest rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 hover:scale-[1.01] active:scale-95 disabled:opacity-50 text-xs shadow-md shadow-cyan-920 flex justify-center items-center gap-2"
          >
            {isLoading ? (
              <>
                <Cpu className="w-4 h-4 animate-spin" />
                VERIFYING ACCESS...
              </>
            ) : (
              "ENTER SECURE PORTAL"
            )}
          </button>
        </form>
      </div>

      {/* Cyber Sandbox preseeded helper */}
      <div className="w-full max-w-md mt-6 p-5 glass-panel rounded-xl border border-white/5 space-y-4">
        <div className="text-center">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block font-bold">
            🛡️ SANDBOX SIMULATOR ACCESS
          </span>
          <p className="text-[10px] text-zinc-500 leading-normal">
            Click to bypass forms and instantly authorize pre-configured roles with bypassed gateways!
          </p>
        </div>
        
        <div className="grid grid-cols-1 gap-2">
          {sandboxAccounts.map((acc, idx) => (
            <button
              key={idx}
              onClick={() => handleSandboxLogin(acc)}
              type="button"
              disabled={isLoading || verifyingPasscode}
              className="flex justify-between items-center px-4 py-2.5 bg-slate-900/60 hover:bg-slate-900/95 border border-white/5 hover:border-[#00f2ff]/40 rounded-lg text-xs transition-all text-left disabled:opacity-50"
            >
              <div>
                <span className="font-semibold text-white block text-xs">{acc.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{acc.department} Dept</span>
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 bg-slate-950/80 text-[#ec4899] border border-[#ec4899]/30 rounded uppercase font-bold">
                {acc.label}
              </span>
            </button>
          ))}
        </div>

        {/* Passcode Entrance Simulator Box */}
        <div className="pt-4 border-t border-white/5 space-y-3">
          <div className="text-center">
            <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest block font-bold">
              🗝️ DIRECT PASSCODE AUTHENTICATOR
            </span>
            <p className="text-[9px] text-zinc-400 leading-normal font-sans">
              Test the administrator passcode login endpoint directly
            </p>
          </div>

          <form onSubmit={handlePasscodeSimulatorLogin} className="space-y-2">
            <div className="relative">
              <input
                type="password"
                required
                disabled={isLoading || verifyingPasscode}
                placeholder="Enter secure passcode"
                value={simulatorPasscode}
                onChange={(e) => setSimulatorPasscode(e.target.value)}
                className="block w-full px-3 py-2 bg-zinc-950 border border-neutral-800 rounded-lg text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-purple-400 transition-all text-xs text-center tracking-widest"
              />
            </div>

            {passcodeError && (
              <p className="text-[10.5px] text-pink-400 font-mono text-center leading-tight bg-pink-950/20 p-2 rounded border border-pink-500/10">
                {passcodeError}
              </p>
            )}
            {passcodeSuccess && (
              <p className="text-[10.5px] text-emerald-400 font-mono text-center leading-tight bg-emerald-950/20 p-2 rounded border border-emerald-500/10">
                {passcodeSuccess}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || verifyingPasscode}
              className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 text-black font-extrabold uppercase tracking-widest rounded-lg transition-all text-xs disabled:opacity-40 flex justify-center items-center gap-1.5"
            >
              {verifyingPasscode ? "VERIFYING PASSCODE..." : "VERIFY & LOG IN"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
