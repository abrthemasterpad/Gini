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
const SPEAKER_MODE = String(
  process.env.GINI_TEACHER_SPEAKER || "camera"
).toLowerCase();
const PREFER_MODERN_TALKBACK =
  process.env.GINI_PREFER_MODERN_TALKBACK === "1";

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

async function playPcWav(wavPath) {
  const ps = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "$p=$env:GINI_WAV_PATH; " +
    "$s=New-Object System.Media.SoundPlayer $p; " +
    "$s.PlaySync()"
  ];

  const result = await runProcess(
    "powershell.exe",
    ps,
    {
      inherit: true,
      env: {
        ...process.env,
        GINI_WAV_PATH: wavPath
      }
    }
  );

  if (result.code !== 0) {
    throw new Error("Windows speaker playback exited with code " + result.code);
  }
}

async function playOutputWav(wavPath) {
  if (SPEAKER_MODE === "pc" || SPEAKER_MODE === "bluetooth") {
    await playPcWav(wavPath);
    return;
  }

  await playCameraWav(wavPath);
}

async function playCameraWav(wavPath) {
  async function runModern() {
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
  }

  // Control Center can explicitly exercise the smoother pacing candidate
  // without silently replacing the already verified local runtime.
  if (PREFER_MODERN_TALKBACK && fs.existsSync(MODERN_TALKBACK)) {
    console.log("GINI TALKBACK: smooth-pacing candidate");
    await runModern();
    return;
  }

  if (fs.existsSync(VERIFIED_TALKBACK)) {
    await playVerifiedGiniSay(wavPath);
    return;
  }

  if (fs.existsSync(MODERN_TALKBACK)) {
    await runModern();
    return;
  }

  throw new Error(
    "Missing Gini talkback runtime. Checked verified path " +
    VERIFIED_TALKBACK +
    " and modular path " +
    MODERN_TALKBACK
  );
}

async function combineSequenceWavs(sources, pauseMs = 180, gainDb = []) {
  const outputRate =
    SPEAKER_MODE === "pc" || SPEAKER_MODE === "bluetooth"
      ? 48000
      : 16000;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("No audio sources supplied for teacher sequence");
  }

  if (sources.length === 1) {
    return convertForCamera(sources[0]);
  }

  const target = path.join(
    RUNTIME,
    "teacher-sequence-" + process.pid + "-" + Date.now() + ".wav"
  );

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error"
  ];

  for (const source of sources) {
    args.push("-i", source);
  }

  const filters = [];
  const concatInputs = [];
  const pauseSeconds = Math.max(0, Number(pauseMs || 0)) / 1000;

  sources.forEach((source, index) => {
    const gain = Number(gainDb[index] || 0);
    const gainFilter = Number.isFinite(gain) && gain !== 0
      ? ",volume=" + gain.toFixed(1) + "dB"
      : "";

    filters.push(
      "[" + index + ":a]" +
      "aresample=" + outputRate + "," +
      "aformat=sample_fmts=s16:channel_layouts=mono" +
      gainFilter +
      "[a" + index + "]"
    );

    concatInputs.push("[a" + index + "]");

    if (index < sources.length - 1 && pauseSeconds > 0) {
      filters.push(
        "anullsrc=r=" + outputRate + ":cl=mono:d=" +
        pauseSeconds.toFixed(3) +
        "[s" + index + "]"
      );
      concatInputs.push("[s" + index + "]");
    }
  });

  filters.push(
    concatInputs.join("") +
    "concat=n=" + concatInputs.length + ":v=0:a=1[out]"
  );

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[out]",
    "-ac", "1",
    "-ar", String(outputRate),
    "-c:a", "pcm_s16le",
    target
  );

  const result = await runProcess(FFMPEG, args);

  if (result.code !== 0 || !fs.existsSync(target)) {
    throw new Error(
      "FFmpeg could not build teacher speech sequence: " +
      (result.stderr || result.stdout || "unknown error").trim()
    );
  }

  return target;
}

async function speakSequence(segments, options = {}) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("Teacher speech sequence is empty");
  }

  const generated = [];
  let cameraWav = null;

  try {
    // Rebuildo already serializes voice jobs safely. Submit them together so
    // its warm workers can prepare a complete teacher turn before Gini speaks.
    const results = await Promise.all(
      segments.map(segment => synthesizeWav(segment))
    );

    generated.push(...results);
    cameraWav = await combineSequenceWavs(
      generated.map(item => item.source),
      options.pauseMs == null ? 180 : options.pauseMs,
      segments.map(segment => Number(segment.gainDb || 0))
    );

    await playOutputWav(cameraWav);

    return generated.map(item => item.job);
  } finally {
    if (process.env.GINI_PRIVACY_MODE !== "0") {
      for (const item of generated) {
        if (!item || !item.source) continue;
        try { fs.unlinkSync(item.source); } catch {}
      }

      if (cameraWav) {
        try { fs.unlinkSync(cameraWav); } catch {}
      }
    }
  }
}

async function speak(options) {
  const generated = await synthesizeWav(options);
  let cameraWav = null;

  try {
    if (SPEAKER_MODE === "pc" || SPEAKER_MODE === "bluetooth") {
      await playOutputWav(generated.source);
    } else {
      cameraWav = await convertForCamera(generated.source);
      await playOutputWav(cameraWav);
    }

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
  playPcWav,
  talkbackStatus,
  speakSequence,
  speak,
  config: {
    rebuildoUrl: REBUILDO_URL,
    speakerMode: SPEAKER_MODE,
    preferModernTalkback: PREFER_MODERN_TALKBACK
  }
};
