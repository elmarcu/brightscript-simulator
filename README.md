# BrightScript Simulator (Dockerized)

A lightweight **BrightScript simulator** running in a **Node.js + Docker** environment — designed to let you execute and iterate on Roku `.brs` projects directly from your browser.

This is **not a full Roku device emulator**, but a generic simulator built on top of [`brs`](https://github.com/sjbarag/brs), the open-source BrightScript interpreter.  
Currently, it supports simple script execution and live reload, with plans to expand toward UI scene simulation.

---

## 🧩 Overview

The simulator runs a Node.js web server that:
- Watches your BrightScript project for changes.
- Executes the entry `.brs` file via the `brs` CLI.
- Streams logs (stdout/stderr) live to your browser.
- Exposes a small web UI for viewing logs and restarting the simulation.

This is intended as a **local dev environment** to quickly test logic, not full Roku SceneGraph rendering.

---

## 🐳 Docker Setup

`docker-compose.yml` example:

```yaml
services:
  brs-sim:
    build: .
    container_name: brs-sim
    ports:
      - "8080:8080"
    environment:
      - PROJECT_PATH=/app/projects
      - PROJECT=hello-world
      - FILE=source/main.brs
      - PORT=8080
    volumes:
      - ./projects:/app/projects
    working_dir: /app/projects/hello-world
```

### Build and Run

```bash
docker compose up --build
```

Then open:

```
http://localhost:8080
```

You’ll see live logs from the BrightScript process.

---

## 🗂️ Project Structure

```
.
├── Dockerfile
├── docker-compose.yml
├── server.js               # Express + chokidar + brs launcher
├── package.json
├── public/                 # Static web UI assets (served via Express)
├── projects/
│   └── hello-world/
│       ├── manifest
│       └── source/
│           └── main.brs
```

### Sample BrightScript app

`projects/hello-world/source/main.brs`

```brightscript
sub main()
    print "Hello, World from BrightScript!"
    print "Simulated UI: [👋 Hello, World!]"
end sub
```

---

## 🧠 How It Works

- The container launches `server.js`.
- `server.js` uses `chokidar` to watch for file changes.
- When `.brs` or `manifest` files change, it respawns the `brs` process.
- Output from `brs` is streamed to browser clients via **Server-Sent Events (SSE)**.
- `/restart` can be called manually to restart execution.
- `/status` returns health and currently loaded file info.

---

## 🔧 Environment Variables

| Variable        | Default / Example         | Description |
|-----------------|---------------------------|-------------|
| `PROJECT_PATH`  | `/app/projects`           | Root directory of projects |
| `PROJECT`       | `hello-world`             | Target project folder name |
| `FILE`          | `source/main.brs`         | Entry BrightScript file path |
| `PORT`          | `8080`                    | Port for the simulator UI |

---

## 🚫 Limitations (for now)

- **No SceneGraph or UI rendering** — console-only output.
- **Limited BrightScript APIs** — depends on what `brs` supports.
- **No package or Roku channel bundling** — runs individual `.brs` files only.
- **Environment variables are not yet exposed inside BrightScript global AA.**

Planned improvements:
- Basic SceneGraph mock rendering (HTML canvas-based).
- API stubs for Roku built-ins.
- UI to edit and run scripts inline from the browser.

---

## ⚙️ Local Development

If you prefer to run directly without Docker:

```bash
npm install
npm start
```

Then set your `.env`:
```
PROJECT_PATH=./projects
PROJECT=hello-world
FILE=source/main.brs
PORT=8080
```

---

## 🔍 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | Web UI |
| `GET`  | `/status` | Returns simulator status |
| `GET`  | `/restart` | Restarts BrightScript process |
| `GET`  | `/events` | Server-sent event stream (live logs) |

---

## 📜 License

MIT — free to use and extend.
