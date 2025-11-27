import express from "express";
import { spawn } from "child_process";
import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import brs from "brs";

const { Interpreter } = brs;
dotenv.config();

// --- ENV CONFIG ---
const PROJECT_PATH = process.env.PROJECT_PATH || "/app/projects";
const PROJECT = process.env.PROJECT || "hello-world";
const PORT = process.env.PORT || 8080;

// --- PATHS ---
const projectRoot = path.join(PROJECT_PATH, PROJECT);
const distDir = path.join(projectRoot, "dist");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve static UI
app.use(express.static(path.join(__dirname, "public")));

// --- SSE STREAM ---
let clients = [];
app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    clients.push(res);
    req.on("close", () => {
        clients = clients.filter(c => c !== res);
    });
});

function broadcast(msg) {
    const payload = `data: ${msg.replace(/\n/g, "\ndata: ")}\n\n`;
    clients.forEach(c => c.write(payload));
}

// ---------------------------------------------------------
// COMPILE BrighterScript PROJECT
// ---------------------------------------------------------
let compiledEntries = [];

async function compileProject() {
    return new Promise((resolve, reject) => {
        // Run bsc from the project directory so stagingDir resolves correctly
        const proc = spawn("npx", ["bsc", "--project", "bsconfig.json"], {
            cwd: projectRoot,
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", d => stdout += d.toString());
        proc.stderr.on("data", d => stderr += d.toString());

        proc.on("close", code => {
            if (code !== 0) {
                reject(new Error(`bsc exited with code ${code}:\n${stderr}`));
                return;
            }

            compiledEntries = [];
            function collectFiles(dir) {
                if (!fs.existsSync(dir)) return;
                for (const f of fs.readdirSync(dir)) {
                    const full = path.join(dir, f);
                    const stat = fs.statSync(full);
                    if (stat.isDirectory()) {
                        collectFiles(full);
                    } else if (typeof full === 'string' && full.endsWith(".brs")) {
                        compiledEntries.push(full);
                    }
                }
            }
            compiledEntries = [];
            collectFiles(distDir);

            if (!compiledEntries.length) {
                reject(new Error("No .brs files were emitted."));
                return;
            }

            broadcast(`✅ Build completed. ${compiledEntries.length} .brs files.\n${stdout}`);
            resolve();
        });
    });
}

// ---------------------------------------------------------
// RUN BRS INTERPRETER
// ---------------------------------------------------------
let brsProcess = null;

function runBrs() {
    // Skip running brs CLI—instead serve compiled files to browser
    broadcast(`✅ Compiled files ready to serve.`);
}

// ---------------------------------------------------------
// FILE WATCHER (hot reload)
chokidar.watch(path.join(projectRoot, "source", "**/*.bs"), { ignoreInitial: true })
    .on("all", async (event, file) => {
        broadcast(`🔁 Change detected: ${event} → ${file}`);
        try {
            await compileProject();
            runBrs();
        } catch (err) {
            broadcast(`[ERROR] Compilation failed:\n${err.message}`);
        }
    });

// ---------------------------------------------------------
// REST ENDPOINTS
app.get("/restart", async (req, res) => {
    try {
        await compileProject();
        runBrs();
        res.json({ ok: true });
    } catch (err) {
        broadcast(`[ERROR] Manual restart failed:\n${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

app.get("/status", (req, res) => {
    res.json({
        running: !!brsProcess,
        entries: Array.isArray(compiledEntries) ? compiledEntries.filter(f => typeof f === 'string') : []
    });
});

app.get("/compiled-files", (req, res) => {
    const files = {};
    compiledEntries.forEach(file => {
        if (typeof file !== 'string') {
            console.log('Skipping non-string entry in compiledEntries for /compiled-files:', file);
            return;
        }
        try {
            files[path.basename(file)] = fs.readFileSync(file, "utf-8");
        } catch (err) {
            files[path.basename(file)] = `[ERROR] ${err.message}`;
        }
    });
    res.json(files);
});

app.get("/execute", async (req, res) => {
    try {
        if (!compiledEntries || !Array.isArray(compiledEntries) || !compiledEntries.length) {
            return res.status(400).json({ error: "No compiled files to execute" });
        }
        console.log('Compiled entries:', compiledEntries);
        let filesToRun = [];
        for (const f of compiledEntries) {
            if (typeof f === 'string') {
                try {
                    const lower = f.toLowerCase();
                    if (lower.endsWith('.brs') && !lower.includes('bslib')) {
                        filesToRun.push(f);
                    }
                } catch (err) {
                    console.log('Error processing entry:', f, err);
                }
            } else {
                console.log('Non-string entry in compiledEntries:', f);
            }
        }
        console.log('Files to run:', filesToRun);
        if (!filesToRun.length) {
            return res.status(400).json({ error: "No runnable .brs files found" });
        }

        // Run via npx from the project root so local packages are used and cwd is correct
        const brsProc = spawn('npx', ['brs', ...filesToRun], { cwd: projectRoot });
        let stdout = '';
        let stderr = '';

        brsProc.stdout.on('data', d => { stdout += d.toString(); });
        brsProc.stderr.on('data', d => { stderr += d.toString(); });
        brsProc.on('close', code => {
            console.log('brs exited with code', code);
            console.log('brs stdout:\n', stdout);
            console.log('brs stderr:\n', stderr);
            if (code === 0) {
                res.json({ output: stdout });
            } else {
                res.status(500).json({ error: stderr || `brs exited with code ${code}` });
            }
        });
        brsProc.on('error', err => {
            res.status(500).json({ error: err.message });
        });
    } catch (err) {
        console.log('Error in /execute:', err);
        return res.status(400).json({ error: 'Error in /execute: ' + err.message });
    }
});

// fallback UI
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------------------------------------------------
// START SERVER
// ---------------------------------------------------------
app.listen(PORT, async () => {
    console.log(`Simulator UI -> http://localhost:${PORT}`);
    console.log(`Project root: ${projectRoot}`);
    try {
        await compileProject();
        runBrs();
    } catch (err) {
        broadcast(`[ERROR] Initial compile failed:\n${err.message}`);
    }
});