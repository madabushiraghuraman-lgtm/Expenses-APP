import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { db, auth, handleFirestoreError, OperationType } from "./firebase";
import { UserProfile, Claim, SystemSettings } from "./types";

// Timeout wrapper for Firestore requests to prevent long-hanging operations in sparse connectivity/offline sandboxes
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 3000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("FIRESTORE_TIMEOUT: Offline or slow server connection. Bypassing instantly."));
    }, timeoutMs);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const DEFAULT_SETTINGS: SystemSettings = {
  customCategories: ["Petrol", "Internet", "Stationery"],
  categoryRights: {
    Petrol: ["Operations", "Marketing"],
    Internet: ["IT", "Operations"],
    Stationery: ["HR", "Finance", "Marketing"],
  },
  nextSerial: 1,
  globalPasscode: "123456",
  superAdminPasscode: "sapc12",
  auditorAdminPasscode: "aapc12",
  departments: ["IT", "HR", "Operations", "Finance", "Marketing"],
  autoTriggerEmail: true,
  senderEmail: "Krystal Path Travel <expenses@yourdomain.com>",
};

const DEFAULT_CLAIMS = (empUid: string): Claim[] => [
  {
    id: "KRPLTR01",
    claimNumber: "KRPLTR01",
    employeeUid: empUid,
    employeeName: "Employee",
    employeePhone: "+919876543210",
    department: "IT",
    designation: "Senior Account Executive",
    status: "Approved",
    tourStartDate: "2026-05-10",
    tourEndDate: "2026-05-14",
    advanceAmount: 500,
    totalExpenseAmount: 750,
    finalBalance: 250,
    narration: "Aesthetic client acquisition tour in Mumbai Hub zone.",
    createdAt: "2026-05-14T10:00:00Z",
    updatedAt: "2026-05-15T15:00:00Z",
    lineItems: [
      {
        id: "l1",
        category: "Food",
        expenseDate: "2026-05-11",
        amount: 150,
        narration: "Corporate dinner with client executives in BKC.",
        proofUrl: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=500&auto=format&fit=crop&q=60",
        proofName: "corporate_dinner_bkc.jpg",
      },
      {
        id: "l2",
        category: "Hotel",
        expenseDate: "2026-05-11",
        amount: 400,
        narration: "Stay at Taj Lands End deluxe business lodging.",
        proofUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500&auto=format&fit=crop&q=60",
        proofName: "taj_hotel_stay.jpg",
      },
      {
        id: "l3",
        category: "Others",
        expenseDate: "2026-05-12",
        amount: 200,
        narration: "Local transportation and taxi receipts travel log.",
        proofUrl: "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=500&auto=format&fit=crop&q=60",
        proofName: "cab_fare_receipt.jpg",
      },
    ],
  },
  {
    id: "KRPLTR02",
    claimNumber: "KRPLTR02",
    employeeUid: empUid,
    employeeName: "Employee",
    employeePhone: "+919876543210",
    department: "IT",
    designation: "Senior Account Executive",
    status: "Rejected",
    tourStartDate: "2026-05-16",
    tourEndDate: "2026-05-18",
    advanceAmount: 800,
    totalExpenseAmount: 400,
    finalBalance: -400,
    narration: "Industrial conference and vendor evaluation tour Bengaluru.",
    rejectionReason: "Missing copy of physical cab receipt logs. Food narration is too brief.",
    createdAt: "2026-05-18T09:00:00Z",
    updatedAt: "2026-05-19T10:00:00Z",
    lineItems: [
      {
        id: "l4",
        category: "Travel",
        expenseDate: "2026-05-17",
        amount: 300,
        narration: "Shatabdi Express train ticket booking.",
        proofUrl: "https://images.unsplash.com/photo-1540340061722-9293d516300b?w=500&auto=format&fit=crop&q=60",
        proofName: "shatabdi_express_ticket.pdf",
      },
      {
        id: "l5",
        category: "Others",
        expenseDate: "2026-05-18",
        amount: 100,
        narration: "Conference pass entry token.",
        proofUrl: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=500&auto=format&fit=crop&q=60",
        proofName: "tech_summit_pass.pdf",
      },
    ],
  },
];

