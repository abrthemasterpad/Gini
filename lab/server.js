"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

require("../scripts/gini-env");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.GINI_LAB_PORT || 8790);

const CAMERA_IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const CAMERA_PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const REBUILDO_URL = (process.env.GINI_REBUILDO_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const OLLAMA_URL = (process.env.GINI_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");

let currentTask = null;
let lastTask = null;
const sseClients = new Set();
const recentLogs = [];

function now() {
  return new Date().toISOString();
}

function emit(type, payload) {
  const message = {
    ts: now(),
    type,
    ...payload
  };

  if (type === "log") {
    recentLogs.push(message);
    while (recentLogs.length > 120) recentLogs.shift();
  }

  const packet = "data: " + JSON.stringify(message) + "\n\n";

  for (const res of sseClients) {
    try { res.write(packet); } catch {}
  }
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  const data = Buffer.from(text);
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": data.length,
    "Cache-Control": "no-store"
  });
  res.end(data);
}

async function readJson(req) {
  let raw = "";

  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 32_000) throw new Error("request too large");
  }

  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function tcpCheck(host, port, timeoutMs = 1200) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    let done = false;

    function finish(ok, detail) {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve({ ok, detail });
    }

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true, "ready"));
    socket.on("timeout", () => finish(false, "timeout"));
    socket.on("error", error => finish(false, error.code || error.message));
  });
}

async function httpCheck(url, timeoutMs = 1600) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, detail: "HTTP " + response.status };
    }

    const text = await response.text();

    try {
      return { ok: true, detail: JSON.parse(text) };
    } catch {
      return { ok: true, detail: text.slice(0, 200) };
    }
  } catch (error) {
    return {
      ok: false,
      detail: error.name === "AbortError" ? "timeout" : error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

function taskSummary() {
  if (!currentTask) return null;

  return {
    id: currentTask.id,
    label: currentTask.label,
    startedAt: currentTask.startedAt,
    pid: currentTask.child && currentTask.child.pid
  };
}

function attachOutput(child, label) {
  function pipe(stream, level) {
    if (!stream) return;

    stream.on("data", chunk => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(Boolean);

      for (const line of lines) {
        emit("log", { level, label, line });
      }
    });
  }

  pipe(child.stdout, "info");
  pipe(child.stderr, "error");
}

function stopProcessTree(child) {
  return new Promise(resolve => {
    if (!child || !child.pid) {
      resolve();
      return;
    }

    if (process.platform === "win32") {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" }
      );

      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
      return;
    }

    try { child.kill("SIGTERM"); } catch {}
    setTimeout(resolve, 400);
  });
}

