import express from "express";
import { spawn } from "child_process";
import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const PROJECT_PATH = process.env.PROJECT_PATH;
const PROJECT = process.env.PROJECT;
const FILE = process.env.FILE;
const PORT = process.env.PORT;

// Compose absolute path inside container
const projectRoot = path.join(PROJECT_PATH, PROJECT);
const brsFilePath = path.join(projectRoot, FILE);

// Basic checks
if (!fs.existsSync(brsFilePath)) {
  console.warn(`Warning: BrightScript file not found at ${brsFilePath}`);
  // we continue — browser will show error if missing
}

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files *first*
app.use(express.static(path.join(__dirname, "public")));

// Route to trigger BrightScript restart manually
app.get("/restart", (req, res) => {
  console.log("Restarting BrightScript per user request...");
  runBrs();
  res.json({ status: "restarting" });
});

// Fallback to index.html (for root / and any unknown routes)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// SSE endpoint to stream BRS stdout/stderr to browser
let clients = [];
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  clients.push(res);
  req.on("close", () => {
    clients = clients.filter(c => c !== res);
  });
});

// helper
function broadcast(msg) {
  const data = `data: ${msg.replace(/\n/g, "\ndata: ")}\n\n`;
  clients.forEach(c => c.write(data));
}

let brsProcess = null;
function runBrs() {
  if (!fs.existsSync(brsFilePath)) {
    broadcast(`[ERROR] BRS file not found: ${brsFilePath}`);
    return;
  }

  // kill previous
  if (brsProcess) {
    try { brsProcess.kill(); } catch (e) {}
  }

  // Spawn brs CLI: 'brs <path>'
  broadcast(`🔁 Starting BrightScript: ${brsFilePath}`);
  brsProcess = spawn("brs", [brsFilePath], {
    env: {
      ...process.env,
      // put manifest vars into environment so code using GetGlobalAA()["env"] can read them
      // (brs CLI can expose those via global AA in some builds)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  brsProcess.stdout.on("data", (d) => {
    const txt = d.toString();
    broadcast(`[BRS] ${txt}`);
    process.stdout.write(`[BRS] ${txt}`);
  });

  brsProcess.stderr.on("data", (d) => {
    const txt = d.toString();
    broadcast(`[BRS Error] ${txt}`);
    process.stderr.write(`[BRS Error] ${txt}`);
  });

  brsProcess.on("close", (code) => {
    broadcast(`🛑 BRS exited with code ${code}`);
    brsProcess = null;
  });
}

// Watch project files (brs + manifest) for changes and restart
const watcher = chokidar.watch([path.join(projectRoot, "**/*.brs"), path.join(projectRoot, "manifest")], {
  ignoreInitial: true
});
watcher.on("all", (ev, p) => {
  broadcast(`🔁 Detected ${ev} on ${p}, restarting BrightScript...`);
  runBrs();
});

// health endpoint
app.get("/status", (req, res) => {
  res.json({ running: !!brsProcess, file: brsFilePath });
});

app.listen(PORT, () => {
  console.log(`Simulator web UI -> http://localhost:${PORT}`);
  console.log(`Serving project: ${projectRoot} -> ${brsFilePath}`);

  // initial run
  runBrs();
});
