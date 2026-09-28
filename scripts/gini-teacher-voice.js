"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

require("./gini-env");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(ROOT, "runtime", "teacher");
const REBUILDO_URL = String(
  process.env.GINI_REBUILDO_URL || "http://127.0.0.1:8787"
).replace(/\/$/, "");
const REBUILDO_TOKEN = process.env.GINI_REBUILDO_TOKEN || "";
const FFMPEG = process.env.GINI_FFMPEG || "ffmpeg.exe";

// Gini already has a physically verified camera-speaker path at ROOT\gini-say.js.
// Keep the newer modular talkback path available for future use, but do not
// require it for Teacher v0.1.
const MODERN_TALKBACK = process.env.GINI_TALKBACK_SCRIPT
  ? path.resolve(process.env.GINI_TALKBACK_SCRIPT)
  : path.join(ROOT, "src", "audio", "talkback.js");
const VERIFIED_TALKBACK = path.join(ROOT, "gini-say.js");
const VERIFIED_TALKBACK_WAV = path.join(ROOT, "gini-clean.wav");

fs.mkdirSync(RUNTIME, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function headers(extra = {}) {
  return {
    ...extra,
    ...(REBUILDO_TOKEN
      ? { Authorization: "Bearer " + REBUILDO_TOKEN }
      : {})
  };
}

function talkbackStatus() {
  if (fs.existsSync(VERIFIED_TALKBACK)) {
    return {
      ok: true,
      mode: "verified-gini-say",
      path: VERIFIED_TALKBACK
    };
  }

  if (fs.existsSync(MODERN_TALKBACK)) {
    return {
      ok: true,
      mode: "modular-talkback",
      path: MODERN_TALKBACK
    };
  }

  return {
    ok: false,
    mode: "missing",
    path: VERIFIED_TALKBACK,
    alsoChecked: MODERN_TALKBACK
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: headers(options.headers || {})
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const detail = body && body.error ? body.error : text || response.statusText;
    throw new Error("Rebuildo HTTP " + response.status + ": " + detail);
  }

  return body;
}

async function health() {
  try {
    const body = await requestJson(REBUILDO_URL + "/health");
    return {
      ok: Boolean(body && body.ok),
      ...body
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

async function catalog() {
  return requestJson(REBUILDO_URL + "/voice/presets");
}

async function synthesizeWav({
  language,
  text,
  voice,
  delivery = "clear",
  preset = "storyteller",
  speed = 1.0,
  mode = "standard",
  timeoutMs = 90_000
}) {
  if (!language || !text) {
    throw new Error("language and text are required");
  }

  const payload = {
    language,
    text,
    delivery,
    preset,
    speed,
    mode,
    format: "wav"
  };

  if (voice) payload.voice = voice;

  const created = await requestJson(REBUILDO_URL + "/voice/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!created.id) {
    throw new Error("Rebuildo did not return a voice job id");
  }

  const deadline = Date.now() + timeoutMs;
  let status = null;

  while (Date.now() < deadline) {
    await sleep(200);
    status = await requestJson(
      REBUILDO_URL + "/voice/jobs/" + encodeURIComponent(created.id)
    );

    if (status.status === "ready") break;

    if (status.status === "failed" || status.error) {
      throw new Error(status.error || status.message || "voice generation failed");
    }
  }

  if (!status || status.status !== "ready" || !status.wavUrl) {
    throw new Error("Rebuildo voice job timed out");
  }

  const wavResponse = await fetch(
    REBUILDO_URL + status.wavUrl,
    { headers: headers() }
  );

  if (!wavResponse.ok) {
    throw new Error("Could not download Rebuildo WAV: HTTP " + wavResponse.status);
  }

  const source = path.join(
    RUNTIME,
    "rebuildo-" + created.id + ".wav"
  );

  const bytes = Buffer.from(await wavResponse.arrayBuffer());
  fs.writeFileSync(source, bytes);

  return {
    source,
    job: status
  };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: options.env || process.env,
      windowsHide: true,
      stdio: options.inherit
        ? "inherit"
        : ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    if (!options.inherit) {
      child.stdout.on("data", data => { stdout += data.toString(); });
      child.stderr.on("data", data => { stderr += data.toString(); });
    }

    child.on("error", error => {
      resolve({ code: -1, stdout, stderr: stderr + "\n" + error.message });
    });

    child.on("close", code => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function convertForCamera(source) {
  const target = path.join(
    RUNTIME,
    "camera-" + path.basename(source)
  );

  const result = await runProcess(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", source,
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "pcm_s16le",
    target
  ]);

  if (result.code !== 0 || !fs.existsSync(target)) {
    throw new Error(
      "FFmpeg could not prepare Rebuildo audio for Gini: " +
      (result.stderr || result.stdout || "unknown error").trim()
    );
  }

  return target;
}

async function playVerifiedGiniSay(wavPath) {
  const backup = path.join(
    RUNTIME,
    "gini-clean-backup-" + process.pid + "-" + Date.now() + ".wav"
  );
  const hadExisting = fs.existsSync(VERIFIED_TALKBACK_WAV);

  try {
    if (hadExisting) {
      fs.copyFileSync(VERIFIED_TALKBACK_WAV, backup);
    }

    // gini-say.js is the already verified native ESee camera-speaker runtime.
    // It reads ROOT\gini-clean.wav, so feed the Rebuildo-generated 16 kHz
    // mono PCM WAV into that exact proven path instead of creating a new stack.
    fs.copyFileSync(wavPath, VERIFIED_TALKBACK_WAV);

    const result = await runProcess(
      "node.exe",
      [VERIFIED_TALKBACK],
      {
        inherit: true,
        cwd: ROOT
      }
    );

    if (result.code !== 0) {
      throw new Error("Verified Gini talkback exited with code " + result.code);
    }
  } finally {
    try { fs.unlinkSync(VERIFIED_TALKBACK_WAV); } catch {}

    if (hadExisting && fs.existsSync(backup)) {
      try { fs.copyFileSync(backup, VERIFIED_TALKBACK_WAV); } catch {}
    }

    try { fs.unlinkSync(backup); } catch {}
  }
}

async function playCameraWav(wavPath) {
  // Prefer the path that has already been physically verified on this camera.
  if (fs.existsSync(VERIFIED_TALKBACK)) {
    await playVerifiedGiniSay(wavPath);
    return;
  }

  // Future modular runtime fallback.
  if (fs.existsSync(MODERN_TALKBACK)) {
    const result = await runProcess(
      "node.exe",
      [MODERN_TALKBACK],
      {
        inherit: true,
        env: {
          ...process.env,
          GINI_WAV_PATH: wavPath
        }
      }
    );

    if (result.code !== 0) {
      throw new Error("Gini camera talkback exited with code " + result.code);
    }
    return;
  }

  throw new Error(
    "Missing Gini talkback runtime. Checked verified path " +
    VERIFIED_TALKBACK +
    " and modular path " +
    MODERN_TALKBACK
  );
}

async function speak(options) {
  const generated = await synthesizeWav(options);
  let cameraWav = null;

  try {
    cameraWav = await convertForCamera(generated.source);
    await playCameraWav(cameraWav);

    return generated.job;
  } finally {
    if (process.env.GINI_PRIVACY_MODE !== "0") {
      for (const file of [generated && generated.source, cameraWav]) {
        if (!file) continue;
        try { fs.unlinkSync(file); } catch {}
      }
    }
  }
}

module.exports = {
  health,
  catalog,
  synthesizeWav,
  convertForCamera,
  playCameraWav,
  talkbackStatus,
  speak,
  config: {
    rebuildoUrl: REBUILDO_URL
  }
};
