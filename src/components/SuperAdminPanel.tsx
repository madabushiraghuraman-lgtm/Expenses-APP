import React, { useState, useEffect } from "react";
import {
  Users,
  Settings,
  Database,
  Download,
  Plus,
  Trash2,
  Edit,
  ShieldCheck,
  Zap,
  Globe,
  Settings2,
  Sliders,
  CheckSquare,
  Square,
  RefreshCw,
} from "lucide-react";
import { UserProfile, Claim, SystemSettings, UserRole } from "../types";
import { dbBroker } from "../dbBroker";

interface SuperAdminPanelProps {
  users: UserProfile[];
  claims: Claim[];
  onRefreshAll: () => void;
}

export default function SuperAdminPanel({ users, claims, onRefreshAll }: SuperAdminPanelProps) {
  const [editingClaim, setEditingClaim] = useState<Claim | null>(null);
  const [currentSettings, setCurrentSettings] = useState<SystemSettings>({
    customCategories: ["Petrol", "Internet", "Stationery"],
    categoryRights: {
      Petrol: ["Sales", "Operations"],
      Internet: ["IT", "Operations"],
      Stationery: ["HR", "Finance", "Sales"],
    },
    nextSerial: 1,
    globalPasscode: "123456",
  });

  const [superAdminPasscodeVal, setSuperAdminPasscodeVal] = useState("sapc12");
  const [auditorAdminPasscodeVal, setAuditorAdminPasscodeVal] = useState("aapc12");
  const [passcodeSuccess, setPasscodeSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const s = await dbBroker.getSettings();
        if (s) {
          setCurrentSettings(s);
          setSuperAdminPasscodeVal(s.superAdminPasscode || "sapc12");
          setAuditorAdminPasscodeVal(s.auditorAdminPasscode || "aapc12");
          const depts = s.departments || ["IT", "HR", "Operations", "Finance", "Marketing"];
          setUserForm(prev => ({
            ...prev,
            department: prev.department && depts.includes(prev.department) ? prev.department : (depts[0] || "IT") as any
          }));
        }
      } catch (err) {
        console.error("Error reading system settings:", err);
      }
    };
    fetchSettings();
  }, [users]);

  const handleSavePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!superAdminPasscodeVal.trim() || !auditorAdminPasscodeVal.trim()) {
      alert("Passcodes cannot be empty.");
      return;
    }
    try {
      const updatedSettings: SystemSettings = {
        ...currentSettings,
        superAdminPasscode: superAdminPasscodeVal.trim(),
        auditorAdminPasscode: auditorAdminPasscodeVal.trim(),
      };
      await dbBroker.saveSettings(updatedSettings);
      setCurrentSettings(updatedSettings);
      setPasscodeSuccess(true);
      setTimeout(() => setPasscodeSuccess(false), 3000);
      onRefreshAll();
    } catch (err) {
      console.error("Save passcode failed:", err);
    }
  };

  // Custom Categories inputs
  const [newCategory, setNewCategory] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  // Department management inputs
  const [newDeptName, setNewDeptName] = useState("");

  // User management inputs
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    name: "",
    phone: "",
    role: "employee" as UserRole,
    department: "IT" as UserProfile["department"],
  });
  const [isAddingUser, setIsAddingUser] = useState(false);

  const departments = currentSettings.departments || [
    "IT",
    "HR",
    "Operations",
    "Finance",
    "Marketing",
  ];

  const handleSecAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newDeptName.trim();
    if (!cleanName) return;

    const existingDepts = currentSettings.departments || ["IT", "HR", "Operations", "Finance", "Marketing"];
    if (existingDepts.map(d => d.toLowerCase()).includes(cleanName.toLowerCase())) {
      alert("This department division already exists.");
      return;
    }

    try {
      const updatedDepts = [...existingDepts, cleanName];
      const updatedSettings: SystemSettings = {
        ...currentSettings,
        departments: updatedDepts,
      };
      await dbBroker.saveSettings(updatedSettings);
      setCurrentSettings(updatedSettings);
      setNewDeptName("");
      onRefreshAll();
    } catch (err) {
      console.error("Failed to add department:", err);
    }
  };

  const handleSecDeleteDept = async (deptToDelete: string) => {
    const existingDepts = currentSettings.departments || ["IT", "HR", "Operations", "Finance", "Marketing"];
    if (existingDepts.length <= 1) {
      alert("At least one department division is required for routing integrity.");
      return;
    }
    const updatedDepts = existingDepts.filter(d => d !== deptToDelete);
    
    // Also remove any custom category rights associated with this department for safety
    const updatedCategoryRights = { ...currentSettings.categoryRights };
    Object.keys(updatedCategoryRights).forEach(cat => {
      if (updatedCategoryRights[cat]) {
        updatedCategoryRights[cat] = updatedCategoryRights[cat].filter(d => d !== deptToDelete);
      }
    });

    try {
      const updatedSettings: SystemSettings = {
        ...currentSettings,
        departments: updatedDepts,
        categoryRights: updatedCategoryRights,
      };
      await dbBroker.saveSettings(updatedSettings);
      setCurrentSettings(updatedSettings);
      onRefreshAll();
    } catch (err) {
      console.error("Failed to delete department:", err);
    }
  };

  // --- USER CONTROLS ---
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name.trim() || !userForm.phone.trim()) {
      alert("Invalid employee credentials.");
      return;
    }

    try {
      const savedUser: UserProfile = {
        userId: editingUserId || `uid-${Date.now()}`,
        name: userForm.name.trim(),
        phone: userForm.phone.trim(),
        role: userForm.role,
        department: userForm.department,
        createdAt: new Date().toISOString(),
      };

      await dbBroker.saveUser(savedUser);
      setEditingUserId(null);
      setIsAddingUser(false);
      const defaultDept = (currentSettings.departments && currentSettings.departments[0]) || "IT";
      setUserForm({ name: "", phone: "", role: "employee", department: defaultDept as any });
      onRefreshAll();
    } catch (err) {
      console.error("Save user failed:", err);
    }
  };

  const handleEditUserInit = (usr: UserProfile) => {
    setEditingUserId(usr.userId);
    setIsAddingUser(true);
    setUserForm({
      name: usr.name,
      phone: usr.phone,
      role: usr.role,
      department: usr.department,
    });
  };

  const handleDeleteUser = async (uid: string) => {
    if (confirm("PURGE CLEARANCE: Are you absolutely sure you want to delete this account?")) {
      try {
        await dbBroker.deleteUser(uid);
        onRefreshAll();
      } catch (err) {
        console.error("Delete user failed:", err);
      }
    }
  };

  // --- CUSTOM EXPENSE VARIABLES ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const catName = newCategory.trim();
    if (!catName) return;

    if (currentSettings.customCategories.includes(catName)) {
      alert("Category variable already exist in the central database.");
      return;
    }

    try {
      const updatedSettings: SystemSettings = {
        ...currentSettings,
        customCategories: [...currentSettings.customCategories, catName],
        categoryRights: {
          ...currentSettings.categoryRights,
          [catName]: selectedDepts,
        },
      };

      await dbBroker.saveSettings(updatedSettings);
      setCurrentSettings(updatedSettings);
      setNewCategory("");
      setSelectedDepts([]);
      onRefreshAll();
    } catch (err) {
      console.error("Add category failed:", err);
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    if (confirm(`Remove custom variable [ ${catName} ] from forms?`)) {
      try {
        const filteredCats = currentSettings.customCategories.filter((c) => c !== catName);
        const updatedRights = { ...currentSettings.categoryRights };
        delete updatedRights[catName];

        const updatedSettings = {
          ...currentSettings,
          customCategories: filteredCats,
          categoryRights: updatedRights,
        };

        await dbBroker.saveSettings(updatedSettings);
        setCurrentSettings(updatedSettings);
        onRefreshAll();
      } catch (err) {
        console.error("Delete category failed:", err);
      }
    }
  };

  const toggleDeptForCategory = (dept: string) => {
    if (selectedDepts.includes(dept)) {
      setSelectedDepts(selectedDepts.filter((d) => d !== dept));
    } else {
      setSelectedDepts([...selectedDepts, dept]);
    }
  };

  // --- CLAIMS/TRANSACTION MANAGER CONTROLS ---
  const handleDeleteClaim = async (claimId: string) => {
    if (confirm(`PURGE LEDGER: Destroy and erase all transactions for claim ${claimId}?`)) {
      try {
        await dbBroker.deleteClaim(claimId);
        onRefreshAll();
      } catch (err) {
        console.error("Delete claim failed:", err);
      }
    }
  };

  // --- COMPLETE EXPORTS COMPILE SYSTEM ---
  const handleExportCsvAll = () => {
    let csv = "Claim Number,Employee Name,Phone,Department,Tour Start,Tour End,Advance Paid,Spend Total,Payout Net,Workflow Status,Bill Items Count,Created On\n";

    claims.forEach((c) => {
      const claimNo = `"${c.claimNumber}"`;
      const name = `"${c.employeeName.replace(/"/g, '""')}"`;
      const phone = `"${c.employeePhone}"`;
      const dept = `"${c.department}"`;
      const start = `"${c.tourStartDate}"`;
      const end = `"${c.tourEndDate}"`;
      const adv = c.advanceAmount.toFixed(2);
      const spent = c.totalExpenseAmount.toFixed(2);
      const payout = c.finalBalance.toFixed(2);
      const status = `"${c.status}"`;
      const count = c.lineItems.length;
      const created = `"${new Date(c.createdAt).toLocaleDateString()}"`;

      csv += `${claimNo},${name},${phone},${dept},${start},${end},${adv},${spent},${payout},${status},${count},${created}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `KRPL_ALL_TRANSACTIONS_${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full space-y-6">
      {/* Title Header area */}
      <div className="glass-panel p-5 rounded-2xl shadow-md flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-widest text-[#10b981] drop-shadow neon-glow-green italic">
            Super Admin Matrix Hub
          </h2>
          <p className="text-[10px] text-zinc-400 font-mono mt-0.5 uppercase font-semibold">
            Central Control Panel: Account management, core variables adjustments, database imports & CSV exports
          </p>
        </div>

        <button
          onClick={handleExportCsvAll}
          className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-black font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow shadow-emerald-950 flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> Export All Transactions to Excel/CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* User Accounts Management (Left md:8) */}
        <div className="lg:col-span-8 glass-panel p-5 rounded-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-white/10 pb-2 flex-wrap gap-2">
            <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-1.5 font-bold">
              <Users className="w-4 h-4 text-cyan-400" /> User accounts directory ({users.length} active)
            </h3>
            <button
              onClick={() => {
                setEditingUserId(null);
                const defaultDept = (currentSettings.departments && currentSettings.departments[0]) || "IT";
                setUserForm({ name: "", phone: "", role: "employee", department: defaultDept as any });
                setIsAddingUser(!isAddingUser);
              }}
              className="px-3 py-1 bg-slate-900 hover:bg-slate-850 hover:border-cyan-400/40 border border-white/10 text-[10px] font-mono uppercase text-[#00f2ff] rounded transition-all font-bold"
            >
              {isAddingUser ? "Close Register" : "+ New Profile"}
            </button>
          </div>

          {/* User Create/Edit Form overlay */}
          {isAddingUser && (
            <form onSubmit={handleSaveUser} className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-4">
              <span className="text-[10px] font-mono text-pink-400 uppercase block tracking-wider font-semibold">
                {editingUserId ? "Modify Account Privileges" : "Provision New Identity"}
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Anand Sharma, Priya Sharma"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-neutral-700 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                    Mobile Matrix Link (Primary Auth Phone)
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +919876543210, +919876543212"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-neutral-700 rounded text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">Company department Role</label>
                  <select
                    value={userForm.department}
                    onChange={(e) => setUserForm({ ...userForm, department: e.target.value as any })}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-neutral-700 rounded text-white"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">Clearance Tier</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-neutral-700 rounded text-white font-mono text-cyan-300"
                  >
                    <option value="employee">Employee (Operational)</option>
                    <option value="auditor">Auditor Admin (Validation)</option>
                    <option value="super_admin">Super Admin (Central)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="px-4 py-1.5 text-xs font-mono text-gray-500 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold uppercase text-[10px] tracking-wide rounded transition-all"
                >
                  Save Profile Settings
                </button>
              </div>
            </form>
          )}

          {/* User Directory Table layout */}
          <div className="overflow-x-auto rounded-xl border border-zinc-900">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-950/80 text-zinc-500 font-mono">
                  <th className="p-3">Identity Name</th>
                  <th className="p-3">Verification Link (Phone)</th>
                  <th className="p-3">Division</th>
                  <th className="p-3">Clearance Level</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {users.map((u) => (
                  <tr key={u.userId} className="hover:bg-zinc-900/30 text-zinc-300">
                    <td className="p-3 font-semibold text-white">{u.name}</td>
                    <td className="p-3 font-mono">{u.phone}</td>
                    <td className="p-3">{u.department}</td>
                    <td className="p-3">
                      <span
                        className={`font-mono text-[10px] uppercase font-bold py-0.5 px-2 rounded-full border ${
                          u.role === "super_admin"
                            ? "text-purple-400 bg-purple-950/20 border-purple-800/40"
                            : u.role === "auditor"
                            ? "text-pink-400 bg-pink-950/20 border-pink-800/40"
                            : "text-cyan-400 bg-cyan-950/20 border-cyan-800/40"
                        }`}
                      >
                        {u.role === "super_admin" ? "SUPER" : u.role === "auditor" ? "AUDITOR" : "EMPLOYEE"}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1.5">
                      <button
                        onClick={() => handleEditUserInit(u)}
                        className="text-zinc-500 hover:text-cyan-400 p-1.5 rounded hover:bg-zinc-900/50 transition-all inline-block"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.userId)}
                        className="text-zinc-500 hover:text-pink-400 p-1.5 rounded hover:bg-zinc-900/50 transition-all inline-block"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dynamic Category Modifiers (Right md:4) */}
        <div className="lg:col-span-4 glass-panel p-5 rounded-2xl space-y-6">
          <div>
            <h3 className="text-xs font-mono text-pink-400 font-bold uppercase tracking-widest border-b border-white/10 pb-2 flex items-center gap-1.5 neon-glow-magenta">
              <Sliders className="w-4 h-4 text-[#ec4899]" /> Dynamic form Categories
            </h3>
            <p className="text-[10px] text-zinc-400 mt-1">
              Add extra customized variable categories and configure department security rights.
            </p>
          </div>

          <form onSubmit={handleAddCategory} className="space-y-4 bg-zinc-900/30 p-4 rounded-xl border border-zinc-900">
            <div>
              <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                New Custom Category Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Petrol, Internet, Stationery"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-neutral-700 rounded text-white uppercase font-mono tracking-wider focus:outline-none focus:border-pink-400"
              />
            </div>

            <div>
              <span className="block text-[10px] font-mono text-zinc-400 uppercase mb-2">
                Department Access Permission Rights:
              </span>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400">
                {departments.map((dept) => {
                  const hasRights = selectedDepts.includes(dept);
                  return (
                    <button
                      type="button"
                      key={dept}
                      onClick={() => toggleDeptForCategory(dept)}
                      className={`flex items-center gap-1.5 p-1.5 rounded border text-left transition-all ${
                        hasRights
                          ? "bg-pink-950/20 text-pink-400 border-pink-500/30"
                          : "bg-zinc-950 border-transparent hover:border-zinc-850"
                      }`}
                    >
                      {hasRights ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span>{dept}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-pink-600 hover:bg-pink-500 text-black font-extrabold uppercase text-[10px] tracking-widest rounded-lg transition-all"
            >
              Configure Variable Access
            </button>
          </form>

          {/* List current custom categories */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase block tracking-wider">
              Live Custom Categories ({currentSettings.customCategories.length} Configured)
            </span>

            <div className="space-y-1.5 max-h-[25vh] overflow-y-auto pr-1">
              {currentSettings.customCategories.map((cat) => {
                const depts = currentSettings.categoryRights[cat] || [];
                return (
                  <div
                    key={cat}
                    className="flex justify-between items-center text-xs p-2.5 rounded bg-zinc-900 border border-zinc-950 hover:border-zinc-850"
                  >
                    <div>
                      <strong className="font-mono text-white block uppercase tracking-wide">{cat}</strong>
                      <span className="text-[9px] text-zinc-400 block truncate max-w-[200px]">
                        Allowed Depts: {depts.join(", ") || "None"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-zinc-500 hover:text-pink-400 p-1.5 hover:bg-zinc-950 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dynamic Department Manager Card */}
          <div className="border-t border-white/5 pt-6 space-y-4">
            <div>
              <h3 className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-widest border-b border-white/10 pb-2 flex items-center gap-1.5 neon-glow-green">
                <Globe className="w-4 h-4 text-emerald-400" /> Dynamic Department Manager
              </h3>
              <p className="text-[10px] text-zinc-400 mt-1">
                Add extra departments or purge them dynamically to update user forms, categorization, and login panels instantly.
              </p>
            </div>

            <form onSubmit={handleSecAddDept} className="space-y-4 bg-zinc-900/30 p-4 rounded-xl border border-zinc-900">
              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  New Department Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sales, Logistics"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-neutral-700 rounded text-white tracking-wider focus:outline-none focus:border-emerald-400 uppercase font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-black font-extrabold uppercase text-[10px] tracking-widest rounded-lg transition-all"
              >
                Add Corporate Department
              </button>
            </form>

            <div className="space-y-1.5 max-h-[25vh] overflow-y-auto pr-1">
              {departments.map((dept) => (
                <div
                  key={dept}
                  className="flex justify-between items-center text-xs p-2.5 rounded bg-zinc-900 border border-zinc-950 hover:border-zinc-850"
                >
                  <span className="font-mono text-white block uppercase tracking-wide">{dept}</span>
                  <button
                    onClick={() => handleSecDeleteDept(dept)}
                    className="text-zinc-500 hover:text-pink-400 p-1.5 hover:bg-zinc-950 rounded transition-all"
                    title={`Delete department ${dept}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Customized Gateway Passcodes Card */}
          <div className="border-t border-white/5 pt-6 space-y-4">
            <div>
              <h3 className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-widest border-b border-white/10 pb-2 flex items-center gap-1.5 neon-glow-cyan">
                <Settings2 className="w-4 h-4 text-[#00f2ff]" /> Gateway Access Passcodes
              </h3>
              <p className="text-[10px] text-zinc-400 mt-1">
                Configure the gateways used to prevent unauthorized entries into administrative decks.
              </p>
            </div>

            <form onSubmit={handleSavePasscode} className="space-y-4 bg-zinc-900/30 p-4 rounded-xl border border-zinc-900">
              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Super Admin Passcode
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter new Super Admin passcode"
                  value={superAdminPasscodeVal}
                  onChange={(e) => setSuperAdminPasscodeVal(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-neutral-700 rounded text-white font-mono tracking-wider focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Auditor Admin Passcode
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter new Auditor Admin passcode"
                  value={auditorAdminPasscodeVal}
                  onChange={(e) => setAuditorAdminPasscodeVal(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-neutral-700 rounded text-white font-mono tracking-wider focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-500 hover:from-cyan-500 hover:to-blue-400 text-black font-extrabold uppercase text-[10px] tracking-widest rounded-lg transition-all"
              >
                Save Settings Passcodes
              </button>

              {passcodeSuccess && (
                <div className="text-[10px] font-mono text-emerald-400 text-center animate-pulse">
                  ✓ ADMINISTRATIVE GATEWAYS UPDATED IN FIREBASE
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Transaction Claims Database Management (Purge control center) */}
      <div className="glass-panel p-5 rounded-2xl space-y-4">
        <h3 className="text-xs font-mono text-[#00f2ff] font-bold uppercase tracking-widest flex items-center gap-1.5 border-b border-white/10 pb-2 neon-glow-cyan">
          <Database className="w-4 h-4 text-[#00f2ff]" /> Overarching Transactional Database Controller
        </h3>

        <div className="overflow-x-auto rounded-xl border border-zinc-900">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-950/80 text-zinc-500 font-mono">
                <th className="p-3">Claim Serial No</th>
                <th className="p-3">Employee Name</th>
                <th className="p-3">Department</th>
                <th className="p-3">Advance paid</th>
                <th className="p-3">Spend Accumulation</th>
                <th className="p-3">Workflow State</th>
                <th className="p-3 text-right">Database Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {claims.map((c) => (
                <tr key={c.claimNumber} className="hover:bg-zinc-900/30 text-zinc-300">
                  <td className="p-3 font-mono font-bold tracking-wider text-cyan-300">{c.claimNumber}</td>
                  <td className="p-3">{c.employeeName}</td>
                  <td className="p-3">{c.department}</td>
                  <td className="p-3 font-mono">₹{c.advanceAmount.toFixed(2)}</td>
                  <td className="p-3 font-mono text-white font-semibold">₹{c.totalExpenseAmount.toFixed(2)}</td>
                  <td className="p-3">
                    <span className="font-mono text-[9px] uppercase font-bold py-0.5 px-2 bg-zinc-900 border border-zinc-800 rounded">
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-1.5">
                    <button
                      onClick={() => setEditingClaim(c)}
                      className="text-zinc-[#00f2ff] hover:text-[#00f2ff]/80 p-1.5 rounded hover:bg-zinc-900/50 transition-all inline-flex items-center gap-1 text-[10px] font-mono uppercase"
                    >
                      <Edit className="w-3.5 h-3.5" /> Modify/Reset
                    </button>
                    <button
                      onClick={() => handleDeleteClaim(c.claimNumber)}
                      className="text-zinc-600 hover:text-pink-400 p-1.5 rounded hover:bg-zinc-900/50 transition-all inline-flex items-center gap-1 text-[10px] font-mono uppercase"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Purge row
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingClaim && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel p-6 rounded-2xl w-full max-w-lg border border-[#00f2ff]/30 shadow-2xl relative space-y-4 bg-zinc-950/95">
            <div className="flex justify-between items-start border-b border-white/10 pb-2">
              <div>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-cyan-950/40 text-cyan-400 border border-cyan-800/20 rounded uppercase tracking-wider block w-max font-bold">
                  SUPER MASTER OVERRIDE SYSTEM
                </span>
                <h3 className="text-sm font-bold text-white uppercase mt-1.5 font-mono">
                  Modify Claim {editingClaim.claimNumber}
                </h3>
              </div>
              <button
                onClick={() => setEditingClaim(null)}
                className="text-zinc-500 hover:text-white font-mono text-xs transition-colors"
              >
                [Esc / Close]
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Employee Owner</label>
                  <input
                    type="text"
                    disabled
                    value={editingClaim.employeeName}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-neutral-800 rounded text-zinc-500 font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Department</label>
                  <input
                    type="text"
                    disabled
                    value={editingClaim.department}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-neutral-800 rounded text-zinc-500 font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-300 uppercase mb-1.5 font-bold">Workflow State (Override)</label>
                <select
                  value={editingClaim.status}
                  onChange={(e) => setEditingClaim({ ...editingClaim, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-neutral-700 rounded text-[#00f2ff] font-mono uppercase font-bold focus:outline-none focus:border-[#ec4899]"
                >
                  <option value="Draft">Draft (Editable by Employee)</option>
                  <option value="Pending">Pending (Awaiting Audit Review)</option>
                  <option value="Resubmitted">Resubmitted (Awaiting Audit Review)</option>
                  <option value="Approved">Approved (Locked / Signed-off)</option>
                  <option value="Rejected">Rejected (Declined / Corrective Action)</option>
                </select>
                <p className="text-[10px] text-zinc-400 mt-1.5 leading-normal uppercase text-zinc-500 font-mono text-[9px]">
                  * Reselecting "Draft" unlocks edit mode on the employee side, enabling them to alter or submit fresh records!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                    Advance Amount (INR)
                  </label>
                  <input
                    type="number"
                    value={editingClaim.advanceAmount}
                    onChange={(e) => {
                      const adv = parseFloat(e.target.value) || 0;
                      setEditingClaim({
                        ...editingClaim,
                        advanceAmount: adv,
                        finalBalance: editingClaim.totalExpenseAmount - adv
                      });
                    }}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-neutral-700 rounded text-white font-mono focus:outline-none focus:border-[#ec4899]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                    Total Expense Cumulative (INR)
                  </label>
                  <input
                    type="number"
                    value={editingClaim.totalExpenseAmount}
                    onChange={(e) => {
                      const exp = parseFloat(e.target.value) || 0;
                      setEditingClaim({
                        ...editingClaim,
                        totalExpenseAmount: exp,
                        finalBalance: exp - editingClaim.advanceAmount
                      });
                    }}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-neutral-700 rounded text-white font-mono focus:outline-none focus:border-[#ec4899]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Tour general Overview Synopsis (Narration)
                </label>
                <textarea
                  rows={2}
                  value={editingClaim.narration}
                  onChange={(e) => setEditingClaim({ ...editingClaim, narration: e.target.value })}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-[#ec4899]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingClaim(null)}
                  className="px-4 py-2 text-[10px] text-neutral-400 hover:text-white uppercase font-mono tracking-widest font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await dbBroker.saveClaim(editingClaim);
                      setEditingClaim(null);
                      onRefreshAll();
                    } catch (err) {
                      console.error("Super Admin modify claim override failed:", err);
                    }
                  }}
                  className="px-6 py-2 bg-[#00f2ff] hover:bg-[#00f2ff]/80 text-black font-extrabold uppercase tracking-wider rounded text-[10px] transition-all font-mono"
                >
                  Transmit Override
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
