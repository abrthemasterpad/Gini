const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(ROOT, "runtime");

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";
const STREAM = Number(process.env.GINI_CAMERA_STREAM || 0);

const SPEECH_THRESHOLD_DB = Number(process.env.GINI_SPEECH_THRESHOLD_DB || -36);
const STEP = Number(process.env.GINI_PTZ_STEP || 1);
const SPEED = Number(process.env.GINI_PTZ_SPEED || 8);

const FFMPEG = "ffmpeg.exe";
const POWERSHELL = "powershell.exe";
const WHISPER = path.join(ROOT, "tools", "whisper", "Release", "whisper-cli.exe");
const MODEL = path.join(ROOT, "models", "ggml-base-q5_1.bin");
const PTZ = path.join(ROOT, "gini.ps1");
const SAY = path.join(ROOT, "gini-say.ps1");

const AAC = path.join(RUNTIME, "gini-direct-window.aac");
const WAV = path.join(RUNTIME, "gini-direct-window.wav");
const TRANSCRIPT_BASE = path.join(RUNTIME, "gini-direct-transcript");
const TRANSCRIPT = TRANSCRIPT_BASE + ".txt";

fs.mkdirSync(RUNTIME, { recursive: true });

for (const required of [WHISPER, MODEL, PTZ, SAY]) {
  if (!fs.existsSync(required)) {
    console.error("Missing required file:", required);
    process.exit(2);
  }
}

let connection = null;
let opened = false;
let stopping = false;
let processing = false;
let suppressAudio = false;

let audioFrames = [];
let audioBytes = 0;
let videoFrames = 0;
let totalAudioFrames = 0;
let firstBufferedAt = 0;
let lastProcessAt = 0;
let lastHandledText = "";
let lastHandledAt = 0;

const wakeAliases = ["gini", "jeanie", "genie", "ginny", "jini", "jenny"];

function run(file, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    if (!options.inherit) {
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
    }

    child.on("error", (error) => {
      resolve({ code: -1, stdout, stderr: stderr + "\n" + error.message });
    });

    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWakeCommand(text) {
  const normalized = normalizeText(text);

  for (const alias of wakeAliases) {
    const escaped = alias.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    const re = new RegExp("^" + escaped + "(?:\\s+|$)", "i");

    if (re.test(normalized)) {
      return {
        wake: true,
        alias,
        command: normalized.replace(re, "").trim()
      };
    }
  }

  return { wake: false, alias: "", command: normalized };
}

function parseCommand(command) {
  if (/^(go to sleep|sleep|stop listening|stop)$/.test(command)) {
    return { action: null, reply: "Okay. I am going to sleep.", sleep: true };
  }

  if (/(turn|look|move)\s+(to\s+the\s+)?left|\bleft\b/.test(command)) {
    return { action: "left", reply: "Turning left.", sleep: false };
  }

  if (/(turn|look|move)\s+(to\s+the\s+)?right|\bright\b/.test(command)) {
    return { action: "right", reply: "Turning right.", sleep: false };
  }

  if (/(look|move|turn)\s+up|\bup\b/.test(command)) {
    return { action: "up", reply: "Looking up.", sleep: false };
  }

  if (/(look|move|turn)\s+down|\bdown\b/.test(command)) {
    return { action: "down", reply: "Looking down.", sleep: false };
  }

  if (/can you hear me|do you hear me|hear me/.test(command)) {
    return { action: null, reply: "Yes. I can hear you.", sleep: false };
  }

  if (/are you there|you there/.test(command)) {
    return { action: null, reply: "Yes. I am here.", sleep: false };
  }

  if (/say hello|hello|hi/.test(command)) {
    return { action: null, reply: "Hello. I am Gini.", sleep: false };
  }

  return {
    action: null,
    reply: "I heard you, but I do not know that command yet.",
    sleep: false
  };
}

async function transcribeWindow(frames) {
  try {
    fs.unlinkSync(TRANSCRIPT);
  } catch {}

  fs.writeFileSync(AAC, Buffer.concat(frames));

  const ff = await run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-nostats",
    "-f", "aac",
    "-i", AAC,
    "-af", "volumedetect",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "pcm_s16le",
    WAV
  ]);

  if (ff.code !== 0 || !fs.existsSync(WAV)) {
    console.log("Audio decode failed.");
    return null;
  }

  const m = ff.stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  const maxDb = m ? Number(m[1]) : -100;

  if (maxDb < SPEECH_THRESHOLD_DB) {
    return { quiet: true, maxDb, text: "" };
  }

  console.log("Voice activity:", maxDb.toFixed(1), "dB -> understanding...");

  const wh = await run(WHISPER, [
    "-m", MODEL,
    "-f", WAV,
    "-l", "auto",
    "-t", "4",
    "--no-gpu",
    "--no-timestamps",
    "--output-txt",
    "--output-file", TRANSCRIPT_BASE,
    "--prompt",
    "The assistant wake word is Gini, spelled G-i-n-i. Common commands: Gini turn left, Gini turn right, Gini look up, Gini look down, Gini sleep.",
    "--no-prints"
  ]);

  if (wh.code !== 0 || !fs.existsSync(TRANSCRIPT)) {
    console.log("Speech recognition produced no transcript.");
    return { quiet: false, maxDb, text: "" };
  }

  const text = fs.readFileSync(TRANSCRIPT, "utf8").trim();
  return { quiet: false, maxDb, text };
}

