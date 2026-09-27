const path = require("path");

require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";

let sent = false;

function finish(code = 0) {
  setTimeout(() => process.exit(code), 300);
}

API.onconnect = function (conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    console.error("Connection failed:", code);
    finish(2);
    return;
  }

  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  console.log("LOGIN:", result);

  if (result !== 0) {
    console.error("Login failed:", result);
    finish(2);
    return;
  }

  conn.logined = true;

  const config = {
    Version: "1.3.0",
    Method: "set",
    Authorization: {
      Verify: "",
      username: USER,
      password: PASS
    },
    IPCam: {
      SystemOperation: {
        Reboot: true
      }
    }
  };

  console.log("Sending camera reboot command...");
  sent = true;
  Player.RemoteSetting("", IP, JSON.stringify(config));

  // A successful reboot can drop the socket before a response arrives.
  setTimeout(() => {
    console.log("Reboot command sent. Camera should disconnect now.");
    finish(0);
  }, 2500);
};

API.onremotesetup = function (conn, str, dataSize, result) {
  console.log("REMOTE SETUP RESULT:", result);
  if (str) console.log(str);
};

console.log("GINI CAMERA SOFT REBOOT");
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
  0,
  "",
  null
);

setTimeout(() => {
  if (!sent) {
    console.error("Timed out before reboot command could be sent.");
    process.exit(3);
  }
}, 10000);
