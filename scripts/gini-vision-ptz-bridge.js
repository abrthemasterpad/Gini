"use strict";

require("./gini-env");
require("../esee-sdk/CameraSDK/play");

const readline = require("readline");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const PULSE_MS = Math.max(
  60,
  Math.min(
    1000,
    Number(argValue("--pulse-ms", process.env.GINI_VISION_PULSE_MS || 120))
  )
);

// CameraSDK documentation says PTZ param 1-5 is movement speed.
// Vision uses the slowest speed by default. This does NOT change Gini's
// already-verified manual PTZ path elsewhere.
const SPEED_PARAM = Math.max(
  1,
  Math.min(
    5,
    Number(argValue("--speed", process.env.GINI_VISION_PTZ_SPEED || 1))
  )
);

const PARAM_STOP = 0;

const PTZ_TYPES = {
  up: 2,
  down: 3,
  left: 4,
  right: 5
};

let connection = null;
let ready = false;
let busy = false;
let stopping = false;
let pending = null;
let watchdog = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clearWatchdog() {
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

function writeLine(text) {
  process.stdout.write(String(text) + "\n");
}

function connect() {
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
}

function emergencyStop(reason) {
  try {
    Player.ptz_ctrl("", IP, 0, 0, PARAM_STOP);
    writeLine("GINI_PTZ_EMERGENCY_STOP " + reason);
  } catch {}
}

function finishPending(ok, detail) {
  clearWatchdog();

  if (!pending) return;

  const resolve = pending.resolve;
  pending = null;
  busy = false;

  resolve({ ok, detail });
}

function armWatchdog(phase, ms) {
  clearWatchdog();

  watchdog = setTimeout(() => {
    if (!pending) return;

    writeLine("GINI_PTZ_TIMEOUT " + phase);
    emergencyStop("timeout-" + phase);
    finishPending(false, "timeout-" + phase);
  }, ms);
}

// Important: override the SDK's default PTZ callback.
// The default callback prints Chinese text. On Windows that can kill the
// Python stdout reader when it decodes the bridge output using the local
// code page. This callback also gives us deterministic move/STOP sequencing.
API.onptzresult = function (_conn, result) {
  if (!pending) {
    writeLine("GINI_PTZ_STRAY_RESULT " + result);
    return;
  }

  if (pending.phase === "wait-move-ack") {
    if (result !== 0) {
      emergencyStop("move-rejected");
      finishPending(false, "move-result-" + result);
      return;
    }

    writeLine(
      "GINI_PTZ_MOVE_ACK " +
      pending.direction +
      " speed=" + SPEED_PARAM
    );

    pending.phase = "moving";
    clearWatchdog();

    // Start the movement-duration clock only AFTER the camera acknowledges
    // the movement command. This prevents STOP from racing ahead of MOVE.
    pending.moveTimer = setTimeout(() => {
      if (!pending || pending.phase !== "moving") return;

      pending.phase = "wait-stop-ack";
      writeLine("GINI_PTZ_STOP_SENT");

      Player.ptz_ctrl("", IP, 0, 0, PARAM_STOP);
      armWatchdog("stop-ack", 2500);
    }, PULSE_MS);

    return;
  }

  if (pending.phase === "wait-stop-ack") {
    if (result !== 0) {
      emergencyStop("stop-rejected");
      finishPending(false, "stop-result-" + result);
      return;
    }

    writeLine("GINI_PTZ_STOP_ACK");
    const direction = pending.direction;

    // Give the motor/firmware a short release interval before another pulse.
    clearWatchdog();
    setTimeout(() => {
      if (!pending) return;
      finishPending(true, "moved-" + direction);
    }, 180);

    return;
  }

  // A response while the timer is running is unexpected; hold safely.
  if (pending.phase === "moving") {
    writeLine("GINI_PTZ_EXTRA_RESULT " + result);
  }
};

async function pulse(direction) {
  const type = PTZ_TYPES[direction];

  if (!type || !ready || busy || stopping) {
    return { ok: false, detail: "not-ready-or-busy" };
  }

  busy = true;

  return new Promise(resolve => {
    pending = {
      direction,
      type,
      phase: "wait-move-ack",
      resolve,
      moveTimer: null
    };

    writeLine(
      "GINI_PTZ_MOVE_SENT " +
      direction +
      " speed=" + SPEED_PARAM +
      " pulse=" + PULSE_MS + "ms"
    );

    Player.ptz_ctrl("", IP, 0, type, SPEED_PARAM);
    armWatchdog("move-ack", 2500);
  });
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;

  clearWatchdog();

  if (pending && pending.moveTimer) {
    clearTimeout(pending.moveTimer);
  }

  emergencyStop("shutdown");

  setTimeout(() => {
    try {
      Player.DisConnectDevice("", IP);
    } catch {}

    setTimeout(() => process.exit(code), 250);
  }, 250);
}

API.onconnect = function (conn, code) {
  if (code !== 0) {
    writeLine("ERROR connect=" + code);
    shutdown(2);
    return;
  }

  connection = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  if (result !== 0) {
    writeLine("ERROR login=" + result);
    shutdown(2);
    return;
  }

  connection = conn;
  connection.logined = true;
  ready = true;

  writeLine("READY");
  writeLine(
    "GINI_PTZ_READY speed=" + SPEED_PARAM +
    " pulse=" + PULSE_MS + "ms"
  );
};

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", async line => {
  const cmd = line.trim().toLowerCase();

  if (cmd === "quit" || cmd === "exit") {
    shutdown(0);
    return;
  }

  if (!PTZ_TYPES[cmd]) {
    writeLine("GINI_PTZ_ACK IGNORED " + cmd);
    return;
  }

  if (!ready) {
    writeLine("GINI_PTZ_ACK NOT_READY");
    return;
  }

  if (busy) {
    writeLine("GINI_PTZ_ACK BUSY");
    return;
  }

  const result = await pulse(cmd);

  if (result.ok) {
    writeLine("GINI_PTZ_ACK MOVED " + cmd);
  } else {
    writeLine("GINI_PTZ_ACK BLOCKED " + cmd + " " + result.detail);
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

connect();

setTimeout(() => {
  if (!ready && !stopping) {
    writeLine("ERROR timeout");
    shutdown(2);
  }
}, 10000);