function startExclusive(label, command, args, options = {}) {
  if (currentTask) {
    const error = new Error("Gini is busy with " + currentTask.label);
    error.code = "BUSY";
    throw error;
  }

  const id = Date.now().toString(36);
  const child = spawn(command, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...(options.env || {})
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  currentTask = {
    id,
    label,
    child,
    startedAt: now(),
    startedMs: Date.now(),
    timeout: null
  };

  attachOutput(child, label);

  emit("task", {
    state: "started",
    task: taskSummary()
  });

  if (options.timeoutMs) {
    currentTask.timeout = setTimeout(async () => {
      if (!currentTask || currentTask.id !== id) return;

      emit("log", {
        level: "warn",
        label,
        line: "Time limit reached. Stopping this test safely."
      });

      await stopProcessTree(child);
    }, options.timeoutMs);
  }

  child.on("close", code => {
    let durationMs = null;

    if (currentTask && currentTask.id === id) {
      if (currentTask.timeout) clearTimeout(currentTask.timeout);

      durationMs = Date.now() - currentTask.startedMs;
      lastTask = {
        id,
        label,
        code,
        startedAt: currentTask.startedAt,
        finishedAt: now(),
        durationMs
      };

      currentTask = null;
    }

    emit("task", {
      state: "finished",
      id,
      label,
      code,
      durationMs
    });
  });

  child.on("error", error => {
    emit("log", {
      level: "error",
      label,
      line: error.message
    });
  });

  return {
    id,
    label,
    pid: child.pid
  };
}

function language(value) {
  const code = String(value || "en").toLowerCase();
  if (!["ta", "en", "hi"].includes(code)) {
    throw new Error("language must be ta, en or hi");
  }
  return code;
}

function expression(value) {
  const name = String(value || "").toLowerCase();
  const allowed = [
    "yes",
    "no",
    "happy",
    "acknowledge",
    "curious",
    "thinking",
    "sorry",
    "hello",
    "excited",
    "attention"
  ];

  if (!allowed.includes(name)) {
    throw new Error("unknown expression");
  }

  return name;
}

function behavior(value) {
  const name = String(value || "").toLowerCase();
  const allowed = ["yes", "no", "happy", "encourage", "curious"];

  if (!allowed.includes(name)) {
    throw new Error("unknown behavior");
  }

  return name;
}

function headDirection(value) {
  const name = String(value || "").toLowerCase();
  const allowed = ["up", "down", "left", "right"];

  if (!allowed.includes(name)) {
    throw new Error("head direction must be up, down, left or right");
  }

  return name;
}

async function statusPayload() {
  const [camera, rtsp, rebuildo, ollama] = await Promise.all([
    tcpCheck(CAMERA_IP, CAMERA_PORT),
    tcpCheck("127.0.0.1", 8554),
    httpCheck(REBUILDO_URL + "/health"),
    httpCheck(OLLAMA_URL + "/api/tags")
  ]);

  const hearingFiles = [
    path.join(ROOT, "scripts", "gini-capture-mic.js"),
    path.join(ROOT, "tools", "whisper", "Release", "whisper-cli.exe"),
    path.join(ROOT, "models", "ggml-base-q5_1.bin")
  ];

  const hearingReady = hearingFiles.every(file => fs.existsSync(file));
  const cameraReady = Boolean(camera && camera.ok);
  const visionReady = Boolean(rtsp && rtsp.ok);
  const speechReady = cameraReady && Boolean(rebuildo && rebuildo.ok);
  const brainReady = Boolean(ollama && ollama.ok);

  return {
    ok: true,
    camera,
    visionRtsp: rtsp,
    rebuildo,
    ollama,
    task: taskSummary(),
    lastTask,
    modules: {
      camera: {
        ready: cameraReady,
        detail: cameraReady ? "native SDK reachable" : String(camera.detail || "camera unavailable")
      },
      hearing: {
        ready: cameraReady && hearingReady,
        detail: hearingReady ? "capture + whisper prerequisites present" : "local hearing prerequisite missing"
      },
      vision: {
        ready: visionReady,
        detail: visionReady ? "RTSP/go2rtc reachable" : "vision stream unavailable"
      },
      speech: {
        ready: speechReady,
        detail: speechReady ? "camera + Rebuildo ready" : "camera or Rebuildo unavailable"
      },
      head: {
        ready: cameraReady,
        detail: cameraReady ? "bounded native PTZ available" : "camera unavailable"
      },
      teacher: {
        ready: speechReady && hearingReady,
        detail: speechReady && hearingReady ? "voice + hearing prerequisites ready" : "teacher prerequisite missing"
      },
      autonomy: {
        ready: cameraReady && hearingReady,
        degraded: !brainReady,
        detail: brainReady
          ? "local command loop + Ollama available"
          : "local command loop ready; AI fallback unavailable"
      }
    },
    policies: {
      oneCameraOwner: true,
      safePtzOnly: true,
      cgiPtzDisabled: true,
      maxControlCenterVisionMoves: 4,
      maxFullTestVisionMoves: 2,
      teacherLanguages: ["ta", "en", "hi"],
      japaneseParked: true
    }
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/status") {
    sendJson(res, 200, await statusPayload());
    return true;
  }

  if (req.method === "GET" && pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    sseClients.add(res);

    res.write(
      "data: " +
      JSON.stringify({
        ts: now(),
        type: "hello",
        task: taskSummary(),
        logs: recentLogs
      }) +
      "\n\n"
    );

    req.on("close", () => sseClients.delete(res));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/stop") {
    if (!currentTask) {
      sendJson(res, 200, { ok: true, stopped: false });
      return true;
    }

    const old = taskSummary();
    await stopProcessTree(currentTask.child);
    sendJson(res, 200, { ok: true, stopped: true, task: old });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/expression") {
    const body = await readJson(req);
    const name = expression(body.name);

    const task = startExclusive(
      "expression:" + name,
      "node.exe",
      [path.join(ROOT, "scripts", "gini-expression.js"), name],
      { timeoutMs: 18000 }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/head") {
    const body = await readJson(req);
    const direction = headDirection(body.direction);
    const pulseMs = Math.max(60, Math.min(140, Number(body.pulseMs || 90)));

    const task = startExclusive(
      "head:" + direction,
      "node.exe",
      [
        path.join(ROOT, "scripts", "gini-head-pulse.js"),
        direction,
        "--pulse-ms",
        String(pulseMs)
      ],
      { timeoutMs: 16000 }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/behavior") {
    const body = await readJson(req);
    const name = behavior(body.name);
    const lang = language(body.language);

    const task = startExclusive(
      "behavior:" + name,
      "node.exe",
      [
        path.join(ROOT, "scripts", "gini-lab-behavior.js"),
        name,
        "--language",
        lang
      ],
      {
        timeoutMs: 45000,
        env: { GINI_TEACHER_SPEAKER: "camera" }
      }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/voice") {
    const body = await readJson(req);
    const lang = language(body.language);
    const text = String(body.text || "").trim().slice(0, 220);

    if (!text) throw new Error("voice text is required");

    const task = startExclusive(
      "voice:" + lang,
      "node.exe",
      [
        path.join(ROOT, "scripts", "gini-lab-say.js"),
        "--language",
        lang,
        "--text",
        text
      ],
      {
        timeoutMs: 45000,
        env: {
          GINI_TEACHER_SPEAKER: "camera",
          GINI_PREFER_MODERN_TALKBACK: "1",
          GINI_TALKBACK_FRAME_MS: "20",
          GINI_TALKBACK_MIN_GAP_MS: "12"
        }
      }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/hearing") {
    const body = await readJson(req);
    const lang = String(body.language || "auto").toLowerCase();
    const seconds = Math.max(1.8, Math.min(6, Number(body.seconds || 2.4)));

    const task = startExclusive(
      "hearing-test",
      "node.exe",
      [
        path.join(ROOT, "scripts", "gini-lab-hearing.js"),
        "--language",
        lang,
        "--seconds",
        String(seconds)
      ],
      { timeoutMs: 30000 }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/teacher") {
    const body = await readJson(req);
    const lang = language(body.language);
    const mode = String(body.mode || "demo").toLowerCase() === "lesson"
      ? "lesson"
      : "demo";

    const task = startExclusive(
      "teacher:" + lang + ":" + mode,
      "node.exe",
      [
        path.join(ROOT, "scripts", "gini-teacher-session.js"),
        lang,
        mode
      ],
      {
        timeoutMs: mode === "demo" ? 180000 : 600000,
        env: { GINI_TEACHER_SPEAKER: "camera" }
      }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/assistant/probe") {
    const task = startExclusive(
      "autonomy-probe",
      "node.exe",
      [path.join(ROOT, "scripts", "gini-autonomy-probe.js")],
      {
        timeoutMs: 90000,
        env: {
          GINI_TEACHER_SPEAKER: "camera",
          GINI_PREFER_MODERN_TALKBACK: "1"
        }
      }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/assistant/start") {
    const task = startExclusive(
      "live-assistant",
      "node.exe",
      [path.join(ROOT, "scripts", "gini-autonomy-loop.js")],
      { timeoutMs: 0, env: { GINI_TEACHER_SPEAKER: "camera" } }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/full-test") {
    const body = await readJson(req);
    const lang = language(body.language);
    const liveVision = Boolean(body.liveVision);

    const args = [
      path.join(ROOT, "scripts", "gini-full-robot-test.js"),
      "--language",
      lang
    ];

    if (liveVision) args.push("--live-vision");

    const task = startExclusive(
      liveVision ? "full-robot-test:live-vision" : "full-robot-test:dry-vision",
      "node.exe",
      args,
      {
        timeoutMs: 150000,
        env: { GINI_TEACHER_SPEAKER: "camera" }
      }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/vision/doctor") {
    const task = startExclusive(
      "vision-doctor",
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File",
        path.join(ROOT, "scripts", "gini-vision-doctor.ps1")
      ],
      { timeoutMs: 30000 }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/vision/dry") {
    const task = startExclusive(
      "vision-dry-run",
      "py.exe",
      [
        "-3",
        path.join(ROOT, "scripts", "gini-vision-track.py")
      ],
      { timeoutMs: 9000 }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/vision/live") {
    const task = startExclusive(
      "vision-live-bounded",
      "py.exe",
      [
        "-3",
        path.join(ROOT, "scripts", "gini-vision-track.py"),
        "--live",
        "--live-seconds", "20",
        "--max-live-moves", "4",
        "--pulse-ms", "85",
        "--stable-frames", "3",
        "--cooldown-ms", "900",
        "--post-move-settle-ms", "1000"
      ],
      { timeoutMs: 28000 }
    );

    sendJson(res, 202, { ok: true, task });
    return true;
  }

  return false;
}

function serveStatic(res, pathname) {
  let relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  relative = path.normalize(relative).replace(/^\.\.(?:[\\/]|$)/, "");
  const file = path.join(PUBLIC, relative);

  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const type =
    ext === ".html" ? "text/html; charset=utf-8" :
    ext === ".js" ? "application/javascript; charset=utf-8" :
    ext === ".css" ? "text/css; charset=utf-8" :
    "application/octet-stream";

  const data = fs.readFileSync(file);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": data.length,
    "Cache-Control": "no-store"
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) sendJson(res, 404, { ok: false, error: "unknown endpoint" });
      return;
    }

    serveStatic(res, pathname);
  } catch (error) {
    const busy = error && error.code === "BUSY";

    sendJson(res, busy ? 409 : 400, {
      ok: false,
      error: error.message || String(error)
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("==================================================");
  console.log("GINI CONTROL CENTER v0.2");
  console.log("==================================================");
  console.log("Local robot control + staged diagnostics");
  console.log("URL: http://127.0.0.1:" + PORT);
  console.log("One camera-owner policy: ON");
  console.log("CGI PTZ: DISABLED");
  console.log("");
});

process.on("SIGINT", async () => {
  if (currentTask) {
    await stopProcessTree(currentTask.child);
  }

  server.close(() => process.exit(0));
});