export const dbBroker = {
  // Ensure authenticated
  async ensureAuthenticated(): Promise<string> {
    try {
      if (!auth.currentUser) {
        const cred = await signInAnonymously(auth);
        return cred.user.uid;
      }
      return auth.currentUser.uid;
    } catch (err) {
      console.warn("Firebase Auth Anonymous login failed, using local fallback device token:", err);
      let localUid = localStorage.getItem("krystal_local_uid");
      if (!localUid) {
        localUid = "usr_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
        localStorage.setItem("krystal_local_uid", localUid);
      }
      return localUid;
    }
  },

  // Seed default data if Firestore is empty
  async seedIfNeeded(activeUid: string): Promise<void> {
    try {
      console.log("[SEEDING DEBUG] Checking if database is empty by fetching users...");
      const usersSnap = await withTimeout(getDocs(collection(db, "users")));
      if (usersSnap.empty) {
        // Create user matching current auth UID as Employee so evaluation flows cleanly on first load
        const activeProfile: UserProfile = {
          userId: activeUid,
          name: "Employee",
          phone: "+919876543210",
          email: "employee@krystalpath.com",
          role: "employee",
          department: "IT",
          createdAt: new Date().toISOString(),
        };
        console.log("[SEEDING DEBUG] Writing active profile user doc to /users/" + activeUid);
        try {
          await setDoc(doc(db, "users", activeUid), activeProfile);
          console.log("[SEEDING DEBUG] /users/" + activeUid + " successfully written!");
        } catch (e: any) {
          console.error("[SEEDING DEBUG] /users write partition failed:", e);
          throw e;
        }

        // Seed default settings
        console.log("[SEEDING DEBUG] Writing global settings to /settings/global");
        try {
          await setDoc(doc(db, "settings", "global"), DEFAULT_SETTINGS);
          console.log("[SEEDING DEBUG] /settings/global successfully written!");
        } catch (e: any) {
          console.error("[SEEDING DEBUG] /settings write partition failed:", e);
          throw e;
        }

        // Seed default claims linked to the active user to make it instantly visible
        const seedClaims = DEFAULT_CLAIMS(activeUid);
        console.log("[SEEDING DEBUG] Writing " + seedClaims.length + " default claims to /claims/...");
        for (const claim of seedClaims) {
          try {
            await setDoc(doc(db, "claims", claim.claimNumber), claim);
            console.log("[SEEDING DEBUG] Claim " + claim.claimNumber + " successfully written!");
          } catch (e: any) {
            console.error("[SEEDING DEBUG] /claims/ write partition failed for " + claim.claimNumber + ":", e);
            throw e;
          }
        }
      } else {
        console.log("[SEEDING DEBUG] Database is not empty, skipping seed.");
      }
    } catch (err: any) {
      console.error("Database seeding issue:", err);
    }
  },

  // --- USERS SECTION ---
  async getUsers(): Promise<UserProfile[]> {
    try {
      const activeUid = await this.ensureAuthenticated();
      await this.seedIfNeeded(activeUid).catch(() => {});
      const snap = await withTimeout(getDocs(collection(db, "users")));
      const list: UserProfile[] = [];
      snap.forEach((doc) => {
        list.push(doc.data() as UserProfile);
      });
      localStorage.setItem("krystal_cached_users", JSON.stringify(list));
      return list;
    } catch (err: any) {
      console.warn("Firestore getUsers failed, falling back to local cache:", err);
      const cached = localStorage.getItem("krystal_cached_users");
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }
      return [
        {
          userId: "sandbox_employee",
          name: "Rajesh Kumar (Employee)",
          phone: "+919876543210",
          email: "rajesh.kumar@krystalpath.com",
          role: "employee",
          department: "Sales",
          createdAt: new Date().toISOString(),
        }
      ];
    }
  },

  async saveUser(user: UserProfile): Promise<void> {
    try {
      await this.ensureAuthenticated();
      await setDoc(doc(db, "users", user.userId), user);
    } catch (err) {
      console.warn("Firestore saveUser failed, using cached state:", err);
    } finally {
      // Always update cache
      const cached = localStorage.getItem("krystal_cached_users");
      let list: UserProfile[] = [];
      if (cached) {
        try { list = JSON.parse(cached); } catch {}
      }
      list = list.filter(u => u.userId !== user.userId);
      list.push(user);
      localStorage.setItem("krystal_cached_users", JSON.stringify(list));
    }
  },

  async deleteUser(userId: string): Promise<void> {
    try {
      await this.ensureAuthenticated();
      await deleteDoc(doc(db, "users", userId));
    } catch (err) {
      console.warn("Firestore deleteUser failed, using cached state updates:", err);
    } finally {
      const cached = localStorage.getItem("krystal_cached_users");
      if (cached) {
        try {
          let list: UserProfile[] = JSON.parse(cached);
          list = list.filter(u => u.userId !== userId);
          localStorage.setItem("krystal_cached_users", JSON.stringify(list));
        } catch {}
      }
    }
  },

  async findUserByPhone(phone: string): Promise<UserProfile | undefined> {
    try {
      await this.ensureAuthenticated();
      const q = query(collection(db, "users"), where("phone", "==", phone));
      const snap = await withTimeout(getDocs(q));
      if (!snap.empty) {
        return snap.docs[0].data() as UserProfile;
      }
      return undefined;
    } catch (err) {
      console.warn("Firestore findUserByPhone failed, checking cache:", err);
      const cached = localStorage.getItem("krystal_cached_users");
      if (cached) {
        try {
          const list: UserProfile[] = JSON.parse(cached);
          return list.find(u => u.phone === phone);
        } catch {}
      }
      return undefined;
    }
  },

  async findUserByNameAndDept(name: string, department: string): Promise<UserProfile | undefined> {
    try {
      await this.ensureAuthenticated();
      const q = query(
        collection(db, "users"),
        where("name", "==", name),
        where("department", "==", department)
      );
      const snap = await withTimeout(getDocs(q));
      if (!snap.empty) {
        return snap.docs[0].data() as UserProfile;
      }
      return undefined;
    } catch (err) {
      console.warn("User lookup by name and department failed, checking cache:", err);
      const cached = localStorage.getItem("krystal_cached_users");
      if (cached) {
        try {
          const list: UserProfile[] = JSON.parse(cached);
          return list.find(u => u.name === name && u.department === department);
        } catch {}
      }
      return undefined;
    }
  },

  async findUserByNameAndEmpId(name: string, employeeId: string): Promise<UserProfile | undefined> {
    try {
      await this.ensureAuthenticated();
      const q = query(
        collection(db, "users"),
        where("name", "==", name),
        where("employeeId", "==", employeeId)
      );
      const snap = await withTimeout(getDocs(q));
      if (!snap.empty) {
        return snap.docs[0].data() as UserProfile;
      }
      return undefined;
    } catch (err) {
      console.warn("User lookup by name and employeeId failed, checking cache:", err);
      const cached = localStorage.getItem("krystal_cached_users");
      if (cached) {
        try {
          const list: UserProfile[] = JSON.parse(cached);
          return list.find(u => u.name.toLowerCase() === name.toLowerCase() && u.employeeId === employeeId);
        } catch {}
      }
      return undefined;
    }
  },

  // --- CLAIMS SECTION ---
  async getClaims(currentUser: UserProfile | null): Promise<Claim[]> {
    try {
      const activeUid = await this.ensureAuthenticated();
      await this.seedIfNeeded(activeUid).catch(() => {});
      
      const ref = collection(db, "claims");
      let q = query(ref);
      
      // Enforce security check: employees only pull their own claims
      if (currentUser && currentUser.role === "employee") {
        q = query(ref, where("employeeUid", "==", currentUser.userId));
      }
      
      const snap = await withTimeout(getDocs(q));
      let list: Claim[] = [];
      snap.forEach((doc) => {
        list.push(doc.data() as Claim);
      });

      // Extra secure filtering layer: If employee, only return claims matching their specific name
      if (currentUser && currentUser.role === "employee") {
        list = list.filter(c => c.employeeName.trim().toLowerCase() === currentUser.name.trim().toLowerCase());
      }

      localStorage.setItem(`krystal_cached_claims_${currentUser?.userId || "all"}`, JSON.stringify(list));
      return list;
    } catch (err) {
      console.warn("Firestore getClaims failed, checking local cache fallback:", err);
      const cached = localStorage.getItem(`krystal_cached_claims_${currentUser?.userId || "all"}`);
      let list: Claim[] = [];
      if (cached) {
        try {
          list = JSON.parse(cached);
        } catch {}
      } else {
        const activeUid = currentUser?.userId || "sandbox_employee";
        list = DEFAULT_CLAIMS(activeUid);
      }
      if (currentUser && currentUser.role === "employee") {
        list = list.filter(c => c.employeeName.trim().toLowerCase() === currentUser.name.trim().toLowerCase());
      }
      return list;
    }
  },

  async saveClaim(claim: Claim): Promise<void> {
    try {
      await this.ensureAuthenticated();
      await setDoc(doc(db, "claims", claim.claimNumber), claim);
    } catch (err) {
      console.warn("Firestore saveClaim failed, saved locally to cache:", err);
    } finally {
      // Update local storage caches
      const allKey = "krystal_cached_claims_all";
      const cachedAll = localStorage.getItem(allKey);
      let allList: Claim[] = [];
      if (cachedAll) {
        try { allList = JSON.parse(cachedAll); } catch {}
      }
      allList = allList.filter(c => c.claimNumber !== claim.claimNumber);
      allList.push(claim);
      localStorage.setItem(allKey, JSON.stringify(allList));

      if (claim.employeeUid) {
        const empKey = `krystal_cached_claims_${claim.employeeUid}`;
        const cachedEmp = localStorage.getItem(empKey);
        let empList: Claim[] = [];
        if (cachedEmp) {
          try { empList = JSON.parse(cachedEmp); } catch {}
        }
        empList = empList.filter(c => c.claimNumber !== claim.claimNumber);
        empList.push(claim);
        localStorage.setItem(empKey, JSON.stringify(empList));
      }
    }
  },

  async deleteClaim(claimId: string): Promise<void> {
    try {
      await this.ensureAuthenticated();
      await deleteDoc(doc(db, "claims", claimId));
    } catch (err) {
      console.warn("Firestore deleteClaim failed, executing in local cache only:", err);
    } finally {
      const allKey = "krystal_cached_claims_all";
      const cachedAll = localStorage.getItem(allKey);
      if (cachedAll) {
        try {
          let list: Claim[] = JSON.parse(cachedAll);
          list = list.filter(c => c.claimNumber !== claimId);
          localStorage.setItem(allKey, JSON.stringify(list));
        } catch {}
      }
    }
  },

  async getNextClaimNumber(): Promise<string> {
    try {
      const settings = await this.getSettings();
      const num = settings.nextSerial;
      const padded = String(num).padStart(2, "0");
      const claimNo = `KRPLTR${padded}`;

      settings.nextSerial = num + 1;
      await this.saveSettings(settings);

      return claimNo;
    } catch (err) {
      console.warn("getNextClaimNumber error, falling back locally:", err);
      return `KRPLTR${Math.floor(Math.random() * 90) + 10}`;
    }
  },

  // --- SYSTEM SETTINGS ---
  async getSettings(): Promise<SystemSettings> {
    try {
      await this.ensureAuthenticated();
      const snap = await withTimeout(getDoc(doc(db, "settings", "global")));
      if (snap.exists()) {
        const data = snap.data() as SystemSettings;
        if (!data.globalPasscode) {
          data.globalPasscode = "123456";
        }
        if (!data.superAdminPasscode) {
          data.superAdminPasscode = "sapc12";
        }
        if (!data.auditorAdminPasscode) {
          data.auditorAdminPasscode = "aapc12";
        }
        if (data.autoTriggerEmail === undefined) {
          data.autoTriggerEmail = true;
        }
        if (!data.senderEmail) {
          data.senderEmail = "Krystal Path Travel <expenses@yourdomain.com>";
        }
        localStorage.setItem("krystal_cached_settings", JSON.stringify(data));
        return data;
      } else {
        await setDoc(doc(db, "settings", "global"), DEFAULT_SETTINGS).catch(() => {});
        localStorage.setItem("krystal_cached_settings", JSON.stringify(DEFAULT_SETTINGS));
        return DEFAULT_SETTINGS;
      }
    } catch (err) {
      console.warn("Firestore settings/global load failed, using local/fallback settings:", err);
      const cached = localStorage.getItem("krystal_cached_settings");
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: SystemSettings): Promise<void> {
    try {
      await this.ensureAuthenticated();
      await setDoc(doc(db, "settings", "global"), settings);
    } catch (err) {
      console.warn("Firestore saveSettings failed, updating local cache/state only:", err);
    } finally {
      localStorage.setItem("krystal_cached_settings", JSON.stringify(settings));
    }
  },

  async sendEmail(email: {
    id: string;
    to: string;
    toName: string;
    subject: string;
    body: string;
    claimNumber: string;
    status: string;
    sentAt: string;
  }): Promise<void> {
    try {
      await this.ensureAuthenticated();
      await setDoc(doc(db, "emails", email.id), email);
    } catch (e) {
      console.warn("Saving email to Firestore failed, storing in fallback local cache:", e);
    } finally {
      const cached = localStorage.getItem("krystal_cached_emails");
      let list: any[] = [];
      if (cached) {
        try { list = JSON.parse(cached); } catch {}
      }
      list.push(email);
      localStorage.setItem("krystal_cached_emails", JSON.stringify(list));
    }
  },

  async getEmailsForUser(emailAddress: string): Promise<any[]> {
    try {
      await this.ensureAuthenticated();
      const snap = await withTimeout(getDocs(collection(db, "emails")));
      const list: any[] = [];
      snap.forEach((d) => {
        const item = d.data();
        if (item.to?.toLowerCase() === emailAddress.toLowerCase()) {
          list.push(item);
        }
      });
      return list;
    } catch (e) {
      console.warn("Fetching emails from Firestore failed, checking cached emails:", e);
      const cached = localStorage.getItem("krystal_cached_emails");
      if (cached) {
        try {
          const list = JSON.parse(cached);
          return list.filter((m: any) => m.to?.toLowerCase() === emailAddress.toLowerCase());
        } catch {}
      }
      return [];
    }
  },

  async factoryReset(activeUid: string): Promise<UserProfile> {
    try {
      await this.ensureAuthenticated();
      
      // 1. Purge all existing users
      const usersSnap = await withTimeout(getDocs(collection(db, "users")));
      for (const d of usersSnap.docs) {
        await deleteDoc(doc(db, "users", d.id));
      }

      // 2. Clear claims
      const claimsSnap = await withTimeout(getDocs(collection(db, "claims")));
      for (const d of claimsSnap.docs) {
        await deleteDoc(doc(db, "claims", d.id));
      }

      // 3. Reset settings
      await setDoc(doc(db, "settings", "global"), DEFAULT_SETTINGS);

      // 4. Seed activeUid profile as Employee
      const activeProfile: UserProfile = {
        userId: activeUid,
        name: "Employee",
        phone: "+919876543210",
        role: "employee",
        department: "IT",
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "users", activeUid), activeProfile);

      // Seed default claims linked to activeUid
      const seedClaims = DEFAULT_CLAIMS(activeUid);
      for (const claim of seedClaims) {
        await setDoc(doc(db, "claims", claim.claimNumber), claim);
      }

      return activeProfile;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "factoryReset");
    }
  },
};
