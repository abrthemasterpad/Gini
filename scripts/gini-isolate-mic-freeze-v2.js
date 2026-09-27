const path = require("path");
const { spawn } = require("child_process");

require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const ROOT = path.resolve(__dirname, "..");
const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";
const STREAM = Number(process.env.GINI_CAMERA_STREAM || 0);

const PTZ = path.join(ROOT, "gini.ps1");
const SAY_LOCAL = path.join(ROOT, "scripts", "gini-say-local.ps1");

let connection = null;
let opened = false;
let audioFrames = 0;
let audioBytes = 0;
let videoFrames = 0;
let firstAudio = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(file, args) {
  return new Promise(resolve => {
    const child = spawn(file, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: "inherit"
    });

    child.on("error", err => resolve({ code: -1, error: err }));
    child.on("close", code => resolve({ code: code ?? -1 }));
  });
}

function snap() {
  return { audioFrames, audioBytes, videoFrames };
}

function printDelta(label, before, after) {
  const da = after.audioFrames - before.audioFrames;
  const db = after.audioBytes - before.audioBytes;
  const dv = after.videoFrames - before.videoFrames;

  console.log(
    "[" + label + "] +" + da + " audio frames, +" +
    db + " audio bytes, +" + dv + " video frames"
  );

  return { da, db, dv };
}

async function observe(seconds, label) {
  const before = snap();

  for (let i = 1; i <= seconds; i++) {
    await sleep(1000);

    if (i === 5 || i === 10 || i === seconds) {
      const now = snap();
      console.log(
        "[" + label + " " + i + "s] video=" + now.videoFrames +
        " audio=" + now.audioFrames +
        " audioBytes=" + now.audioBytes
      );
    }
  }

  const after = snap();
  return printDelta(label, before, after);
}

function healthy(delta, seconds) {
  // A healthy camera normally delivers roughly 7-8 AAC frames/sec.
  // Keep threshold deliberately loose so jitter doesn't create false failures.
  return delta.da >= Math.max(10, Math.floor(seconds * 2));
}

async function testSequence() {
  console.log("");
  console.log("STEP 1 - BASELINE ONLY for 12 seconds.");
  const base = await observe(12, "BASELINE");

  if (!healthy(base, 12)) {
    console.log("");
    console.log("RESULT: BASELINE MIC IS NOT STABLE.");
    console.log("Reboot once, then rerun this test.");
    shutdown(3);
    return;
  }

  console.log("");
  console.log("STEP 2 - LOCAL PC SPEECH FIRST.");
  console.log("No PTZ and NO camera talkback have been used yet.");

  const say = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", SAY_LOCAL,
      "Gini local speaker isolation test."
    ]
  );

  if (say.code !== 0) {
    console.log("Local speech failed with code", say.code);
    shutdown(5);
    return;
  }

  const localDelta = await observe(15, "AFTER LOCAL SPEECH");

  if (!healthy(localDelta, 15)) {
    console.log("");
    console.log("RESULT: LOCAL PC SPEECH FIRST -> MIC FROZE.");
    console.log("PTZ and camera talkback were never used in this run.");
    shutdown(11);
    return;
  }

  console.log("");
  console.log("LOCAL SPEECH PASSED. AAC stayed alive.");
  console.log("");
  console.log("STEP 3 - PTZ ONLY: turning left.");

  const ptz = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", PTZ,
      "-Action", "left",
      "-Step", "1",
      "-Speed", "8"
    ]
  );

  if (ptz.code !== 0) {
    console.log("PTZ failed with code", ptz.code);
    shutdown(4);
    return;
  }

  const ptzDelta = await observe(15, "AFTER PTZ");

  console.log("");

  if (!healthy(ptzDelta, 15)) {
    console.log("RESULT: PTZ -> MIC FROZE.");
    console.log("Camera talkback was never used in this run.");
    shutdown(10);
    return;
  }

  console.log("RESULT: BASELINE + LOCAL SPEECH + PTZ ALL SURVIVED.");
  console.log("The freeze trigger is elsewhere in the continuous brain path.");
  shutdown(0);
}

function shutdown(code) {
  try {
    if (connection && opened) API.close_stream(connection, 0, STREAM);
  } catch {}

  setTimeout(() => {
    try { Player.DisConnectDevice("", IP); } catch {}
    setTimeout(() => process.exit(code), 400);
  }, 250);
}

API.onconnect = function(conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    console.error("Native connection failed:", code);
    process.exit(2);
    return;
  }

  connection = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function(conn, result) {
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

API.onopenstream = function(conn, channel, streamid, result) {
  console.log("OPEN STREAM:", result, "channel=" + channel, "stream=" + streamid);

  if (result !== 0) {
    console.error("Live stream open failed:", result);
    process.exit(2);
    return;
  }

  opened = true;
  testSequence().catch(err => {
    console.error(err);
    shutdown(9);
  });
};

API.onrecvframeex = function(
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

    if (!firstAudio) {
      firstAudio = true;
      console.log(
        "FIRST AUDIO FRAME:",
        { codec: enc, sampleRate: param1, sampleWidth: param2, channels: param4 },
        "bytes=" + datalen
      );
    }
  } else {
    videoFrames += 1;
  }
};

console.log("==================================================");
console.log("GINI MIC FREEZE ISOLATION TEST v2");
console.log("==================================================");
console.log("Order: baseline -> LOCAL SPEECH FIRST -> PTZ.");
console.log("Camera talkback is NEVER used.");
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

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
