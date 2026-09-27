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
const NATIVE_PTZ_PARAM = 6;
const NATIVE_PTZ_MOVE_MS = Math.max(
  100,
  Number(process.env.GINI_NATIVE_PTZ_MOVE_MS || 1200)
);

const FFMPEG = "ffmpeg.exe";
const POWERSHELL = "powershell.exe";
const WHISPER = path.join(ROOT, "tools", "whisper", "Release", "whisper-cli.exe");
const MODEL = path.join(ROOT, "models", "ggml-base-q5_1.bin");
const SAY_CAMERA = path.join(ROOT, "gini-say.ps1");
const SAY_LOCAL = path.join(ROOT, "scripts", "gini-say-local.ps1");
const SPEAKER_MODE = (process.env.GINI_SPEAKER_MODE || "camera").toLowerCase();
const SAY = SPEAKER_MODE === "local" ? SAY_LOCAL : SAY_CAMERA;

const AAC = path.join(RUNTIME, "gini-direct-window.aac");
const WAV = path.join(RUNTIME, "gini-direct-window.wav");
const TRANSCRIPT_BASE = path.join(RUNTIME, "gini-direct-transcript");
const TRANSCRIPT = TRANSCRIPT_BASE + ".txt";

fs.mkdirSync(RUNTIME, { recursive: true });

for (const required of [WHISPER, MODEL, SAY]) {
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
let awaitingCommandUntil = 0;
let reconnectingAfterTalkback = false;
let closeStreamResolve = null;

const wakeAliases = ["gini", "ginie", "jeanie", "genie", "ginny", "jini", "jenny"];

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/\bg\s*[-. ]\s*i\s*[-. ]\s*n\s*[-. ]\s*i\b/gi, "gini")
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWakeAliases(text) {
  let out = " " + text + " ";

  for (const alias of wakeAliases) {
    const escaped = alias.replace(/[.*+?^$()|[\]\\]/g, "\\function extractWakeCommand(text) {
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
}");
    out = out.replace(
      new RegExp("\\b" + escaped + "\\b", "gi"),
      " "
    );
  }

  return out.replace(/\s+/g, " ").trim();
}

function extractWakeCommand(text) {
  const normalized = normalizeText(text);

  let best = null;

  for (const alias of wakeAliases) {
    const escaped = alias.replace(/[.*+?^$()|[\]\\]/g, "\\function extractWakeCommand(text) {
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
}");
    const re = new RegExp("\\b" + escaped + "\\b", "i");
    const match = re.exec(normalized);

    if (match && (!best || match.index < best.index)) {
      best = {
        alias,
        index: match.index,
        length: match[0].length
      };
    }
  }

  if (!best) {
    return { wake: false, alias: "", command: normalized };
  }

  // Ignore filler before the wake word and remove repeated wake words after it.
  const afterWake = normalized.slice(best.index + best.length).trim();
  const command = stripWakeAliases(afterWake);

  return {
    wake: true,
    alias: best.alias,
    command
  };
}

