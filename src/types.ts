export type UserRole = "employee" | "auditor" | "super_admin";

export type ClaimStatus = "Pending" | "Approved" | "Rejected" | "Resubmitted";

export interface UserProfile {
  userId: string;
  name: string;
  phone: string;
  role: UserRole;
  department: string;
  createdAt: string;
  autoUnlock?: boolean;
  employeeId?: string;
}

export interface ExpenseLineItem {
  id: string;
  category: string; // "Food" | "Travel" | "Hotel" | "Others" | Custom variable
  expenseDate: string;
  amount: number;
  narration: string;
  proofUrl: string;
  proofName: string;
  status?: "Approved" | "Rejected" | "Pending";
}

export interface Claim {
  id: string; // Map to claimNumber or docId
  claimNumber: string; // KRPLTR01, KRPLTR02, etc.
  employeeUid: string;
  employeeName: string;
  employeePhone: string;
  department: string;
  designation: string;
  status: ClaimStatus;
  tourStartDate: string;
  tourEndDate: string;
  advanceAmount: number;
  totalExpenseAmount: number;
  finalBalance: number; // calculated as Total - Advance (warnings shown)
  narration: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  lineItems: ExpenseLineItem[];
}

export interface SystemSettings {
  customCategories: string[];
  categoryRights: Record<string, string[]>; // Mapping: categoryName -> array of departments
  nextSerial: number;
  globalPasscode?: string;
  superAdminPasscode?: string;
  auditorAdminPasscode?: string;
  departments?: string[];
}
