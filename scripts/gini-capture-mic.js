const fs = require("fs");
const path = require("path");

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
const CAPTURE_MS = Number(process.env.GINI_CAPTURE_MS || 8000);

fs.mkdirSync(RUNTIME, { recursive: true });

const RAW = path.join(RUNTIME, "gini-mic.aac");
const META = path.join(RUNTIME, "gini-mic-meta.json");

let connection = null;
let opened = false;
let finished = false;
let audioFrames = 0;
let audioBytes = 0;
let videoFrames = 0;
let audioInfo = null;
const chunks = [];

function finish(reason) {
  if (finished) return;
  finished = true;

  if (audioBytes > 0) {
    fs.writeFileSync(RAW, Buffer.concat(chunks));
  }

  const result = {
    stream: STREAM,
    reason,
    opened,
    audioFrames,
    audioBytes,
    videoFrames,
    audio: audioInfo
  };

  fs.writeFileSync(META, JSON.stringify(result, null, 2));

  console.log("");
  console.log("===== GINI MIC CAPTURE =====");
  console.log(JSON.stringify(result, null, 2));

  try {
    if (connection && opened) API.close_stream(connection, 0, STREAM);
  } catch {}

  setTimeout(() => {
    try {
      Player.DisConnectDevice("", IP);
    } catch {}

    setTimeout(() => process.exit(audioBytes > 0 ? 0 : 2), 300);
  }, 300);
}

API.onconnect = function (conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    finish("connect failed " + code);
    return;
  }

  connection = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  console.log("LOGIN:", result);

  if (result !== 0) {
    finish("login failed " + result);
    return;
  }

  connection = conn;
  conn.logined = true;

  console.log("Opening native live stream:", STREAM);
  API.open_stream(conn, 0, STREAM);
};

API.onopenstream = function (conn, channel, streamid, result) {
  console.log("OPEN STREAM:", result, "channel=" + channel, "stream=" + streamid);

  if (result !== 0) {
    finish("open stream failed " + result);
    return;
  }

  opened = true;

  console.log("");
  console.log("Gini is listening. Speak now...");
  console.log("");

  setTimeout(() => finish("capture complete"), CAPTURE_MS);
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
    audioFrames++;
    audioBytes += datalen;

    if (!audioInfo) {
      audioInfo = {
        codec: enc,
        sampleRate: param1,
        sampleWidth: param2,
        channels: param4
      };

      console.log("FIRST AUDIO FRAME:", audioInfo, "bytes=" + datalen);
    }

    chunks.push(Buffer.from(data));
  } else {
    videoFrames++;
  }
};

console.log("GINI NATIVE MICROPHONE");
console.log("Camera:", IP + ":" + PORT);

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

setTimeout(() => finish("hard timeout"), CAPTURE_MS + 7000);
