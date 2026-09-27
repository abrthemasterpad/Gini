const fs = require("fs");
const path = require("path");

require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(ROOT, "runtime");
const CHUNK_DIR = path.join(RUNTIME, "listen-chunks");

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";
const STREAM = Number(process.env.GINI_CAMERA_STREAM || 0);

const EMIT_MS = Number(process.env.GINI_EMIT_MS || 2500);
const KEEP_FRAMES = Number(process.env.GINI_KEEP_FRAMES || 40);

const READY = path.join(RUNTIME, "gini-listener-ready.flag");
const STOP = path.join(RUNTIME, "gini-listener-stop.flag");
const STATUS = path.join(RUNTIME, "gini-listener-status.json");

fs.mkdirSync(RUNTIME, { recursive: true });
fs.mkdirSync(CHUNK_DIR, { recursive: true });

for (const p of [READY, STATUS]) {
  try { fs.unlinkSync(p); } catch {}
}

let connection = null;
let opened = false;
let stopping = false;
let seq = 0;
let audioFrames = [];
let audioBytes = 0;
let totalAudioFrames = 0;
let totalVideoFrames = 0;
let audioInfo = null;
let emitTimer = null;
let stopTimer = null;

function writeStatus(extra = {}) {
  const status = {
    connected: !!connection,
    opened,
    stream: STREAM,
    totalAudioFrames,
    totalVideoFrames,
    audioBytes,
    audio: audioInfo,
    ...extra
  };

  const tmp = STATUS + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(status, null, 2));
  fs.renameSync(tmp, STATUS);
}

function emitChunk() {
  if (!opened || audioFrames.length === 0) return;

  seq += 1;

  const frames = audioFrames.slice(-KEEP_FRAMES);
  const data = Buffer.concat(frames);

  const name = "chunk-" + String(seq).padStart(6, "0") + ".aac";
  const finalPath = path.join(CHUNK_DIR, name);
  const tempPath = finalPath + ".tmp";

  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, finalPath);

  writeStatus({
    lastChunk: name,
    lastChunkBytes: data.length,
    sequence: seq
  });
}

function shutdown(reason, exitCode = 0) {
  if (stopping) return;
  stopping = true;

  try { if (emitTimer) clearInterval(emitTimer); } catch {}
  try { if (stopTimer) clearInterval(stopTimer); } catch {}

  try { writeStatus({ stopping: true, reason }); } catch {}

  try {
    if (connection && opened) API.close_stream(connection, 0, STREAM);
  } catch {}

  setTimeout(() => {
    try { Player.DisConnectDevice("", IP); } catch {}
    setTimeout(() => process.exit(exitCode), 300);
  }, 250);
}

API.onconnect = function (conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    shutdown("connect failed " + code, 2);
    return;
  }

  connection = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  console.log("LOGIN:", result);

  if (result !== 0) {
    shutdown("login failed " + result, 2);
    return;
  }

  connection = conn;
  conn.logined = true;
  API.open_stream(conn, 0, STREAM);
};

API.onopenstream = function (conn, channel, streamid, result) {
  console.log("OPEN STREAM:", result, "channel=" + channel, "stream=" + streamid);

  if (result !== 0) {
    shutdown("open stream failed " + result, 2);
    return;
  }

  opened = true;
  fs.writeFileSync(READY, "stream-open");
  writeStatus({ openedAt: new Date().toISOString() });
  console.log("GINI STREAM READY - waiting for sound");
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

    if (!audioInfo) {
      audioInfo = {
        codec: enc,
        sampleRate: param1,
        sampleWidth: param2,
        channels: param4
      };

      writeStatus({ firstAudioAt: new Date().toISOString() });

      console.log("FIRST AUDIO FRAME:", audioInfo, "bytes=" + datalen);
      console.log("GINI AUDIO ACTIVE");
    }

    audioFrames.push(Buffer.from(data));

    if (audioFrames.length > KEEP_FRAMES) {
      audioFrames = audioFrames.slice(-KEEP_FRAMES);
    }
  } else {
    totalVideoFrames += 1;
  }
};

console.log("GINI PERSISTENT NATIVE LISTENER");
console.log("Camera:", IP + ":" + PORT);
console.log("Emit every:", EMIT_MS + "ms", "| rolling frames:", KEEP_FRAMES);

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

emitTimer = setInterval(emitChunk, EMIT_MS);

stopTimer = setInterval(() => {
  if (fs.existsSync(STOP)) {
    shutdown("stop flag");
  }
}, 250);

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
