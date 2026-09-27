require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";

let connRef = null;
let phase = "connect";
let timer = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setAudioEnabled(value) {
  const config = {
    Version: "1.3.0",
    Method: "set",
    IPCam: {
      ModeSetting: {
        AudioEnabled: value
      }
    },
    Authorization: {
      Verify: "",
      username: USER,
      password: PASS
    }
  };

  console.log("Setting AudioEnabled =", value);
  Player.RemoteSetting("", IP, JSON.stringify(config));
}

function fail(message) {
  if (timer) clearTimeout(timer);
  console.error(message);
  try { Player.DisConnectDevice("", IP); } catch {}
  setTimeout(() => process.exit(2), 300);
}

API.onconnect = function (conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    fail("Connection failed: " + code);
    return;
  }

  connRef = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  console.log("LOGIN:", result);

  if (result !== 0) {
    fail("Login failed: " + result);
    return;
  }

  connRef = conn;
  conn.logined = true;

  phase = "disable";
  setAudioEnabled(false);
};

API.onremotesetup = async function (conn, str, dataSize, result) {
  console.log("REMOTE SETUP RESULT:", result, str || "");

  if (result !== 0) {
    fail("Audio reset remote setup failed in phase: " + phase);
    return;
  }

  if (phase === "disable") {
    phase = "enable-pending";
    console.log("Audio disabled successfully. Waiting 1200 ms...");
    await sleep(1200);

    phase = "enable";
    setAudioEnabled(true);
    return;
  }

  if (phase === "enable") {
    phase = "done";
    console.log("Audio re-enabled successfully.");
    console.log("Waiting 1800 ms for the camera audio subsystem to reinitialize...");
    await sleep(1800);

    try { Player.DisConnectDevice("", IP); } catch {}
    setTimeout(() => process.exit(0), 400);
  }
};

console.log("==============================================");
console.log("GINI CAMERA AUDIO SOFT RESET");
console.log("==============================================");
console.log("Toggles AudioEnabled OFF -> ON without rebooting.");
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
  0,
  "",
  null
);

timer = setTimeout(() => {
  fail("Audio soft reset timed out.");
}, 15000);
