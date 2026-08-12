import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  connectDatabase,
  databaseState
} from "./src/config/db.js";

import authRoutes, {
  bootstrapAuthorizedAdmins
} from "./src/routes/auth.routes.js";

import memberRoutes from "./src/routes/member.routes.js";
import adminRoutes from "./src/routes/admin.routes.js";

const app = express();

const allowed = () =>
  [
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
    "http://localhost:5173",
    "http://localhost:5174"
  ].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return cb(null, true);
      
      // Check allowlist or mobile/local device schemes
      if (
        allowed().includes(origin) ||
        origin.startsWith("capacitor://") ||
        origin.startsWith("http://localhost")
      ) {
        return cb(null, true);
      }
      
      cb(new Error("CORS origin not allowed"));
    }
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) =>
  res.json({
    service: "unique-youths-backend",
    status: "running"
  })
);

app.get("/health", (_req, res) =>
  res.json({
    status: "UP",
    service: "unique-youths-backend",
    database: databaseState()
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/member", memberRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, _req, res, _next) =>
  res.status(500).json({
    message: err.message || "Internal server error"
  })
);

const port = process.env.PORT || 3000;

connectDatabase()
  .then(async () => {
    await bootstrapAuthorizedAdmins();

    app.listen(
      port,
      "0.0.0.0",
      () => console.log(`API listening on ${port}`)
    );
  })
  .catch(e => {
    console.error("Startup failed", e);
    process.exit(1);
  });