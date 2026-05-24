import express from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { createServer as createViteServer } from "vite";
import { db as firestoreDb } from "./src/firebase";
import { doc, getDoc } from "firebase/firestore";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enhance payload size limits for base64 travel receipt uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // API endpoint for receipt/proof uploads
  app.post("/api/upload", (req, res) => {
    try {
      const { fileName, fileType, fileData } = req.body;

      if (!fileName || !fileData) {
        return res.status(400).json({ error: "Missing file credentials or data." });
      }

      // Extract real base64 content if it contains headers
      const base64Content = fileData.includes(";base64,")
        ? fileData.split(";base64,").pop()
        : fileData;

      const buffer = Buffer.from(base64Content, "base64");
      const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
      const filePath = path.join(uploadsDir, safeName);

      fs.writeFileSync(filePath, buffer);

      const fileUrl = `/api/uploads/${safeName}`;
      res.json({ success: true, fileUrl, fileName: safeName });
    } catch (error) {
      console.error("Upload error details:", error);
      res.status(500).json({ error: "Failed to upload file to the server." });
    }
  });

  // Serve uploaded files statically
  app.use("/api/uploads", express.static(uploadsDir));

  // POST /api/auth/passcode-login
  app.post("/api/auth/passcode-login", async (req, res) => {
    try {
      const providedPasscode = String(req.body.passcode || "").trim();

      if (!providedPasscode) {
        return res.status(400).json({ message: "Passcode is required" });
      }

      // Default backup values matching the requested configuration
      let superAdmin = "abc123";
      let auditor = "xyz123";

      // Attempt to read customized settings from Firestore database if system is online
      try {
        // Check settings/global layout
        const globalRef = doc(firestoreDb, "settings", "global");
        const globalSnap = await getDoc(globalRef);
        if (globalSnap && globalSnap.exists()) {
          const data = globalSnap.data();
          if (data?.superAdminPasscode) superAdmin = String(data.superAdminPasscode);
          if (data?.auditorAdminPasscode) auditor = String(data.auditorAdminPasscode);
        }
      } catch (dbErr) {
        console.warn("[Passcode Login API] Secure database lookup bypassed, using standard default keys:", dbErr);
      }

      let assignedRole: string | null = null;

      // Check which role matches the provided passcode
      if (providedPasscode === superAdmin) {
        assignedRole = "super_admin";
      } else if (providedPasscode === auditor) {
        assignedRole = "auditor";
      }

      // If it doesn't match either, deny access
      if (!assignedRole) {
        return res.status(401).json({ message: "Invalid administrator passcode" });
      }

      // Generate a token embedded with the matched role
      const token = jwt.sign(
        { role: assignedRole, systemAccess: true },
        process.env.JWT_SECRET || "krystal_secure_jwt_secret_54321",
        { expiresIn: "8h" }
      );

      // Send token and role back to the mobile / web client
      return res.status(200).json({
        token,
        role: assignedRole,
        message: `Logged in successfully as ${assignedRole}`
      });

    } catch (error: any) {
      console.error("Passcode verification error:", error);
      return res.status(500).json({ message: "Server error during passcode verification" });
    }
  });

  // Health and verification check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Integrate Vite Dev Server middleware in non-production mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production-ready static components
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Fullstack Entry] Cyberpunk Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start full-stack Express engine:", err);
});
