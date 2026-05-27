import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  CalendarDays,
  FileCheck2,
  FileX2,
  AlertTriangle,
  Download,
  DollarSign,
  User,
  ShieldAlert,
  ArrowRight,
  ClipboardCheck,
  Settings,
  Lock,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { Claim, ExpenseLineItem } from "../types";
import { dbBroker } from "../dbBroker";
import { getRelativeProofUrl } from "../utils";

interface AdminPanelProps {
  claims: Claim[];
  onRefreshClaims: () => void;
}

export default function AdminPanel({ claims, onRefreshClaims }: AdminPanelProps) {
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<{ url: string; name: string } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [rejectingItemId, setRejectingItemId] = useState<string | null>(null);
  const [itemRejectionReason, setItemRejectionReason] = useState("");

  useEffect(() => {
    setZoomLevel(1);
  }, [activeReceipt]);

  const [showSettings, setShowSettings] = useState(false);
  const [auditorPasscode, setAuditorPasscode] = useState("aapc12");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [systemSettings, setSystemSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const s = await dbBroker.getSettings();
        if (s) {
          setSystemSettings(s);
          setAuditorPasscode(s.auditorAdminPasscode || "aapc12");
        }
      } catch (err) {
        console.error("Failed to load settings in Auditor panel:", err);
      }
    };
    fetchSettings();
  }, []);

  const handleUpdateAuditorPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditorPasscode.trim()) {
      alert("Passcode cannot be empty.");
      return;
    }
    try {
      const s = systemSettings || await dbBroker.getSettings();
      const updated = {
        ...s,
        auditorAdminPasscode: auditorPasscode.trim(),
      };
      await dbBroker.saveSettings(updated);
      setSystemSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to update passcode:", err);
    }
  };

  // Focus primarily on pending or resubmitted items
  const pendingReviews = claims.filter((c) => c.status === "Pending" || c.status === "Resubmitted");
  const processedReviews = claims.filter((c) => c.status === "Approved" || c.status === "Rejected");

  // Determine if a specific date falls outside standard tour window
  const isOutsideTourWindow = (claim: Claim, dateStr: string) => {
    if (!claim.tourStartDate || !claim.tourEndDate || !dateStr) return false;
    const start = new Date(claim.tourStartDate);
    const end = new Date(claim.tourEndDate);
    const current = new Date(dateStr);
    return current < start || current > end;
  };

  const handleLineItemStatus = async (itemId: string, status: "Approved" | "Rejected" | "Pending") => {
    if (!selectedClaim) return;
    try {
      const updatedLineItems = selectedClaim.lineItems.map((item) => {
        if (item.id === itemId) {
          const reason = status === "Rejected" ? item.rejectionReason : "";
          return { ...item, status, rejectionReason: reason };
        }
        return item;
      });
      const updated: Claim = {
        ...selectedClaim,
        lineItems: updatedLineItems,
        updatedAt: new Date().toISOString(),
      };
      await dbBroker.saveClaim(updated);
      setSelectedClaim(updated);
      onRefreshClaims();
    } catch (e) {
      console.error("Failed to update line item status:", e);
    }
  };

  const handleRejectLineItemSubmit = async (itemId: string, reasonText: string) => {
    if (!selectedClaim) return;
    const trimmed = reasonText.trim();
    if (!trimmed) {
      alert("Please specify a genuine reason outlining the issue with this receipt.");
      return;
    }
    try {
      const updatedLineItems = selectedClaim.lineItems.map((item) => {
        if (item.id === itemId) {
          return { ...item, status: "Rejected" as const, rejectionReason: trimmed };
        }
        return item;
      });

      const targetItem = selectedClaim.lineItems.find(it => it.id === itemId);
      const overallReason = `Rejected Log Line item [Code Category: ${targetItem?.category || "Unknown"}]: ${trimmed}`;

      const updated: Claim = {
        ...selectedClaim,
        status: "Rejected",
        rejectionReason: overallReason,
        lineItems: updatedLineItems,
        updatedAt: new Date().toISOString(),
      };

      await dbBroker.saveClaim(updated);
      setSelectedClaim(updated);
      setRejectingItemId(null);
      setItemRejectionReason("");
      onRefreshClaims();

      await sendEmailForClaim(updated, "Rejected", overallReason);
    } catch (e) {
      console.error("Failed to submit line item rejection:", e);
    }
  };

  const handleDownloadAllClaimsExcel = () => {
    const headers = [
      "Claim Number",
      "Employee Name",
      "Employee Phone",
      "Department",
      "Designation",
      "Claim Status",
      "Tour Duration",
      "Advance Amount (INR)",
      "Total Spend (INR)",
      "Payout Balance (INR)",
      "Receipt Category",
      "Receipt Date",
      "Receipt Amount (INR)",
      "Receipt Narration",
      "Receipt Status",
      "General Synopsis",
      "Rejection Directives"
    ];

    let csvContent = "";
    csvContent += "\uFEFF"; // UTF-8 BOM
    csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

    claims.forEach((claim) => {
      const tourDateRange = `${claim.tourStartDate} to ${claim.tourEndDate}`;
      if (!claim.lineItems || claim.lineItems.length === 0) {
        const row = [
          claim.claimNumber,
          claim.employeeName,
          claim.employeePhone,
          claim.department,
          claim.designation,
          claim.status,
          tourDateRange,
          claim.advanceAmount.toString(),
          claim.totalExpenseAmount.toString(),
          claim.finalBalance.toString(),
          "N/A",
          "N/A",
          "0",
          "No receipts attached",
          "Pending",
          claim.narration,
          claim.rejectionReason || ""
        ];
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n";
      } else {
        claim.lineItems.forEach((item) => {
          const row = [
            claim.claimNumber,
            claim.employeeName,
            claim.employeePhone,
            claim.department,
            claim.designation,
            claim.status,
            tourDateRange,
            claim.advanceAmount.toString(),
            claim.totalExpenseAmount.toString(),
            claim.finalBalance.toString(),
            item.category,
            item.expenseDate,
            item.amount.toString(),
            item.narration,
            item.status || "Pending",
            claim.narration,
            claim.rejectionReason || ""
          ];
          csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n";
        });
      }
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Krystal_Travel_Claims_Master_Excel_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sendEmailForClaim = async (claim: Claim, status: "Approved" | "Rejected", notesReason?: string) => {
    try {
      const users = await dbBroker.getUsers();
      const employeeProfile = users.find(
        (u) =>
          u.userId === claim.employeeUid ||
          u.name.trim().toLowerCase() === claim.employeeName.trim().toLowerCase()
      );
      
      const employeeEmail = employeeProfile?.email || `${claim.employeeName.toLowerCase().replace(/\s+/g, ".")}@krystalpath.com`;
      const currentReason = notesReason || claim.rejectionReason || "";
      
      const subject = status === "Approved"
        ? `[Krystal Path] Claim APPROVED - REF: ${claim.claimNumber}`
        : `[Krystal Path] Claim REJECTED [Action Required] - REF: ${claim.claimNumber}`;

      const body = status === "Approved"
        ? `Dear ${claim.employeeName},\n\nWe are pleased to inform you that your travel claim "${claim.claimNumber}" has been Approved by the Auditor Admin.\n\nDetails:\n- Tour Schedule: ${claim.tourStartDate} to ${claim.tourEndDate}\n- Total Claimed Amount: INR ${claim.totalExpenseAmount.toFixed(2)}\n- Approved Payout/Reimbursement: INR ${claim.finalBalance.toFixed(2)}\n\nThe approved payout has been queued for immediate disbursement.\n\nSincerely,\nAuditor Accounts Desk\nKrystal Path Financials`
        : `Dear ${claim.employeeName},\n\nYour travel claim "${claim.claimNumber}" has been Rejected by the Auditor Admin.\n\nFollowing reasons for rejection:\n"${currentReason}"\n\nAction Needed:\nPlease check the feedback instructions above. You are requested to log back into the Krystal Path portal, edit / correct the rejected claim as requested, and resubmit the claim with the necessary adjustments for audit processing.\n\nSincerely,\nAuditor Accounts Desk\nKrystal Path Financials`;

      const emailObj = {
        id: `email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        to: employeeEmail,
        toName: claim.employeeName,
        subject,
        body,
        claimNumber: claim.claimNumber,
        status,
        sentAt: new Date().toISOString(),
      };

      await dbBroker.sendEmail(emailObj);

      // Trigger the real backend review endpoint with resilient fallback logging
      try {
        const res = await fetch(`/api/claims/${claim.claimNumber}/review`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: status,
            adminComment: currentReason,
            trip_title: claim.narration,
            amount: claim.totalExpenseAmount,
            employeeEmail,
            employeeName: claim.employeeName
          })
        });
        const resData = await res.json();
        console.log("Email trigger response from system API:", resData);
        if (resData.emailStatus && resData.emailStatus.includes("sent via Resend")) {
          setEmailNotice(`📧 MAIL SENT: Real notification dispatched via Resend API to "${employeeEmail}"!`);
        } else if (resData.emailStatus && resData.emailStatus.includes("simulated")) {
          setEmailNotice(`📧 MAIL SENT: Local record created and cached securely for employee "${employeeEmail}"!`);
        } else if (resData.emailStatus && resData.emailStatus.includes("disabled")) {
          setEmailNotice(`📧 INFO: Mail trigger is currently turned off by Super Admin settings.`);
        } else {
          setEmailNotice(`📧 MAIL STATUS: Updated successfully. Status: ${resData.emailStatus || "Done"}`);
        }
      } catch (apiErr) {
        console.error("Failed connection to email notification API gateway:", apiErr);
        setEmailNotice(`📧 MAIL NOTIFICATION: Local validation succeeded & saved securely for ${claim.employeeName}!`);
      }

      setTimeout(() => setEmailNotice(null), 5500);
    } catch (err) {
      console.error("Failed to generate or persist simulated email dispatch:", err);
    }
  };

  const handleApprove = async (claim: Claim) => {
    const hasRejected = claim.lineItems.some((it) => it.status === "Rejected");
    const hasPending = claim.lineItems.some((it) => it.status !== "Approved" && it.status !== "Rejected");

    if (hasRejected) {
      alert("Cannot approve a claim with rejected line items. Please ask the employee to correct the ledger or adjust line item status.");
      return;
    }
    if (hasPending) {
      alert("Please audit (Approve or Reject) all individual expense line items before final signoff.");
      return;
    }

    try {
      const updated: Claim = {
        ...claim,
        status: "Approved",
        rejectionReason: "", // Clear prior reasons
        updatedAt: new Date().toISOString(),
      };
      await dbBroker.saveClaim(updated);
      setSelectedClaim(null);
      setRejectionReason("");
      setIsRejecting(false);
      setActiveReceipt(null);
      onRefreshClaims();
      await sendEmailForClaim(updated, "Approved");
    } catch (e) {
      console.error("Failed to approve claim:", e);
    }
  };

  const handleRejectInit = () => {
    setIsRejecting(true);
    setRejectionReason("");
  };

  const handleRejectSubmit = async (claim: Claim) => {
    if (!rejectionReason.trim()) {
      alert("Please specify a genuine rejection directive before transmitting.");
      return;
    }

    try {
      const updated: Claim = {
        ...claim,
        status: "Rejected",
        rejectionReason: rejectionReason.trim(),
        updatedAt: new Date().toISOString(),
      };

      await dbBroker.saveClaim(updated);
      setSelectedClaim(null);
      const tempReason = rejectionReason.trim();
      setRejectionReason("");
      setIsRejecting(false);
      setActiveReceipt(null);
      onRefreshClaims();
      await sendEmailForClaim(updated, "Rejected", tempReason);
    } catch (e) {
      console.error("Failed to reject claim:", e);
    }
  };

  // Compile ascii-ledgers and trigger native downloadable TXT statements onto local storage
  const handleDownloadReport = (claim: Claim) => {
    const divider = "=========================================================================";
    const subDivider = "-------------------------------------------------------------------------";

    // Build the report content
    let content = ``;
    content += `${divider}\n`;
    content += `         KRPL TRAVEL NET: TOUR REIMBURSEMENT SUMMARY LEDGER STATEMENT\n`;
    content += `                     SECURITY LEVEL: INTERNAL CORPORATE AUDIT\n`;
    content += `${divider}\n\n`;

    content += `CLAIM REF NO     : ${claim.claimNumber}\n`;
    content += `EMPLOYEE IDENTITY: ${claim.employeeName} (${claim.employeePhone})\n`;
    content += `DEPARTMENT       : ${claim.department}\n`;
    content += `DESIGNATION      : ${claim.designation}\n`;
    content += `LEGER STATUS     : ${claim.status.toUpperCase()}\n`;
    content += `TOUR TIMELINES   : ${claim.tourStartDate} TO ${claim.tourEndDate}\n`;
    content += `RECORDED AT      : ${new Date(claim.createdAt).toLocaleString()}\n`;
    content += `LATEST AUDIT DATE: ${new Date(claim.updatedAt).toLocaleString()}\n\n`;

    content += `GENERAL OVERVIEW NARRATION:\n`;
    content += `"${claim.narration}"\n\n`;

    if (claim.status === "Rejected" && claim.rejectionReason) {
      content += `AUDITOR REJECTION DIRECTION:\n`;
      content += `"${claim.rejectionReason}"\n\n`;
    }

    content += `${subDivider}\n`;
    content += `LINE ITEM DETAILS:\n`;
    content += `CATEGORY     | DATE       | AMOUNT      | WARNINGS | NARRATION\n`;
    content += `${subDivider}\n`;

    claim.lineItems.forEach((item) => {
      const isOutside = isOutsideTourWindow(claim, item.expenseDate);
      const categoryCol = item.category.padEnd(12).slice(0, 12);
      const dateCol = item.expenseDate.padEnd(10).slice(0, 10);
      const amountCol = `₹${item.amount.toFixed(2)}`.padEnd(11).slice(0, 11);
      const warningCol = isOutside ? "OUTSIDE ".padEnd(8) : "OK      ".padEnd(8);
      const descCol = item.narration;

      content += `${categoryCol} | ${dateCol} | ${amountCol} | ${warningCol} | ${descCol}\n`;
    });

    content += `${subDivider}\n\n`;
    content += `TOTAL CLAIM BUDGET STATS:\n`;
    content += `- Total Line Item Expense Accumulations: ₹${claim.totalExpenseAmount.toFixed(2)}\n`;
    content += `- Paid Tour Frontline Cash Advance    : ₹${claim.advanceAmount.toFixed(2)}\n`;
    content += `- NET DUE PAYABLE BALANCE             : ₹${claim.finalBalance.toFixed(2)}\n\n`;

    content += `CALCULATION STATEMENT: ${
      claim.finalBalance >= 0
        ? `Refund of ₹${claim.finalBalance.toFixed(2)} is due to employee.`
        : `Employee must refund ₹${Math.abs(claim.finalBalance).toFixed(2)} remaining advance.`
    }\n\n`;

    content += `${divider}\n`;
    content += `         AUDITED BY THE FINANCE DIVISION - SYSTEM SIGN-OFF COMPLICATED\n`;
    content += `${divider}\n`;

    // Package Blob
    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `KRPL_REPORT_${claim.claimNumber}.txt`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full space-y-6 relative">
      {/* Floating email notification dispatch toast */}
      {emailNotice && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm p-4 bg-zinc-950 border-2 border-emerald-500 rounded-xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-300">
          <div className="p-2 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Mail className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-grow space-y-1">
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest block">
              Mail Dispatch Center
            </span>
            <p className="text-xs text-white leading-relaxed font-sans">{emailNotice}</p>
            <p className="text-[9px] text-zinc-500 font-mono uppercase">
              Simulated SMTP Outbound Status: OK
            </p>
          </div>
          <button 
            onClick={() => setEmailNotice(null)}
            className="text-zinc-500 hover:text-white text-xs font-mono p-1 leading-none self-start"
          >
            ✕
          </button>
        </div>
      )}

      {/* Title block */}
      <div className="glass-panel p-5 rounded-2xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-widest text-[#ec4899] drop-shadow neon-glow-magenta italic">
            Auditor Admin Deck: Visual Check & Signoff
          </h2>
          <p className="text-[10px] text-zinc-400 font-mono mt-0.5 uppercase font-semibold">
            Authorization Realm: Limited audit operations, travel receipt validations & report summaries
          </p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 border border-white/10 hover:border-pink-500/40 text-pink-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all duration-150"
          >
            <Settings className="w-3.5 h-3.5" /> {showSettings ? "Close Settings" : "Auditor Settings"}
          </button>
          <button
            onClick={handleDownloadAllClaimsExcel}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-black font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all hover:scale-105 active:scale-95 shadow shadow-emerald-950 duration-200"
          >
            <Download className="w-4 h-4" /> Export Excel Report
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="glass-panel p-5 rounded-2xl border border-pink-500/20 max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-4">
            <Lock className="w-4 h-4 text-pink-500" />
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Change Auditor Access Passcode
            </h3>
          </div>
          <form onSubmit={handleUpdateAuditorPasscode} className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1.5">
                New Gateway Passcode
              </label>
              <input
                type="text"
                required
                placeholder="Enter new strong passcode"
                value={auditorPasscode}
                onChange={(e) => setAuditorPasscode(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-neutral-700 rounded text-white font-mono tracking-wider focus:outline-none focus:border-pink-500"
              />
            </div>
            <div className="flex gap-2 justify-end items-center pt-2">
              {saveSuccess && (
                <span className="text-[10px] font-mono text-emerald-400 animate-pulse mr-auto">
                  ✓ Passcode updated!
                </span>
              )}
              <button
                type="submit"
                className="px-4 py-1.5 bg-pink-600 hover:bg-pink-500 text-black text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all"
              >
                Save New Passcode
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Review Pipeline (Left) */}
        <div className={`${selectedClaim ? "lg:col-span-4" : "lg:col-span-12"} space-y-4 transition-all duration-300`}>
          <div className="glass-panel p-4 rounded-xl space-y-4">
            <h3 className="text-xs font-mono text-[#00f2ff] uppercase tracking-widest pb-1.5 border-b border-white/10">
              📥 Pending Auditor review ({pendingReviews.length} Claims)
            </h3>

            {pendingReviews.length === 0 ? (
              <div className="text-center py-10">
                <FileCheck2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 animate-pulse" />
                <p className="text-xs text-zinc-300 font-bold uppercase tracking-wider">
                  ALL LEDGERS FULLY DECRYPTED
                </p>
                <p className="text-[10px] text-zinc-500 mt-1 uppercase">
                  No submissions are currently pending financial audit checks.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {pendingReviews.map((claim) => (
                  <button
                    key={claim.claimNumber}
                    onClick={() => {
                      setSelectedClaim(claim);
                      setActiveReceipt(
                        claim.lineItems[0]?.proofUrl
                          ? { url: claim.lineItems[0].proofUrl, name: claim.lineItems[0].proofName }
                          : null
                      );
                      setIsRejecting(false);
                    }}
                    className={`w-full p-4 border rounded-xl text-left transition-all ${
                      selectedClaim?.claimNumber === claim.claimNumber
                        ? "bg-slate-900/85 border-[#00f2ff] neon-border-cyan"
                        : "bg-slate-950/40 border-white/5 hover:border-white/15"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-sm font-bold text-white block">
                        {claim.claimNumber}
                      </span>
                      <span
                        className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                          claim.status === "Resubmitted"
                            ? "bg-[#00f2ff]/10 text-[#00f2ff] border border-[#00f2ff]/30"
                            : "bg-yellow-950/25 text-yellow-500 border border-yellow-800/40"
                        }`}
                      >
                        {claim.status}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-sans font-medium">
                        <User className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{claim.employeeName}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                        <span>Dept: {claim.department}</span>
                        <span className="text-[#ec4899] font-bold">₹{claim.totalExpenseAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Historical Check Logs Dashboard */}
          <div className="glass-panel p-4 rounded-xl space-y-2">
            <h4 className="text-[10px] font-mono text-zinc-400 font-semibold uppercase tracking-widest border-b border-white/10 pb-1">
              Historical Signoffs ({processedReviews.length} Logs)
            </h4>
            <div className="max-h-[25vh] overflow-y-auto space-y-2">
              {processedReviews.map((claim) => (
                <div
                  key={claim.claimNumber}
                  className="flex justify-between items-center text-xs p-2 rounded bg-zinc-900/20 border border-zinc-900 hover:border-zinc-800"
                >
                  <div>
                    <span className="font-mono text-zinc-300 font-bold">{claim.claimNumber}</span>
                    <span className="text-[10px] text-zinc-500 block">
                      {claim.employeeName} · {claim.department}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-[8px] font-mono px-1 rounded ${
                        claim.status === "Approved"
                          ? "text-emerald-400 bg-emerald-950/30 border border-emerald-950"
                          : "text-pink-400 bg-pink-950/30 border border-pink-950"
                      }`}
                    >
                      {claim.status}
                    </span>
                    <button
                      onClick={() => handleDownloadReport(claim)}
                      title="Download local report audit record"
                      className="text-zinc-500 hover:text-cyan-400 p-0.5 ml-2 transition-all inline-block align-middle"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Auditor side-by-side Workstation workspace */}
        {selectedClaim && (
          <div className="lg:col-span-8 glass-panel p-6 rounded-2xl space-y-6 shadow-2xl transition-all duration-300 neon-border-magenta">
            {/* Reviewing Claim details */}
            <div className="flex justify-between items-start gap-4 pb-4 border-b border-white/10">
              <div>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-[#ec4899]/15 text-[#ec4899] border border-[#ec4899]/30 rounded uppercase block w-max tracking-widest mb-1.5 animate-pulse">
                  ACTIVE AUDIT WORKSTATION
                </span>
                <h3 className="text-lg font-bold text-white tracking-wide uppercase">
                  Verify {selectedClaim.claimNumber} Ledger
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Submitted by {selectedClaim.employeeName} ({selectedClaim.designation})
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleDownloadReport(selectedClaim)}
                  className="px-3 py-1.5 bg-slate-900/60 hover:bg-slate-900 border border-white/10 text-zinc-300 font-mono text-[10px] tracking-wider rounded-lg flex items-center gap-1 uppercase transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> Download Report
                </button>
                <button
                  onClick={() => setSelectedClaim(null)}
                  className="px-3 py-1.5 border border-white/10 text-[#e2e8f0]/40 hover:text-[#e2e8f0] hover:border-white/20 font-mono text-[10px] uppercase rounded-lg transition-all"
                >
                  Exit Review
                </button>
              </div>
            </div>

            {/* Travel specifications info block */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-900/40 p-4 rounded-xl border border-white/5 text-xs">
              <div>
                <span className="text-zinc-500 font-mono text-[10px] block uppercase">Depart Sector</span>
                <span className="text-zinc-200 mt-1 block font-semibold">{selectedClaim.department}</span>
              </div>
              <div>
                <span className="text-zinc-500 font-mono text-[10px] block uppercase">Tour Window</span>
                <span className="text-zinc-250 mt-1 block font-semibold font-mono">
                  {selectedClaim.tourStartDate} to {selectedClaim.tourEndDate}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 font-mono text-[10px] block uppercase">Claim total spend</span>
                <span className="text-zinc-200 mt-1 block font-bold font-mono text-cyan-300">
                  ₹{selectedClaim.totalExpenseAmount.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 font-mono text-[10px] block uppercase">Payout due</span>
                <span
                  className={`mt-1 block font-bold font-mono text-sm uppercase ${
                    selectedClaim.finalBalance >= 0 ? "text-emerald-400 neon-text-green" : "text-pink-400"
                  }`}
                >
                  ₹{selectedClaim.finalBalance.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Side-by-side Bills Receipt Checking Arena */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[40vh]">
              {/* Claims Data table list (Left md:7) */}
              <div className="md:col-span-7 space-y-4">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">
                  Click lines to inspect attached bills:
                </span>

                <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
                  {selectedClaim.lineItems.map((item) => {
                    const outside = isOutsideTourWindow(selectedClaim, item.expenseDate);
                    const isActive = activeReceipt?.url === item.proofUrl;

                    return (
                      <div
                        key={item.id}
                        className={`w-full p-3 rounded-xl border transition-all text-xs flex flex-col space-y-2.5 ${
                          isActive
                            ? "bg-zinc-900 border-pink-400/60 neon-border-pink"
                            : "bg-zinc-900/30 border-zinc-900 hover:border-zinc-800"
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <div 
                            className="space-y-1.5 flex-1 pr-3 cursor-pointer"
                            onClick={() =>
                              setActiveReceipt(item.proofUrl ? { url: item.proofUrl, name: item.proofName } : null)
                            }
                          >
                            <div className="flex items-center gap-2 flex-wrap text-zinc-300 mb-1.5">
                              <span className="font-mono text-cyan-300 font-bold uppercase">{item.category}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">{item.expenseDate}</span>
                              {item.status === "Approved" ? (
                                <span className="px-1.5 py-0.5 text-[8.5px] font-mono bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 rounded uppercase font-bold tracking-wide">
                                  ✓ Approved Bill
                                </span>
                              ) : item.status === "Rejected" ? (
                                <span className="px-1.5 py-0.5 text-[8.5px] font-mono bg-pink-950/40 text-pink-400 border border-pink-500/30 rounded uppercase font-bold tracking-wide">
                                  ✗ Rejected Bill
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 text-[8.13px] font-mono bg-yellow-950/30 text-yellow-500 border border-yellow-800/20 rounded uppercase font-bold tracking-wide">
                                  Pending Audit
                                </span>
                              )}
                            </div>
                            <p className="text-zinc-400 text-[11px] leading-tight font-sans italic">
                              "{item.narration}"
                            </p>
                            {outside && (
                              <div className="py-0.5 px-2 bg-pink-950/30 border border-pink-500/30 rounded text-[9px] text-pink-400 font-mono flex items-center gap-1 w-max mt-1">
                                <ShieldAlert className="w-3.5 h-3.5 shrink-0 animate-ping" />
                                <span>OUTSIDE TOUR bounds of the employee!</span>
                              </div>
                            )}
                          </div>

                          <div className="text-right flex flex-col items-end gap-1.5 shrink-0 font-sans">
                            <div
                              className="cursor-pointer select-none"
                              onClick={() => {
                                if (item.proofUrl) {
                                  setActiveReceipt({ url: item.proofUrl, name: item.proofName });
                                  window.open(getRelativeProofUrl(item.proofUrl), "_blank");
                                }
                              }}
                            >
                              <span className="font-mono font-bold text-white block text-sm">
                                ₹{item.amount.toFixed(2)}
                              </span>
                              <span className="text-[9px] font-mono text-purple-400 underline block text-right hover:text-purple-300">
                                Verify receipt ↗
                              </span>
                            </div>
                            
                            {/* Inner Action Bar for specific line approval */}
                            <div className="flex items-center gap-1 mt-1 bg-slate-950/60 p-1 rounded-lg border border-white/5">
                              <button
                                type="button"
                                onClick={() => handleLineItemStatus(item.id, "Approved")}
                                title="Approve this single expenditure bill"
                                className={`p-1 rounded transition-all ${
                                  item.status === "Approved"
                                    ? "bg-emerald-500 text-black"
                                    : "text-zinc-500 hover:text-emerald-400 hover:bg-emerald-950/30"
                                }`}
                              >
                                <FileCheck2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingItemId(item.id);
                                  setItemRejectionReason(item.rejectionReason || "");
                                }}
                                title="Reject this single expenditure bill"
                                className={`p-1 rounded transition-all ${
                                  item.status === "Rejected"
                                    ? "bg-pink-600 text-black"
                                    : "text-zinc-500 hover:text-pink-400 hover:bg-pink-950/30"
                                }`}
                              >
                                <FileX2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Inline Rejection details input */}
                        {rejectingItemId === item.id && (
                          <div className="mt-1 p-2.5 bg-pink-950/20 border border-pink-500/25 rounded-lg space-y-2 animate-fade-in block w-full">
                            <span className="block text-[10px] font-mono text-pink-400 uppercase tracking-wider font-semibold">
                              Specify reason for rejecting this {item.category} expense:
                            </span>
                            <div className="flex gap-2 w-full">
                              <input
                                type="text"
                                required
                                placeholder="e.g. Ineligible bill date, illegible text, wrong category..."
                                value={itemRejectionReason}
                                onChange={(e) => setItemRejectionReason(e.target.value)}
                                className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-950 border border-neutral-800 rounded text-white font-sans focus:outline-none focus:ring-1 focus:ring-pink-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleRejectLineItemSubmit(item.id, itemRejectionReason)}
                                className="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-black font-extrabold text-[10px] tracking-wider rounded uppercase transition-colors shrink-0 font-mono"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingItemId(null);
                                  setItemRejectionReason("");
                                }}
                                className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-350 font-bold text-[10px] tracking-wider rounded uppercase transition-colors shrink-0 font-mono border border-white/5"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Display existing rejection reason if rejected */}
                        {item.status === "Rejected" && item.rejectionReason && rejectingItemId !== item.id && (
                          <div className="mt-1 p-2 bg-pink-950/10 border border-pink-950/20 rounded-lg text-[11px] text-pink-300 font-mono italic flex items-center justify-between">
                            <span>✗ Reason: "{item.rejectionReason}"</span>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingItemId(item.id);
                                setItemRejectionReason(item.rejectionReason || "");
                              }}
                              className="text-[9px] underline text-pink-400 hover:text-pink-300 ml-2 italic shrink-0"
                            >
                              Edit directive
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Receipt side-by-side Frame viewport (Right md:5) */}
              <div className="md:col-span-5 bg-zinc-900/60 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block border-b border-zinc-950 pb-1.5 mb-2.5">
                    🖼️ Side-by-Side bill Viewer
                  </span>

                  {activeReceipt ? (
                    <div className="space-y-3">
                      {/* Action buttons to Download or Open in New window */}
                      <div className="flex gap-2">
                        <a
                          href={getRelativeProofUrl(activeReceipt.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 py-2 bg-[#ec4899] hover:bg-pink-500 text-black font-extrabold text-center uppercase text-[10px] tracking-wider rounded-lg transition-all"
                        >
                          Verify: New Tab ↗
                        </a>
                        <a
                          href={getRelativeProofUrl(activeReceipt.url)}
                          download={activeReceipt.name}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-200 font-bold text-center uppercase text-[10px] tracking-wider rounded-lg transition-all"
                        >
                          Download 📥
                        </a>
                      </div>

                      <div className="relative aspect-[3/4] bg-black/80 rounded-xl overflow-hidden border border-zinc-805 flex items-center justify-center">
                        {activeReceipt.url.endsWith(".pdf") ? (
                          <div className="p-4 text-center">
                            <p className="text-xs font-mono text-purple-400 mb-2">CRYPT-LEVEL PDF ATTACHMENT</p>
                            <a
                              href={getRelativeProofUrl(activeReceipt.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-black font-extrabold uppercase text-[10px] tracking-wide rounded-lg inline-block"
                            >
                              Open PDF Document ↗
                            </a>
                          </div>
                        ) : (
                          <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
                            <div 
                              className="w-full h-full flex items-center justify-center transition-transform duration-200"
                              style={{ transform: `scale(${zoomLevel})` }}
                            >
                              <img
                                src={getRelativeProofUrl(activeReceipt.url)}
                                alt="Receipt proof attachment"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain max-h-[45vh]"
                              />
                            </div>
                            
                            {/* Floating Zoom controls bar */}
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/85 px-3 py-1.5 rounded-full border border-white/10 shadow-lg z-10">
                              <button
                                type="button"
                                onClick={() => setZoomLevel((prev) => Math.max(0.5, prev - 0.25))}
                                className="text-zinc-400 hover:text-white px-2 py-0.5 text-xs font-bold font-mono transition-colors"
                                title="Zoom Out"
                              >
                                -
                              </button>
                              <span className="text-[10px] font-mono text-cyan-400 px-1 font-bold min-w-[36px] text-center">
                                {Math.round(zoomLevel * 100)}%
                              </span>
                              <button
                                type="button"
                                onClick={() => setZoomLevel((prev) => Math.min(4, prev + 0.25))}
                                className="text-zinc-400 hover:text-white px-2 py-0.5 text-xs font-bold font-mono transition-colors"
                                title="Zoom In"
                              >
                                +
                              </button>
                              <div className="w-px h-3 bg-white/10 mx-1" />
                              <button
                                type="button"
                                onClick={() => setZoomLevel(1)}
                                className="text-[9px] font-mono bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-300 font-bold transition-colors"
                                title="Reset Zoom"
                              >
                                Reset
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-zinc-500 text-center uppercase truncate">
                        File: {activeReceipt.name}
                      </p>
                    </div>
                  ) : (
                    <div className="h-[25vh] flex flex-col justify-center items-center text-center opacity-40">
                      <ClipboardCheck className="w-10 h-10 text-zinc-600 mb-2" />
                      <p className="text-xs text-zinc-500 font-mono">No active receipt view.</p>
                      <p className="text-[9px] text-zinc-650 mt-1 uppercase">
                        Select an item category to fetch statement images.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-950 text-[10px] text-zinc-600 font-mono uppercase">
                  Secure containment tunnel.
                </div>
              </div>
            </div>

            {/* General Narration section */}
            <div className="p-4 bg-zinc-900/30 rounded-xl border border-zinc-900 text-xs text-zinc-300">
              <strong className="block font-mono uppercase text-zinc-500 tracking-wider text-[9px] mb-1">
                Tour General Overview Synopsis statement
              </strong>
              <p className="italic">"{selectedClaim.narration}"</p>
            </div>

            {/* Reject Form input / controls integration */}
            {isRejecting ? (
              <div className="p-4 bg-pink-950/20 border border-pink-500/40 rounded-xl space-y-3 animate-fade-in">
                <label className="block text-xs font-mono text-pink-400 uppercase tracking-widest">
                  🚨 Transmit rejection directive and instructions:
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="State specifically which items, rates, or receipts require revision..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-900 border border-neutral-700 rounded-lg text-white font-sans focus:outline-none focus:ring-1 focus:ring-pink-400"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setIsRejecting(false)}
                    className="px-4 py-1.5 border border-zinc-800 text-xs font-mono text-gray-400 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRejectSubmit(selectedClaim)}
                    className="px-5 py-1.5 bg-pink-600 hover:bg-pink-500 text-black font-extrabold uppercase text-[10px] tracking-widest rounded-lg transition-all"
                  >
                    Confirm Rejection
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={handleRejectInit}
                  className="px-5 py-2.5 border border-pink-500/40 text-pink-400 hover:bg-pink-500/10 text-xs font-mono uppercase tracking-widest rounded-xl transition-all neon-border-magenta"
                >
                  Reject Claim
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(selectedClaim)}
                  className="px-8 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all hover:scale-105 shadow shadow-emerald-900"
                >
                  Approve claim & Signoff
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
