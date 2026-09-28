"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

require("./gini-env");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(ROOT, "runtime", "teacher-listen");
const CAPTURE = path.join(ROOT, "scripts", "gini-capture-mic.js");
const SOURCE_AAC = path.join(ROOT, "runtime", "gini-mic.aac");
const SOURCE_META = path.join(ROOT, "runtime", "gini-mic-meta.json");
const WAV = path.join(RUNTIME, "child-turn.wav");
const TRANSCRIPT_BASE = path.join(RUNTIME, "child-turn");
const TRANSCRIPT = TRANSCRIPT_BASE + ".txt";
const FFMPEG = process.env.GINI_FFMPEG || "ffmpeg.exe";
const WHISPER = path.join(ROOT, "tools", "whisper", "Release", "whisper-cli.exe");
const MODEL = path.join(ROOT, "models", "ggml-base-q5_1.bin");
const PRIVACY_MODE = process.env.GINI_PRIVACY_MODE !== "0";
const DEFAULT_MS = Math.max(
  1800,
  Number(process.env.GINI_TEACHER_LISTEN_MS || 2600)
);
const SPEECH_THRESHOLD_DB = Number(
  process.env.GINI_TEACHER_SPEECH_THRESHOLD_DB || -38
);

fs.mkdirSync(RUNTIME, { recursive: true });

function runProcess(command, args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...(options.env || {}) },
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

function cleanup() {
  if (!PRIVACY_MODE) return;

  for (const file of [
    SOURCE_AAC,
    SOURCE_META,
    WAV,
    TRANSCRIPT
  ]) {
    try { fs.unlinkSync(file); } catch {}
  }
}

function status() {
  const missing = [];

  for (const file of [CAPTURE, WHISPER, MODEL]) {
    if (!fs.existsSync(file)) missing.push(file);
  }

  return {
    ok: missing.length === 0,
    missing,
    captureScript: CAPTURE,
    whisper: WHISPER,
    model: MODEL,
    listenMs: DEFAULT_MS,
    speechThresholdDb: SPEECH_THRESHOLD_DB
  };
}

async function listenOnce({
  language = "auto",
  seconds = null,
  transcribe = false
} = {}) {
  const ready = status();

  if (!ready.ok) {
    throw new Error(
      "Teacher listening prerequisites missing: " + ready.missing.join(", ")
    );
  }

  cleanup();

  const captureMs = Math.max(
    1800,
    Math.round(
      seconds == null
        ? DEFAULT_MS
        : Number(seconds) * 1000
    )
  );

  console.log(
    "Gini [LISTENING]: child may speak now (" +
    (captureMs / 1000).toFixed(1) +
    "s)"
  );

  const capture = await runProcess(
    "node.exe",
    [CAPTURE],
    {
      env: {
        GINI_CAPTURE_MS: String(captureMs)
      }
    }
  );

  if (
    capture.code !== 0 ||
    !fs.existsSync(SOURCE_AAC) ||
    !fs.existsSync(SOURCE_META)
  ) {
    cleanup();
    return {
      ok: false,
      heardAudio: false,
      heardSpeech: false,
      text: "",
      error: "camera microphone capture failed"
    };
  }

  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(SOURCE_META, "utf8"));
  } catch {}

  const ff = await runProcess(FFMPEG, [
    "-y",
    "-hide_banner",
    "-nostats",
    "-f", "aac",
    "-i", SOURCE_AAC,
    "-af", "volumedetect",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "pcm_s16le",
    WAV
  ]);

  if (ff.code !== 0 || !fs.existsSync(WAV)) {
    cleanup();
    return {
      ok: false,
      heardAudio: false,
      heardSpeech: false,
      text: "",
      error: "camera AAC decode failed"
    };
  }

  const volumeMatch = ff.stderr.match(
    /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i
  );
  const maxDb = volumeMatch ? Number(volumeMatch[1]) : -100;
  const heardAudio = maxDb >= SPEECH_THRESHOLD_DB;

  if (!heardAudio) {
    cleanup();
    return {
      ok: true,
      heardAudio: false,
      voiceDetected: false,
      heardSpeech: false,
      text: "",
      maxDb,
      audioFrames: Number(meta.audioFrames || 0)
    };
  }

  // Repeat-after-me lessons only need turn detection to continue naturally.
  // Do NOT make the child wait for Whisper unless explicit debug transcription
  // is enabled. This also prevents small-model hallucinations from being
  // treated as proof of correct pronunciation.
  if (!transcribe) {
    const result = {
      ok: true,
      heardAudio: true,
      voiceDetected: true,
      heardSpeech: true,
      text: "",
      transcriptSkipped: true,
      maxDb,
      audioFrames: Number(meta.audioFrames || 0)
    };
    cleanup();
    return result;
  }

  try { fs.unlinkSync(TRANSCRIPT); } catch {}

  const lang = ["hi", "ja", "en", "ta"].includes(language)
    ? language
    : "auto";

  // No Whisper prompt here. The earlier prototype's instruction prompt could
  // leak into the transcript ("Transcribe only what the child says").
  const whisper = await runProcess(WHISPER, [
    "-m", MODEL,
    "-f", WAV,
    "-l", lang,
    "-t", "4",
    "--no-gpu",
    "--no-timestamps",
    "--no-fallback",
    "--temperature", "0",
    "--beam-size", "5",
    "--max-len", "32",
    "--suppress-nst",
    "--output-txt",
    "--output-file", TRANSCRIPT_BASE,
    "--no-prints"
  ]);

  let text = "";

  if (whisper.code === 0 && fs.existsSync(TRANSCRIPT)) {
    text = fs.readFileSync(TRANSCRIPT, "utf8").trim();
  }

  // Reject known instruction leakage and implausibly long one-word responses.
  const leak = /transcribe only|child says|speech recognition/i.test(text);
  if (leak || text.length > 120) text = "";

  const result = {
    ok: true,
    heardAudio: true,
    voiceDetected: true,
    heardSpeech: Boolean(text),
    text,
    maxDb,
    audioFrames: Number(meta.audioFrames || 0)
  };

  cleanup();
  return result;
}

module.exports = {
  status,
  listenOnce,
  config: {
    listenMs: DEFAULT_MS,
    speechThresholdDb: SPEECH_THRESHOLD_DB
  }
};