function parseCommand(command) {
  const clean = stripWakeAliases(normalizeText(command));

  if (/\b(go to sleep|sleep|stop listening|stop)\b/.test(clean)) {
    return { action: null, reply: "Okay. I am going to sleep.", sleep: true };
  }

  const directionPatterns = [
    { action: "left",  reply: "Turning left.", pattern: /\b(?:turn|look|move)?\s*(?:to\s+the\s+)?left\b/ },
    { action: "right", reply: "Turning right.", pattern: /\b(?:turn|look|move)?\s*(?:to\s+the\s+)?right\b/ },
    { action: "up",    reply: "Looking up.", pattern: /\b(?:look|move|turn)?\s*up\b/ },
    { action: "down",  reply: "Looking down.", pattern: /\b(?:look|move|turn)?\s*down\b/ }
  ];

  let earliest = null;

  for (const item of directionPatterns) {
    const match = item.pattern.exec(clean);

    if (match && (!earliest || match.index < earliest.index)) {
      earliest = { ...item, index: match.index };
    }
  }

  if (earliest) {
    return {
      action: earliest.action,
      reply: earliest.reply,
      sleep: false
    };
  }

  if (/\b(can you hear me|do you hear me|hear me)\b/.test(clean)) {
    return { action: null, reply: "Yes. I can hear you.", sleep: false };
  }

  if (/\b(are you there|you there)\b/.test(clean)) {
    return { action: null, reply: "Yes. I am here.", sleep: false };
  }

  if (/\b(say hello|hello|hi)\b/.test(clean)) {
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

function connectCamera() {
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
}

async function pauseListeningBeforeTalkback() {
  suppressAudio = true;
  audioFrames = [];
  firstBufferedAt = 0;

  if (connection && opened) {
    console.log("Pausing microphone stream BEFORE talkback...");

    const closeAck = new Promise(resolve => {
      closeStreamResolve = resolve;
    });

    try {
      API.close_stream(connection, 0, STREAM);
      await Promise.race([
        closeAck,
        sleep(1500)
      ]);
    } catch {}

    closeStreamResolve = null;
  }

  try {
    Player.DisConnectDevice("", IP);
  } catch {}

  connection = null;
  opened = false;

  // Let firmware fully release the live audio path before another
  // connection enters VOP2P/talkback mode.
  await sleep(800);

  console.log("Listening stream fully closed - talkback may start.");
}

async function restartListeningConnection() {
  reconnectingAfterTalkback = true;
  suppressAudio = true;
  audioFrames = [];
  firstBufferedAt = 0;

  const audioBefore = totalAudioFrames;

  console.log("Opening a fresh microphone stream after talkback...");

  connection = null;
  opened = false;

  await sleep(700);

  connectCamera();

  const deadline = Date.now() + 12000;

  while (Date.now() < deadline) {
    if (opened && totalAudioFrames > audioBefore) {
      reconnectingAfterTalkback = false;
      suppressAudio = false;
      audioFrames = [];
      firstBufferedAt = 0;

      console.log("MICROPHONE RESUMED - listening again.");
      return true;
    }

    await sleep(200);
  }

  reconnectingAfterTalkback = false;

  console.error("Microphone did not resume on the fresh post-talkback stream.");
  return false;
}

async function nativePtz(action) {
  const ptzTypes = {
    up: 2,
    down: 3,
    left: 4,
    right: 5
  };

  const type = ptzTypes[action];

  if (!type) {
    throw new Error("Unsupported native PTZ action: " + action);
  }

  if (!connection || !opened) {
    throw new Error("Native PTZ requires an active Gini live session.");
  }

  const duration = NATIVE_PTZ_MOVE_MS * Math.max(1, Math.min(4, STEP));

  console.log(
    "NATIVE PTZ:",
    action,
    "param=" + NATIVE_PTZ_PARAM,
    "duration=" + duration + "ms"
  );

  // Exact CameraSDK demo values, now hardware-verified:
  // movement types 2/3/4/5 use param=6; STOP uses type=0,param=0.
  // This native path physically moves Gini and preserves AAC.
  Player.ptz_ctrl("", IP, 0, type, NATIVE_PTZ_PARAM);
  await sleep(duration);
  Player.ptz_ctrl("", IP, 0, 0, 0);
  await sleep(300);
}

async function performCommand(command) {
  const parsed = parseCommand(command);

  suppressAudio = true;
  audioFrames = [];
  firstBufferedAt = 0;
  awaitingCommandUntil = 0;

  if (parsed.action) {
    console.log("ACTION:", parsed.action);

    try {
      await nativePtz(parsed.action);
    } catch (err) {
      console.error("Native PTZ failed:", err.message);
      suppressAudio = false;
      return;
    }
  }

  if (SPEAKER_MODE === "camera") {
    // Camera speaker path: first close the native listening stream,
    // then use the hardware-verified safe VOP2P hangup sequence.
    // The old mic freeze was isolated to CGI PTZ, which is no longer used.
    await pauseListeningBeforeTalkback();

    const sayResult = await run(
      POWERSHELL,
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", SAY,
        parsed.reply
      ],
      { inherit: true }
    );

    if (sayResult.code !== 0) {
      console.error("Camera talkback did not close cleanly. Exit code:", sayResult.code);
      shutdown("talkback teardown failed");
      return;
    }

    if (parsed.sleep) {
      shutdown("voice sleep command");
      return;
    }

    const resumed = await restartListeningConnection();

    if (!resumed) {
      shutdown("microphone failed to resume after camera talkback");
    }

    return;
  }

  // Stable mode: keep the native camera mic stream open and speak through
  // the Windows default audio device. No VOP2P call touches camera firmware.
  const sayResult = await run(
    POWERSHELL,
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", SAY,
      parsed.reply
    ],
    { inherit: true }
  );

  if (sayResult.code !== 0) {
    console.error("Local speech failed. Exit code:", sayResult.code);
    processing = false;
    return;
  }

  if (parsed.sleep) {
    shutdown("voice sleep command");
    return;
  }

  audioFrames = [];
  firstBufferedAt = 0;
  await sleep(600);
  suppressAudio = false;
  console.log("Listening continues - camera mic never closed.");
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

  let wake = extractWakeCommand(result.text);

  if (!wake.wake) {
    if (Date.now() < awaitingCommandUntil) {
      const followup = stripWakeAliases(normalizeText(result.text));

      if (followup) {
        console.log("FOLLOW-UP COMMAND:", followup);
        awaitingCommandUntil = 0;
        await performCommand(followup);
        processing = false;
        return;
      }
    }

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
    awaitingCommandUntil = Date.now() + 8000;
    console.log("Wake word heard - waiting up to 8 seconds for the command...");
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

API.onclosestream = function (conn, channel, streamid, result) {
  console.log("CLOSE STREAM:", result, "channel=" + channel, "stream=" + streamid);
  opened = false;

  if (closeStreamResolve) {
    const resolve = closeStreamResolve;
    closeStreamResolve = null;
    resolve(result);
  }
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
console.log("GINI CONTINUOUS BRAIN v0.3.3");
console.log("==================================================");
console.log("Foreground native stream - no hidden background process");
console.log("Wake word: Gini");
console.log("VAD threshold:", SPEECH_THRESHOLD_DB, "dB");
console.log("PTZ mode: native SDK (physical + mic-safe)");
console.log("Speaker mode:", SPEAKER_MODE, SPEAKER_MODE === "camera" ? "(Gini camera speaker)" : "(Windows fallback)");
console.log("");

connectCamera();

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