async function performCommand(command) {
  const parsed = parseCommand(command);

  suppressAudio = true;
  audioFrames = [];
  firstBufferedAt = 0;

  if (parsed.action) {
    console.log("ACTION:", parsed.action);

    await run(
      POWERSHELL,
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", PTZ,
        "-Action", parsed.action,
        "-Step", String(STEP),
        "-Speed", String(SPEED)
      ],
      { inherit: true }
    );
  }

  console.log("GINI:", parsed.reply);

  await run(
    POWERSHELL,
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", SAY,
      parsed.reply
    ],
    { inherit: true }
  );

  if (parsed.sleep) {
    shutdown("voice sleep command");
    return;
  }

  setTimeout(() => {
    audioFrames = [];
    firstBufferedAt = 0;
    suppressAudio = false;
    console.log("Listening again...");
  }, 1200);
}

async function processBufferedAudio() {
  if (processing || suppressAudio || stopping || audioFrames.length === 0) return;

  processing = true;
  lastProcessAt = Date.now();

  const frames = audioFrames.slice(-40);
  audioFrames = [];
  firstBufferedAt = 0;

  const result = await transcribeWindow(frames);

  if (!result || result.quiet || !result.text) {
    processing = false;
    return;
  }

  console.log("HEARD:", result.text);

  const wake = extractWakeCommand(result.text);

  if (!wake.wake) {
    console.log("No Gini wake word -> ignored");
    processing = false;
    return;
  }

  const now = Date.now();
  const duplicate =
    result.text === lastHandledText &&
    now - lastHandledAt < 8000;

  if (duplicate) {
    console.log("Duplicate wake phrase -> ignored");
    processing = false;
    return;
  }

  lastHandledText = result.text;
  lastHandledAt = now;

  console.log("WAKE WORD OK");

  if (!wake.command) {
    await performCommand("hello");
    processing = false;
    return;
  }

  console.log("COMMAND:", wake.command);
  await performCommand(wake.command);

  processing = false;
}

function shutdown(reason) {
  if (stopping) return;
  stopping = true;

  console.log("");
  console.log("Stopping Gini:", reason);

  try {
    if (connection && opened) API.close_stream(connection, 0, STREAM);
  } catch {}

  setTimeout(() => {
    try { Player.DisConnectDevice("", IP); } catch {}
    setTimeout(() => process.exit(0), 400);
  }, 300);
}

API.onconnect = function (conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    console.error("Native connection failed:", code);
    process.exit(2);
    return;
  }

  connection = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  console.log("LOGIN:", result);

  if (result !== 0) {
    console.error("Native login failed:", result);
    process.exit(2);
    return;
  }

  connection = conn;
  conn.logined = true;
  API.open_stream(conn, 0, STREAM);
};

API.onopenstream = function (conn, channel, streamid, result) {
  console.log("OPEN STREAM:", result, "channel=" + channel, "stream=" + streamid);

  if (result !== 0) {
    console.error("Live stream open failed:", result);
    process.exit(2);
    return;
  }

  opened = true;

  console.log("");
  console.log("GINI IS LIVE AND LISTENING");
  console.log('Say: "Gini, turn left."');
  console.log('Say: "Gini, sleep." to stop.');
  console.log("");
};

API.onrecvframeex = function (
  conn,
  frametype,
  data,
  datalen,
  channel,
  param1,
  param2,
  enc,
  param4
) {
  if (frametype === 0) {
    totalAudioFrames += 1;
    audioBytes += datalen;

    if (totalAudioFrames === 1) {
      console.log(
        "FIRST AUDIO FRAME:",
        { codec: enc, sampleRate: param1, sampleWidth: param2, channels: param4 },
        "bytes=" + datalen
      );
    }

    if (!suppressAudio) {
      if (audioFrames.length === 0) firstBufferedAt = Date.now();

      audioFrames.push(Buffer.from(data));

      if (audioFrames.length > 40) {
        audioFrames = audioFrames.slice(-40);
      }
    }
  } else {
    videoFrames += 1;
  }
};

console.log("==================================================");
console.log("GINI CONTINUOUS BRAIN v0.2.3");
console.log("==================================================");
console.log("Foreground native stream - no hidden background process");
console.log("Wake word: Gini");
console.log("VAD threshold:", SPEECH_THRESHOLD_DB, "dB");
console.log("");

Player.ConnectDevice(
  "",
  IP,
  USER,
  PASS,
  0,
  PORT,
  0,
  0,
  STREAM,
  "",
  null
);

setInterval(() => {
  if (stopping || processing || suppressAudio) return;

  const oldEnough =
    firstBufferedAt > 0 &&
    Date.now() - firstBufferedAt >= 1800;

  if (audioFrames.length >= 14 || (audioFrames.length >= 4 && oldEnough)) {
    processBufferedAudio().catch((err) => {
      console.error("Processing error:", err);
      processing = false;
    });
  }
}, 250);

setInterval(() => {
  if (!opened || stopping) return;

  console.log(
    "[LIVE] video=" + videoFrames +
    " audio=" + totalAudioFrames +
    " audioBytes=" + audioBytes
  );
}, 5000);

process.on("SIGINT", () => shutdown("Ctrl+C"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
