import React, { useState, useEffect } from "react";
import {
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  FileCheck,
  AlertTriangle,
  UploadCloud,
  File,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { Claim, ExpenseLineItem, UserProfile, SystemSettings } from "../types";
import { dbBroker } from "../dbBroker";
import { getRelativeProofUrl } from "../utils";

interface ClaimFormProps {
  currentUser: UserProfile;
  claimToEdit?: Claim | null;
  onBack: () => void;
  onSubmitSuccess: () => void;
}

export default function ClaimForm({
  currentUser,
  claimToEdit,
  onBack,
  onSubmitSuccess,
}: ClaimFormProps) {
  // Load global system settings to filter custom categories
  const [settings, setSettings] = useState<SystemSettings>({
    customCategories: ["Petrol", "Internet", "Stationery"],
    categoryRights: {
      Petrol: ["Marketing", "Operations"],
      Internet: ["IT", "Operations"],
      Stationery: ["HR", "Finance", "Marketing"],
    },
    nextSerial: 1,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const s = await dbBroker.getSettings();
        if (s) setSettings(s);
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();
  }, []);

  // Basic Form Fields
  const [tourStartDate, setTourStartDate] = useState("");
  const [tourEndDate, setTourEndDate] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [designation, setDesignation] = useState(currentUser.designation || "");
  const [narration, setNarration] = useState("");

  // Line-by-line expenses list
  const [lineItems, setLineItems] = useState<ExpenseLineItem[]>([]);

  // Add line-item temporary fields
  const [itemCategory, setItemCategory] = useState("Food");
  const [itemExpenseDate, setItemExpenseDate] = useState("");
  const [itemAmount, setItemAmount] = useState<number>(0);
  const [itemNarration, setItemNarration] = useState("");
  const [itemProofUrl, setItemProofUrl] = useState("");
  const [itemProofName, setItemProofName] = useState("");

  // File Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Load existing data if edit mode (e.g. resubmitting a rejected claim)
  useEffect(() => {
    if (claimToEdit) {
      setTourStartDate(claimToEdit.tourStartDate);
      setTourEndDate(claimToEdit.tourEndDate);
      setAdvanceAmount(claimToEdit.advanceAmount);
      setDesignation(claimToEdit.designation);
      setNarration(claimToEdit.narration);
      setLineItems(claimToEdit.lineItems);
    } else {
      setDesignation(currentUser.designation || "");
    }
  }, [claimToEdit, currentUser]);

  // Determine authorized categories for claimant department
  const getVisibleCategories = () => {
    const baseCategories = ["Food", "Travel", "Hotel", "Others"];
    const custom = settings.customCategories.filter((cat) => {
      const allowedDepts = settings.categoryRights[cat];
      return allowedDepts && allowedDepts.includes(currentUser.department);
    });
    return [...baseCategories, ...custom];
  };

  const visibleCategories = getVisibleCategories();

  // Dynamically verify if a specific date falls outside standard tour window
  const isOutsideTourWindow = (dateStr: string) => {
    if (!tourStartDate || !tourEndDate || !dateStr) return false;
    const start = new Date(tourStartDate);
    const end = new Date(tourEndDate);
    const current = new Date(dateStr);
    return current < start || current > end;
  };

  // Convert files to base64, send to our Express Node.js custom backend
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Content = reader.result as string;

        // Post to our custom backend file parsing pipeline
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileData: base64Content,
          }),
        });

        const data = await response.json();
        if (response.ok && data.success) {
          setItemProofUrl(data.fileUrl);
          setItemProofName(file.name);
        } else {
          setUploadError(data.error || "Encryption failure during direct backend upload.");
        }
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setUploadError("Severe pipeline connection fault on file upload.");
      setIsUploading(false);
    }
  };

  // Add Item to dynamic lines array
  const handleAddLineItem = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    // Validate mandatory attributes
    if (!itemNarration.trim()) {
      setGeneralError("narration and visual receipts are mathematically mandatory.");
      return;
    }
    if (itemAmount <= 0) {
      setGeneralError("Claim amount must be a positive number.");
      return;
    }
    if (!itemProofUrl) {
      setGeneralError("Please upload a receipt statement or photo first.");
      return;
    }
    if (!itemExpenseDate) {
      setGeneralError("Expense date is required.");
      return;
    }

    const newItem: ExpenseLineItem = {
      id: `item-${Date.now()}`,
      category: itemCategory,
      expenseDate: itemExpenseDate,
      amount: itemAmount,
      narration: itemNarration.trim(),
      proofUrl: itemProofUrl,
      proofName: itemProofName,
      status: "Pending",
    };

    setLineItems([...lineItems, newItem]);

    // Reset line items inputs
    setItemExpenseDate("");
    setItemAmount(0);
    setItemNarration("");
    setItemProofUrl("");
    setItemProofName("");
  };

  const handleRemoveLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  // Instant continuous financial tallies
  const totalExpenseAmount = lineItems.reduce((acc, item) => acc + item.amount, 0);
  const finalBalance = totalExpenseAmount - advanceAmount;

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!tourStartDate || !tourEndDate) {
      setGeneralError("Official corporate Tour dates must be entered.");
      return;
    }
    if (new Date(tourStartDate) > new Date(tourEndDate)) {
      setGeneralError("Corrupted chronology: Start date occurs after end date.");
      return;
    }
    if (lineItems.length === 0) {
      setGeneralError("Empty ledger: Add at least one line-by-line expense item.");
      return;
    }
    if (!narration.trim()) {
      setGeneralError("General narration overview is required.");
      return;
    }

    try {
      // Determine serial ID assignment
      let claimNumber = "";
      let status: Claim["status"] = "Pending";

      if (claimToEdit) {
        claimNumber = claimToEdit.claimNumber;
        // Bouncing back to Auditor
        status = "Resubmitted";
      } else {
        claimNumber = await dbBroker.getNextClaimNumber();
      }

      const submittedClaim: Claim = {
        id: claimNumber,
        claimNumber,
        employeeUid: currentUser.userId,
        employeeName: currentUser.name,
        employeePhone: currentUser.phone,
        department: currentUser.department,
        designation: designation.trim() || "Associate",
        status,
        tourStartDate,
        tourEndDate,
        advanceAmount,
        totalExpenseAmount,
        finalBalance,
        narration: narration.trim(),
        createdAt: claimToEdit ? claimToEdit.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lineItems,
      };

      await dbBroker.saveClaim(submittedClaim);
      onSubmitSuccess();
    } catch (err) {
      setGeneralError("State storage write fault: " + String(err));
    }
  };

  return (
    <div className="w-full space-y-6 font-sans">
      {/* Header and Back navigation link */}
      <div className="flex justify-between items-center glass-panel p-4 rounded-xl neon-border-cyan">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 text-[#00f2ff] font-mono text-xs uppercase flex items-center gap-1 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div>
            <h2 className="text-lg font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300 uppercase italic">
              {claimToEdit ? `Modify Claim ${claimToEdit.claimNumber}` : "Forge New Expense Claim"}
            </h2>
            <p className="text-[10px] text-zinc-400 font-mono uppercase font-semibold">
              Department: {currentUser.department} | User: {currentUser.name}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-zinc-500 font-mono block">LEDGER STATUS</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full border border-teal-500/40 text-teal-300 font-mono tracking-widest uppercase bg-teal-950/20 font-bold">
            {claimToEdit ? "RE-DRAFTING" : "INITIAL CORE"}
          </span>
        </div>
      </div>

      {generalError && (
        <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-xs flex gap-2 text-red-100 neon-border-orange">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <div>
            <strong className="block uppercase font-mono tracking-wider text-red-400">Transmission Exception</strong>
            <span>{generalError}</span>
          </div>
        </div>
      )}

      {claimToEdit?.rejectionReason && (
        <div className="p-4 bg-[#ec4899]/10 border border-[#ec4899]/30 rounded-xl text-xs space-y-1 neon-border-magenta">
          <span className="font-mono text-[#ec4899] font-bold tracking-wider uppercase block">
            ⚠️ AUDITOR REJECTION DIRECTIVE
          </span>
          <p className="text-zinc-200 italic">"{claimToEdit.rejectionReason}"</p>
          <span className="text-[10px] text-zinc-500 font-mono block">
            Perform line adjustments and submit for re-auth.
          </span>
        </div>
      )}

      {/* Primary form Grid */}
      <form onSubmit={handleSubmitClaim} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core parameters */}
        <div className="lg:col-span-1 glass-panel p-5 rounded-2xl space-y-4 shadow-lg">
          <h3 className="text-xs font-mono text-[#00f2ff] uppercase tracking-widest border-b border-white/10 pb-2 flex items-center gap-1.5 font-bold neon-glow-cyan">
            <Sparkles className="w-3.5 h-3.5" /> 1. Parameters & Metadata
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                Corporate Designation / Role
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Senior Tech Engineer"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                  Tour Start Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={tourStartDate}
                    onChange={(e) => setTourStartDate(e.target.value)}
                    className="w-full pl-3 pr-2 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                  Tour End Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={tourEndDate}
                    onChange={(e) => setTourEndDate(e.target.value)}
                    className="w-full pl-3 pr-2 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                Advance Amount Paid (Received previously)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-500 font-mono text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  required
                  value={advanceAmount === 0 ? "" : advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-full pl-6 pr-3 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </div>
              <p className="text-[9px] text-zinc-500 mt-1">
                Reference cash advance received for corporate tour travel bounds.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                Tour Description & Overview Narration
              </label>
              <textarea
                required
                rows={3}
                placeholder="Exhaustive high-level summary of tour milestones and project results..."
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </div>
          </div>

          <div className="p-4 bg-zinc-900/60 rounded-xl space-y-2 border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-400 uppercase block tracking-wider">
              REAL-TIME LEDGER TALLY
            </span>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500">Expenses Entered:</span>
              <span className="font-mono text-white">₹{totalExpenseAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500">Advance Paid:</span>
              <span className="font-mono text-white">₹{advanceAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-neutral-800 text-sm font-bold">
              <span className="text-zinc-400">Final Balance payout:</span>
              <span
                className={`font-mono text-base ${
                  finalBalance >= 0 ? "text-emerald-400 neon-text-green" : "text-pink-400 neon-text-magenta"
                }`}
              >
                ₹{finalBalance.toFixed(2)}
              </span>
            </div>

            <div
              className={`p-2 rounded text-[10px] text-center uppercase tracking-widest font-mono text-black ${
                finalBalance >= 0 ? "bg-emerald-400" : "bg-pink-400"
              }`}
            >
              {finalBalance >= 0 ? "Refund Due of Claims" : "Refund Excess Advance"}
            </div>
          </div>
        </div>

        {/* Expenses Line Logging */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sub-form to Add Line Item */}
          <div className="glass-panel p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-mono text-[#ec4899] font-bold uppercase tracking-widest border-b border-white/10 pb-2 flex items-center gap-1.5 neon-glow-magenta">
              <Plus className="w-4 h-4" /> 2. Add Line-by-Line Expense Receipt
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                  Expense Category
                </label>
                <select
                  value={itemCategory}
                  onChange={(e) => setItemCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-pink-400"
                >
                  {visibleCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <p className="text-[9px] text-zinc-500 mt-1">
                  Filtered for {currentUser.department} department.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                  Bill/Expense Date
                </label>
                <input
                  type="date"
                  value={itemExpenseDate}
                  onChange={(e) => setItemExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-pink-400"
                />
                {isOutsideTourWindow(itemExpenseDate) && (
                  <span className="text-[9px] text-pink-400 font-mono block mt-1 animate-pulse">
                    ⚠️ ALERT: Date outside of Tour bounds!
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-500 font-mono text-xs">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={itemAmount || ""}
                    onChange={(e) => setItemAmount(Number(e.target.value))}
                    className="w-full pl-6 pr-3 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                  Item Narration & Specific Details
                </label>
                <input
                  type="text"
                  placeholder="e.g. Purchased high-speed magnetic subway line access slip..."
                  value={itemNarration}
                  onChange={(e) => setItemNarration(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-pink-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                  Mandatory Receipt / Proof Upload
                </label>
                <div className="relative flex items-center justify-center border border-dashed border-neutral-750 rounded-lg p-2 bg-zinc-900 space-x-2">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                     className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={isUploading}
                  />
                  <UploadCloud className="w-5 h-5 text-zinc-500" />
                  <span className="text-xs font-mono text-zinc-300">
                    {isUploading
                      ? "UPLOADING..."
                      : itemProofName
                      ? `OK: ${itemProofName.slice(0, 16)}...`
                      : "CHOOSE RECEIPT FILE"}
                  </span>
                </div>
                {uploadError && (
                  <p className="text-[9px] text-red-400 font-mono mt-1">{uploadError}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddLineItem}
              className="px-4 py-2 bg-[#ec4899] hover:bg-pink-500 text-white font-extrabold uppercase text-[10px] tracking-widest rounded-lg flex items-center gap-1 transition-all shadow shadow-pink-950"
            >
              <Plus className="w-3.5 h-3.5" /> Log expense line item
            </button>
          </div>

          {/* Current list in drafting */}
          <div className="glass-panel p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-widest border-b border-white/10 pb-2">
              📋 3. Expense Ledger Details ({lineItems.length} listed)
            </h3>

            {lineItems.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-zinc-800 rounded-xl">
                <File className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-zinc-500">Empty Ledger.</p>
                <p className="text-[10px] text-zinc-650 mt-1">
                  Add some bills to tabulate final reimbursement balances.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-950 text-zinc-500 font-mono">
                      <th className="pb-2">Category</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Narration</th>
                      <th className="pb-2">Receipt</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {lineItems.map((item) => {
                      const outside = isOutsideTourWindow(item.expenseDate);
                      return (
                        <tr key={item.id} className="hover:bg-zinc-900/40 text-zinc-200">
                          <td className="py-2.5">
                            <span className="font-mono text-cyan-400">{item.category}</span>
                            {item.status === "Rejected" && (
                              <span className="text-[8px] bg-pink-950/40 border border-pink-500/30 text-pink-400 px-1 rounded block w-max mt-0.5 font-bold uppercase tracking-wide">
                                Rejected
                              </span>
                            )}
                          </td>
                          <td className="py-2.5">
                            <span className={outside ? "text-pink-400 font-mono" : "font-mono"}>
                              {item.expenseDate}
                            </span>
                            {outside && (
                              <span className="text-[8px] border border-pink-700 bg-pink-950/40 text-pink-400 px-1 rounded block w-max mt-0.5">
                                OUTSIDE TIMELINE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 font-mono font-bold">₹{item.amount.toFixed(2)}</td>
                          <td className="py-2.5 text-zinc-400">
                            <div>{item.narration}</div>
                            {item.status === "Rejected" && item.rejectionReason && (
                              <div className="mt-1 text-[10px] text-pink-400 font-mono italic bg-pink-950/20 border border-pink-500/10 p-1 rounded max-w-xs">
                                ✗ Reason: {item.rejectionReason}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5">
                            {item.proofUrl ? (
                              <a
                                href={getRelativeProofUrl(item.proofUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-purple-400 text-[10px] font-mono underline block hover:text-purple-300"
                              >
                                View File ↗
                              </a>
                            ) : (
                              <span className="text-zinc-600">No Receipt</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(item.id)}
                              className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Submission and drafting tools */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-3 border border-neutral-700 hover:bg-neutral-900 rounded-xl text-xs font-mono uppercase tracking-wider text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold uppercase text-xs tracking-widest rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-md shadow-emerald-900 flex items-center gap-2"
            >
              <FileCheck className="w-4 h-4" />
              {claimToEdit ? "RESUBMIT REVISED SYSTEM LEDGER" : "TRANSMIT COMPLETED CLAIMS"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
