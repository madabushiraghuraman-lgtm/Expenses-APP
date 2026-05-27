import React, { useState, useEffect } from "react";
import {
  Plus,
  TrendingUp,
  FileText,
  AlertOctagon,
  FolderOpen,
  ArrowRight,
  Receipt,
  FileCheck2,
  CalendarDays,
  ShieldCheck,
  Download,
  Mail,
} from "lucide-react";
import { Claim, UserProfile } from "../types";
import { dbBroker } from "../dbBroker";
import { getRelativeProofUrl } from "../utils";

interface EmployeePanelProps {
  currentUser: UserProfile;
  claims: Claim[];
  onLogNewClaim: () => void;
  onEditClaim: (claim: Claim) => void;
}

function downloadClaimsExcel(claims: Claim[], currentUser: UserProfile) {
  const headers = [
    "Claim No.",
    "Employee Name",
    "Employee ID",
    "Department",
    "Designation",
    "Tour Start Date",
    "Tour End Date",
    "Expense Date",
    "Expense Category",
    "Expense Narration",
    "Expense Item Amount (INR)",
    "Advance Cash Received (INR)",
    "Claim Status",
    "Final Balance (INR)",
    "Proof URL Reference"
  ];

  const rows: string[][] = [];

  claims.forEach((claim) => {
    const isZeroAdvance = claim.advanceAmount === 0;
    const advStr = isZeroAdvance ? "" : claim.advanceAmount.toString();
    const finalBalStr = claim.finalBalance.toString();

    if (!claim.lineItems || claim.lineItems.length === 0) {
      rows.push([
        claim.claimNumber,
        claim.employeeName,
        currentUser.employeeId || "",
        claim.department,
        claim.designation,
        claim.tourStartDate,
        claim.tourEndDate,
        "N/A",
        "N/A",
        claim.narration,
        "0.00",
        advStr,
        claim.status,
        finalBalStr,
        "No attachments"
      ]);
    } else {
      claim.lineItems.forEach((item) => {
        let fullRefUrl = "N/A";
        if (item.proofUrl) {
          const relative = getRelativeProofUrl(item.proofUrl);
          fullRefUrl = relative.startsWith("http") ? relative : `${window.location.origin}${relative}`;
        }
        rows.push([
          claim.claimNumber,
          claim.employeeName,
          currentUser.employeeId || "",
          claim.department,
          claim.designation,
          claim.tourStartDate,
          claim.tourEndDate,
          item.expenseDate,
          item.category,
          item.narration,
          item.amount.toFixed(2),
          advStr,
          claim.status,
          finalBalStr,
          fullRefUrl
        ]);
      });
    }
  });

  const csvContent = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","),
    ...rows.map(row => row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  const formattedDate = new Date().toISOString().split('T')[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `KrystalRef_Accounts_Claims_${currentUser.name.trim().replace(/\s+/g, '_')}_${formattedDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function EmployeePanel({
  currentUser,
  claims,
  onLogNewClaim,
  onEditClaim,
}: EmployeePanelProps) {
  const [expandedClaimNo, setExpandedClaimNo] = useState<string | null>(null);
  const [userEmails, setUserEmails] = useState<any[]>([]);

  useEffect(() => {
    const loadEmails = async () => {
      const emailAddr = currentUser.email || `${currentUser.name.toLowerCase().replace(/\s+/g, ".")}@krystalpath.com`;
      try {
        const mails = await dbBroker.getEmailsForUser(emailAddr);
        // Sort newest first
        mails.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
        setUserEmails(mails);
      } catch (err) {
        console.error("Failed to load user emails inside EmployeePanel:", err);
      }
    };
    loadEmails();
  }, [currentUser.email, currentUser.name, claims]);

  // Filter claims to only show those belonging to this user
  const myClaims = claims.filter(
    (c) =>
      c.employeeUid === currentUser.userId &&
      c.employeeName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()
  );

  // General statistics calculations
  const approvedClaims = myClaims.filter((c) => c.status === "Approved");
  const totalApprovedSpending = approvedClaims.reduce((acc, c) => acc + c.totalExpenseAmount, 0);
  const totalCreditsPending = myClaims
    .filter((c) => c.status === "Pending" || c.status === "Resubmitted")
    .reduce((acc, c) => acc + c.totalExpenseAmount, 0);

  const toggleExpand = (claimNumber: string) => {
    if (expandedClaimNo === claimNumber) {
      setExpandedClaimNo(null);
    } else {
      setExpandedClaimNo(claimNumber);
    }
  };

  const getStatusStyle = (status: Claim["status"]) => {
    switch (status) {
      case "Approved":
        return "status-approved px-3 py-1 rounded text-[10px] font-bold uppercase transition-all duration-150";
      case "Rejected":
        return "status-rejected px-3 py-1 rounded text-[10px] font-bold uppercase transition-all duration-150";
      case "Resubmitted":
      case "Pending":
      default:
        return "status-pending px-3 py-1 rounded text-[10px] font-bold uppercase transition-all duration-150";
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Title block with Neon statistics deck */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass-panel p-5 rounded-2xl shadow-md">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-widest text-[#00f2ff] drop-shadow neon-glow-cyan">
            Employee Deck: Expense Operations
          </h2>
          <p className="text-[10px] text-zinc-400 font-mono mt-0.5 uppercase font-semibold">
            Logged-In Identity: {currentUser.name} {currentUser.employeeId ? `(ID: ${currentUser.employeeId})` : ""} {currentUser.designation ? `| ${currentUser.designation}` : ""} | Rank: {currentUser.department} Division
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => downloadClaimsExcel(myClaims, currentUser)}
            disabled={myClaims.length === 0}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-[#00f2ff]/30 hover:border-[#00f2ff]/60 text-zinc-300 text-xs font-mono uppercase tracking-widest rounded-xl transition-all duration-200 select-none"
            title="Download past claims report formatted for accounting systems in Excel format"
          >
            <Download className="w-4 h-4 text-[#00f2ff]" /> Download Accounts Format (Excel)
          </button>

          <button
            onClick={onLogNewClaim}
            className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-400 hover:from-cyan-500 hover:to-cyan-300 text-black font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all hover:scale-105 active:scale-95 shadow shadow-cyan-950 duration-200"
          >
            <Plus className="w-4 h-4" /> Log new travel claim
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total approved spendings */}
        <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-emerald-500">
          <div>
            <span className="text-[10px] font-mono text-zinc-400 font-semibold uppercase tracking-widest block">
              Approved spent payout
            </span>
            <span className="text-2xl font-mono text-emerald-400 font-bold">
              ₹{totalApprovedSpending.toFixed(2)}
            </span>
          </div>
          <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-lg text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Pending approvals */}
        <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-yellow-500">
          <div>
            <span className="text-[10px] font-mono text-zinc-400 font-semibold uppercase tracking-widest block">
              In-Approval pipeline
            </span>
            <span className="text-2xl font-mono text-yellow-400 font-bold">
              ₹{totalCreditsPending.toFixed(2)}
            </span>
          </div>
          <div className="p-3 bg-yellow-950/30 border border-yellow-500/20 rounded-lg text-yellow-500">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Counter of cases */}
        <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-cyan-500">
          <div>
            <span className="text-[10px] font-mono text-zinc-400 font-semibold uppercase tracking-widest block">
              Claims submitted
            </span>
            <span className="text-2xl font-mono text-cyan-400 font-bold neon-glow-cyan">
              {myClaims.length}
            </span>
          </div>
          <div className="p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-lg text-cyan-400">
            <FolderOpen className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Corporate Communications Inbox */}
      <div className="glass-panel p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-cyan-950/40 border border-cyan-500/35 text-cyan-400 rounded-lg">
              <Mail className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-[#00f2ff] drop-shadow neon-glow-cyan">
                Inbox: Auditor Mailers & Alerts
              </h4>
              <p className="text-[10px] font-mono text-zinc-400 uppercase">
                Official communication logs dispatched to: {currentUser.email || "N/A"}
              </p>
            </div>
          </div>
          <span className="text-[9px] font-mono bg-zinc-900 border border-zinc-805 px-2 py-0.5 rounded text-zinc-500">
            SECURE SMTP fallback-buffer
          </span>
        </div>

        {userEmails.length === 0 ? (
          <div className="text-center py-6 text-xs text-zinc-650 font-mono uppercase">
            ✉️ No official status letters or mailers received.
          </div>
        ) : (
          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
            {userEmails.map((email: any) => (
              <div 
                key={email.id} 
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  email.status === "Approved" 
                    ? "bg-emerald-950/10 border-emerald-500/20" 
                    : "bg-red-950/10 border-red-500/20"
                }`}
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded ${
                      email.status === "Approved" ? "bg-emerald-950 border border-emerald-500 text-emerald-400 animate-pulse" : "bg-red-950 border border-red-500 text-red-100"
                    }`}>
                      {email.status === "Approved" ? "APPROVED LETTER" : "REJECTION LETTER"}
                    </span>
                    <span className="font-mono text-zinc-400 text-[10px]">CLAIM: {email.claimNumber}</span>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500">
                    Received: {new Date(email.sentAt).toLocaleTimeString()} | {new Date(email.sentAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-zinc-300 font-sans leading-relaxed whitespace-pre-line text-xs pl-1">
                  {email.body}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claims List Section with graceful mobile collapse and information density card layout */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-widest pb-1.5 border-b border-zinc-900 block max-w-max">
          Your Travel Claims Status LEDGER
        </h3>

        {myClaims.length === 0 ? (
          <div className="text-center py-12 bg-zinc-950/30 border border-transparent rounded-2xl border-dashed border-zinc-800">
            <Receipt className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No Travel Claims Registered Yet.</p>
            <p className="text-[10px] text-zinc-600 mt-1 uppercase">
              Click "Log new travel claim" above to start your first tour reimbursement logging.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {myClaims.map((claim) => {
              const parsedDate = new Date(claim.createdAt).toLocaleDateString();
              const isExpanded = expandedClaimNo === claim.claimNumber;

              return (
                <div
                  key={claim.claimNumber}
                  className="glass-panel hover:border-white/20 rounded-2xl overflow-hidden transition-all duration-200 shadow-xl"
                >
                  {/* Ledger Card Compact layout */}
                  <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-white tracking-wide">
                          {claim.claimNumber}
                        </span>
                        <span className={getStatusStyle(claim.status)}>
                          {claim.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 font-sans">
                        <CalendarDays className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {claim.tourStartDate} to {claim.tourEndDate}
                        </span>
                        <span className="text-zinc-650">|</span>
                        <span>Logged: {parsedDate}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 md:grid-cols-3 md:gap-4 text-center md:text-right">
                      <div className="bg-zinc-900/40 p-2 md:p-0 md:bg-transparent rounded">
                        <span className="text-[9px] font-mono text-zinc-500 block uppercase">Spent</span>
                        <span className="text-sm font-mono font-bold text-zinc-200">
                          ₹{claim.totalExpenseAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-zinc-900/40 p-2 md:p-0 md:bg-transparent rounded">
                        <span className="text-[9px] font-mono text-zinc-500 block uppercase">Advance</span>
                        <span className="text-sm font-mono text-zinc-400">
                          {claim.advanceAmount === 0 ? "" : `₹${claim.advanceAmount.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="bg-zinc-900/40 p-2 md:p-0 md:bg-transparent rounded">
                        <span className="text-[9px] font-mono text-zinc-500 block uppercase">Payout</span>
                        <span
                          className={`text-sm font-mono font-bold ${
                            claim.finalBalance >= 0 ? "text-emerald-400 neon-text-green" : "text-pink-400 neon-text-magenta"
                          }`}
                        >
                          ₹{claim.finalBalance.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-2 md:pt-0 border-t border-zinc-900 md:border-none">
                      {claim.status === "Rejected" && (
                        <button
                          onClick={() => onEditClaim(claim)}
                          className="px-3.5 py-1.5 bg-pink-600 hover:bg-pink-500 text-black font-extrabold uppercase text-[10px] tracking-wider rounded-lg transition-all flex items-center gap-1 hover:scale-105"
                        >
                          Correct Ledger <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => toggleExpand(claim.claimNumber)}
                        className="px-3.5 py-1.5 border border-zinc-700 hover:border-cyan-400/50 text-xs font-mono text-zinc-400 rounded-lg hover:bg-zinc-900 transition-all"
                      >
                        {isExpanded ? "Collapse Details" : "Expand Ledger"}
                      </button>
                    </div>
                  </div>

                  {/* Written Rejection Feedback Banner */}
                  {claim.status === "Rejected" && claim.rejectionReason && (
                    <div className="px-4 py-2 bg-pink-950/20 border-t border-neutral-900 text-xs text-pink-400 flex items-start gap-1.5">
                      <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-mono uppercase text-[10px] tracking-wider block">
                          REJECTION MANDATE: ACTION REQUIRED
                        </strong>
                        <p className="text-zinc-300 italic">"{claim.rejectionReason}"</p>
                      </div>
                    </div>
                  )}

                  {/* Dropdown breakdown items */}
                  {isExpanded && (
                    <div className="px-4 pb-5 pt-3 bg-zinc-950/40 border-t border-neutral-900">
                      <h4 className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest mb-3">
                        Detailed Ledger Breakdowns
                      </h4>

                      <div className="overflow-x-auto rounded-xl border border-zinc-900">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-zinc-950 text-zinc-500 font-mono">
                              <th className="p-3">Category</th>
                              <th className="p-3">Expense Date</th>
                              <th className="p-3">Narration Detail</th>
                              <th className="p-3">Bill Receipt</th>
                              <th className="p-3 text-center">Receipt Status</th>
                              <th className="p-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900">
                            {claim.lineItems.map((item) => (
                              <tr key={item.id} className="hover:bg-zinc-900/20 text-zinc-300">
                                <td className="p-3 font-mono text-cyan-300">{item.category}</td>
                                <td className="p-3 font-mono">{item.expenseDate}</td>
                                <td className="p-3 text-zinc-400">
                                  <div>{item.narration}</div>
                                  {item.status === "Rejected" && item.rejectionReason && (
                                    <div className="mt-1.5 p-2 bg-pink-950/20 border border-pink-500/20 rounded text-[11px] text-pink-400 font-mono italic max-w-sm">
                                      ✗ Auditor directive: "{item.rejectionReason}"
                                    </div>
                                  )}
                                </td>
                                <td className="p-3">
                                  {item.proofUrl ? (
                                    <a
                                      href={getRelativeProofUrl(item.proofUrl)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-purple-400 font-mono underline hover:text-purple-300"
                                    >
                                      View Statement ↗
                                    </a>
                                  ) : (
                                    <span className="text-zinc-650">No receipt data</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {item.status === "Approved" ? (
                                    <span className="px-2 py-0.5 text-[9px] font-mono bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 rounded uppercase font-bold tracking-wide">
                                      ✓ Approved
                                    </span>
                                  ) : item.status === "Rejected" ? (
                                    <span className="px-2 py-0.5 text-[9px] font-mono bg-pink-950/40 text-pink-400 border border-pink-500/30 rounded uppercase font-bold tracking-wide">
                                      ✗ Rejected
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-[9px] font-mono bg-yellow-950/20 text-yellow-500 border border-yellow-500/10 rounded uppercase font-bold tracking-wide">
                                      Pending
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono text-white font-bold">
                                  ₹{item.amount.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4 p-3.5 bg-zinc-900/20 rounded-xl border border-zinc-800 text-xs">
                        <span className="font-mono text-zinc-400 uppercase text-[9px] block tracking-wide">
                          Claim General Synopsis
                        </span>
                        <p className="text-zinc-300 italic font-sans mt-1">"{claim.narration}"</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
