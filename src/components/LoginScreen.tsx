import React, { useState } from "react";
import { User, ShieldCheck, UserPlus, Cpu, AlertTriangle, Key, MapPin, Phone, Award, ArrowRight, ArrowLeft } from "lucide-react";
import { UserProfile, UserRole } from "../types";
import { dbBroker } from "../dbBroker";

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [name, setName] = useState(() => localStorage.getItem("krystal_last_name") || "");
  const [employeeId, setEmployeeId] = useState(() => localStorage.getItem("krystal_last_employee_id") || "");
  const [department, setDepartment] = useState<UserProfile["department"]>(() => (localStorage.getItem("krystal_last_department") as any) || "IT");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Guided wizard states for first-time login onboarding
  const [isRegistering, setIsRegistering] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [registeredData, setRegisteredData] = useState({
    name: "",
    employeeId: "",
    department: "IT",
    designation: "",
    phone: "",
    officeLocation: "",
  });

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
        const storedDept = localStorage.getItem("krystal_last_department");
        if (!storedDept && depts.length > 0) {
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
          
          // Save details to localStorage to pre-populate next time!
          localStorage.setItem("krystal_last_name", syncedUser.name);
          localStorage.setItem("krystal_last_employee_id", syncedUser.employeeId || "");
          localStorage.setItem("krystal_last_department", syncedUser.department);
          if (syncedUser.designation) {
            localStorage.setItem("krystal_last_designation", syncedUser.designation);
          }

          setIsLoading(false);
          setStatusMessage(`Welcome back, ${syncedUser.name}! Session authorized.`);
          setTimeout(() => onLoginSuccess(syncedUser), 300);
        } else {
          // Trigger onboarding wizard
          setIsLoading(false);
          setRegisteredData({
            name: cleanName,
            employeeId: employeeId.trim(),
            department: department,
            designation: localStorage.getItem("krystal_last_designation") || "System Associate",
            phone: "+919876543210",
            officeLocation: "Mumbai Hub",
          });
          setWizardStep(1);
          setIsRegistering(true);
        }
      } catch (err: any) {
        setIsLoading(false);
        setError("PORTAL SERVICE ERROR: " + (err.message || String(err)));
      }
    }, 150);
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!registeredData.designation.trim()) {
      setError("Please specify a valid corporate designation.");
      setIsLoading(false);
      return;
    }
    if (!registeredData.employeeId.trim()) {
      setError("An employee ID number is required.");
      setIsLoading(false);
      return;
    }

    try {
      const activeUid = await dbBroker.ensureAuthenticated();
      const newProfile: UserProfile = {
        userId: activeUid,
        name: registeredData.name,
        phone: registeredData.phone,
        role: "employee",
        department: registeredData.department,
        employeeId: registeredData.employeeId.trim(),
        designation: registeredData.designation.trim(),
        officeLocation: registeredData.officeLocation.trim(),
        createdAt: new Date().toISOString(),
      };

      await dbBroker.saveUser(newProfile);

      // Save local storage
      localStorage.setItem("krystal_last_name", newProfile.name);
      localStorage.setItem("krystal_last_employee_id", newProfile.employeeId || "");
      localStorage.setItem("krystal_last_department", newProfile.department);
      if (newProfile.designation) {
        localStorage.setItem("krystal_last_designation", newProfile.designation);
      }

      setIsLoading(false);
      setIsRegistering(false);
      setStatusMessage(`Onboarding complete! Authenticated as ${newProfile.name}.`);
      setTimeout(() => onLoginSuccess(newProfile), 300);
    } catch (err: any) {
      setIsLoading(false);
      setError("REGISTRATION PERSISTENCE ERROR: " + (err.message || String(err)));
    }
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
          designation: sandbox.role === "employee" ? "Senior Integration Specialist" : "Operations Lead Assess",
          officeLocation: "Bangalore HQ",
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
        designation: data.role === "super_admin" ? "Chief Overseer Agent" : "Lead Compliance Assessor",
        officeLocation: "Corporate Hub",
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

      {isRegistering ? (
        <div id="registration-wizard-card" className="w-full max-w-md glass-panel rounded-2xl p-6 md:p-8 neon-border-cyan transition-all duration-300">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cyan-950/40 border border-[#00f2ff]/30 text-[#00f2ff] mb-2 animate-pulse">
              <UserPlus className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold uppercase tracking-widest text-[#00f2ff]">
              Guided Onboarding
            </h2>
            <p className="text-[10px] text-zinc-400 font-mono mt-1 uppercase">
              Step {wizardStep} of 3: Essential Profile Assembly
            </p>
            
            {/* Progress bar */}
            <div className="w-full bg-zinc-900 h-1.5 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="bg-gradient-to-r from-cyan-500 to-pink-500 h-full transition-all duration-300"
                style={{ width: `${(wizardStep / 3) * 100}%` }}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 mb-4 bg-red-950/40 border border-red-500/40 rounded-lg text-xs flex gap-2 text-red-400 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={wizardStep === 3 ? handleCompleteRegistration : (e) => { e.preventDefault(); setWizardStep(prev => prev + 1); }} className="space-y-5">
            {wizardStep === 1 && (
              <div className="space-y-4 animate-in slide-in-from-right-3 duration-250">
                <div className="p-3 bg-cyan-950/10 border border-cyan-800/10 rounded-lg">
                  <span className="text-[10px] font-mono text-cyan-400 block uppercase font-bold mb-1">Onboarding Name</span>
                  <span className="text-sm text-white font-semibold">{registeredData.name}</span>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-cyan-300 uppercase">
                    Corporate Designation / Role
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Award className="h-5 w-5 text-zinc-500" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Senior Associate, General Manager"
                      value={registeredData.designation}
                      onChange={(e) => setRegisteredData({ ...registeredData, designation: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 bg-zinc-900 border border-neutral-750 rounded-lg text-white font-sans placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 transition-all text-sm font-semibold"
                    />
                  </div>
                  <p className="text-[9px] text-zinc-500 font-mono leading-tight uppercase">
                    * Saved inside database to auto-populate designation for every travel claim draft!
                  </p>
                </div>

                {/* Instant suggested designations helical pills */}
                <div>
                  <span className="text-[9px] font-mono text-zinc-500 block uppercase mb-1.5 font-bold">Recommended Matches:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["System Analyst", "Managing Consultant", "Operations Executive", "Finance Manager", "Strategic Specialist"].map(p => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setRegisteredData({ ...registeredData, designation: p })}
                        className="text-[9.5px] px-2 py-1 bg-zinc-900 hover:bg-cyan-950/20 text-zinc-400 hover:text-cyan-300 border border-zinc-850 hover:border-cyan-800/40 rounded transition-all font-mono uppercase"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4 animate-in slide-in-from-right-3 duration-250">
                <div className="space-y-2">
                  <label className="block text-xs font-mono text-cyan-300 uppercase">
                    Employee ID Number
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Cpu className="h-5 w-5 text-zinc-500" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. EMP1042"
                      value={registeredData.employeeId}
                      onChange={(e) => setRegisteredData({ ...registeredData, employeeId: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 bg-zinc-900 border border-neutral-750 rounded-lg text-white font-mono placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 transition-all text-sm uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-cyan-300 uppercase">
                    Assigned Corporate Division
                  </label>
                  <select
                    value={registeredData.department}
                    onChange={(e) => setRegisteredData({ ...registeredData, department: e.target.value })}
                    className="block w-full px-3 py-3 bg-zinc-900 border border-neutral-750 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 transition-all text-sm font-semibold"
                  >
                    {(liveSettings?.departments || ["IT", "HR", "Operations", "Finance", "Marketing"]).map((dept: string) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  <p className="text-[9px] text-zinc-500 font-mono uppercase leading-tight">
                    Ensures correct accounting classification mapping.
                  </p>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4 animate-in slide-in-from-right-3 duration-250">
                <div className="space-y-2">
                  <label className="block text-xs font-mono text-cyan-300 uppercase">
                    Corporate Phone Number
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-zinc-500" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. +91 98765 43210"
                      value={registeredData.phone}
                      onChange={(e) => setRegisteredData({ ...registeredData, phone: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 bg-zinc-900 border border-neutral-750 rounded-lg text-white font-sans placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 transition-all text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-cyan-300 uppercase">
                    Base Office Location Hub
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <MapPin className="h-5 w-5 text-zinc-500" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mumbai HQ, Delhi Branch, Bangalore"
                      value={registeredData.officeLocation}
                      onChange={(e) => setRegisteredData({ ...registeredData, officeLocation: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 bg-zinc-900 border border-neutral-750 rounded-lg text-white font-sans placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 transition-all text-sm font-semibold"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-2 justify-between pt-4 border-t border-white/5 animate-in fade-in">
              {wizardStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep(prev => prev - 1)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-mono text-xs uppercase tracking-wider rounded-lg transition-all flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="px-4 py-2 text-zinc-500 hover:text-zinc-300 font-mono text-xs uppercase tracking-wider transition-all"
                >
                  Back to login
                </button>
              )}

              {wizardStep < 3 ? (
                <button
                  type="submit"
                  className="px-6 py-2 bg-zinc-800 hover:bg-zinc-750 border border-cyan-500/20 hover:border-cyan-500 text-cyan-400 font-mono text-xs uppercase tracking-wider rounded-lg transition-all flex items-center gap-1"
                >
                  Next <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-black font-extrabold font-mono text-xs uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 shadow shadow-emerald-950"
                >
                  {isLoading ? "Provisioning..." : "Complete & Login ↗"}
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
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
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-400 hover:from-cyan-500 hover:to-cyan-300 text-black font-extrabold uppercase tracking-widest rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 hover:scale-[1.01] active:scale-95 disabled:opacity-50 text-xs shadow-md shadow-cyan-920 flex justify-center items-center gap-2 animate-in fade-in"
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
      )}

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
