require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";
const STREAM = Number(process.env.GINI_CAMERA_STREAM || 0);

let connection = null;
let opened = false;
let audioFrames = 0;
let audioBytes = 0;
let videoFrames = 0;
let firstAudio = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  return printDelta(label, before, snap());
}

function healthy(delta, seconds) {
  return delta.da >= Math.max(10, Math.floor(seconds * 2));
}

async function main() {
  console.log("");
  console.log("STEP 1 - baseline native mic for 12 seconds.");
  const base = await observe(12, "BASELINE");

  if (!healthy(base, 12)) {
    console.log("RESULT: BASELINE MIC NOT HEALTHY. Reboot and rerun.");
    shutdown(3);
    return;
  }

  console.log("");
  console.log("STEP 2 - NATIVE SDK PTZ LEFT on the SAME WebSocket session.");
  console.log("No HTTP CGI and no camera talkback will be used.");

  // SDK mapping from CameraSDK/play.js:
  // 0 stop, 2 up, 3 down, 4 left, 5 right.
  // Speed param is 1-5.
  Player.ptz_ctrl("", IP, 0, 4, 3);
  await sleep(250);
  Player.ptz_ctrl("", IP, 0, 0, 3);

  console.log("Native PTZ command sent. Watching mic for full 15 seconds...");
  const after = await observe(15, "AFTER NATIVE PTZ");

  console.log("");

  if (healthy(after, 15)) {
    console.log("RESULT: NATIVE SDK PTZ SURVIVED - MIC STAYED ALIVE.");
    console.log("Likely blocker is the HTTP CGI PTZ path, not motor movement itself.");
    shutdown(0);
    return;
  }

  console.log("RESULT: NATIVE SDK PTZ ALSO FROZE THE MIC.");
  console.log("That points to camera firmware/motor-control interaction, not only HTTP CGI.");
  shutdown(10);
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
  main().catch(err => {
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
console.log("GINI NATIVE PTZ + MIC TEST");
console.log("==================================================");
console.log("Purpose: compare SDK PTZ against the CGI PTZ path.");
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
