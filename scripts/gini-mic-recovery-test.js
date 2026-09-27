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
const STREAM = 0;

const RAW = path.join(RUNTIME, "gini-recovery-test.aac");
const META = path.join(RUNTIME, "gini-recovery-test.json");

fs.mkdirSync(RUNTIME, { recursive: true });

let connection = null;
let opened = false;
let finished = false;
let audioFrames = 0;
let audioBytes = 0;
let videoFrames = 0;
let audioInfo = null;
let modeSetting = null;
let hangupResult = null;
const chunks = [];

function saveAndExit(reason, code = 0) {
  if (finished) return;
  finished = true;

  if (audioBytes > 0) {
    fs.writeFileSync(RAW, Buffer.concat(chunks));
  }

  const result = {
    reason,
    opened,
    audioFrames,
    audioBytes,
    videoFrames,
    audio: audioInfo,
    modeSetting,
    hangupResult
  };

  fs.writeFileSync(META, JSON.stringify(result, null, 2));

  console.log("");
  console.log("===== GINI AUDIO RECOVERY RESULT =====");
  console.log(JSON.stringify(result, null, 2));

  try {
    if (connection && opened) API.close_stream(connection, 0, STREAM);
  } catch {}

  setTimeout(() => {
    try { Player.DisConnectDevice("", IP); } catch {}
    setTimeout(() => process.exit(code), 300);
  }, 300);
}

function requestModeSetting() {
  const config = {
    Version: "1.3.0",
    Method: "get",
    IPCam: {
      ModeSetting: {}
    },
    Authorization: {
      Verify: "",
      username: USER,
      password: PASS
    }
  };

  console.log("Reading camera audio settings...");
  Player.RemoteSetting("", IP, JSON.stringify(config));
}

function clearPossibleTalkbackState() {
  console.log("");
  console.log("Sending explicit talkback hangup reset...");
  Player.CallHangup("", IP, 0);

  setTimeout(() => {
    console.log("Opening live stream after talkback reset...");
    API.open_stream(connection, 0, STREAM);
  }, 700);
}

API.onconnect = function (conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    saveAndExit("connect failed " + code, 2);
    return;
  }

  connection = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  console.log("LOGIN:", result);

  if (result !== 0) {
    saveAndExit("login failed " + result, 2);
    return;
  }

  connection = conn;
  conn.logined = true;

  requestModeSetting();

  // Do not block recovery if the camera does not answer remote settings.
  setTimeout(() => {
    if (!opened) clearPossibleTalkbackState();
  }, 1800);
};

API.onremotesetup = function (conn, str, dataSize, result) {
  console.log("REMOTE SETUP RESULT:", result);

  if (result === 0 && str) {
    try {
      const parsed = JSON.parse(str);
      modeSetting = parsed?.IPCam?.ModeSetting || parsed;
      console.log("ModeSetting:", JSON.stringify(modeSetting, null, 2));
    } catch {
      modeSetting = { raw: str };
      console.log("ModeSetting raw:", str);
    }
  }

  if (!opened) clearPossibleTalkbackState();
};

API.onvop2pcallresult = function (conn, result) {
  hangupResult = result;
  console.log("TALKBACK RESET RESULT:", result);
};

API.onopenstream = function (conn, channel, streamid, result) {
  console.log("OPEN STREAM:", result, "channel=" + channel, "stream=" + streamid);

  if (result !== 0) {
    saveAndExit("open stream failed " + result, 2);
    return;
  }

  opened = true;

  console.log("");
  console.log("RECOVERY TEST LISTENING FOR 8 SECONDS");
  console.log("Say clearly: Gini recovery microphone test.");
  console.log("");

  setTimeout(() => {
    saveAndExit(
      audioBytes > 0 ? "real audio received" : "video received but audio still zero",
      audioBytes > 0 ? 0 : 3
    );
  }, 8000);
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
    audioFrames += 1;
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
    videoFrames += 1;
  }
};

console.log("==============================================");
console.log("GINI MICROPHONE RECOVERY DIAGNOSTIC");
console.log("==============================================");
console.log("This checks settings and clears any stale talkback state.");
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

setTimeout(() => {
  saveAndExit("hard timeout", 4);
}, 16000);
