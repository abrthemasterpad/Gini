"use strict";

const net = require("net");

const BRIDGE_HOST = process.env.XSIGHT_H264_HOST || "127.0.0.1";
const BRIDGE_PORT = Number(process.env.XSIGHT_H264_PORT || 23000);

function findStartCodes(buffer) {
  const starts = [];
  for (let i = 0; i <= buffer.length - 3; i += 1) {
    if (buffer[i] !== 0 || buffer[i + 1] !== 0) continue;

    if (buffer[i + 2] === 1) {
      starts.push({ index: i, length: 3 });
      i += 2;
      continue;
    }

    if (
      i <= buffer.length - 4 &&
      buffer[i + 2] === 0 &&
      buffer[i + 3] === 1
    ) {
      starts.push({ index: i, length: 4 });
      i += 3;
    }
  }
  return starts;
}

function extractAnnexBNals(buffer) {
  const starts = findStartCodes(buffer);
  const out = [];

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length
      ? starts[i + 1].index
      : buffer.length;
    const headerIndex = start.index + start.length;

    if (headerIndex >= end) continue;

    out.push({
      type: buffer[headerIndex] & 0x1f,
      data: Buffer.from(buffer.subarray(start.index, end))
    });
  }

  return out;
}

class H264BootstrapCache {
  constructor() {
    this.sps = null;
    this.pps = null;
    this.idr = null;
  }

  observe(chunk) {
    for (const nal of extractAnnexBNals(chunk)) {
      if (nal.type === 7) this.sps = nal.data;
      if (nal.type === 8) this.pps = nal.data;
      if (nal.type === 5) this.idr = nal.data;
    }
  }

  payload() {
    const parts = [this.sps, this.pps, this.idr].filter(Boolean);
    return parts.length ? Buffer.concat(parts) : Buffer.alloc(0);
  }
}

function isVideoFrameType(frameType) {
  return Number(frameType) !== 0;
}

function startBridge() {
  try {
    require("./gini-env");
  } catch {}

  require("../esee-sdk/CameraSDK/play");

  const Player = global.VideoPlayer;
  const API = global.ConnectApi;

  const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
  const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
  const USER = process.env.GINI_CAMERA_USER || "admin";
  const PASS = process.env.GINI_CAMERA_PASSWORD || "";
  const STREAM = Number(process.env.GINI_CAMERA_STREAM || 0);

  const clients = new Set();
  const cache = new H264BootstrapCache();

  let connection = null;
  let streamOpened = false;
  let stopping = false;
  let videoFrames = 0;
  let videoBytes = 0;
  let firstVideoAt = 0;

  function safeCloseSocket(socket) {
    try {
      socket.destroy();
    } catch {}
    clients.delete(socket);
  }

  const server = net.createServer((socket) => {
    if (socket.remoteAddress && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(socket.remoteAddress)) {
      safeCloseSocket(socket);
      return;
    }

    socket.setNoDelay(true);
    socket._xsightBlocked = false;

    const bootstrap = cache.payload();
    if (bootstrap.length) {
      socket.write(bootstrap);
    }

    socket.on("drain", () => {
      socket._xsightBlocked = false;
    });
    socket.on("error", () => safeCloseSocket(socket));
    socket.on("close", () => clients.delete(socket));

    clients.add(socket);

    console.log(
      "XSIGHT_BRIDGE_CLIENT connected clients=" + clients.size
    );
  });

  server.on("error", (error) => {
    console.error("XSIGHT_BRIDGE_SERVER_ERROR", error.message);
    shutdown(2);
  });

  function fanOut(chunk) {
    for (const socket of clients) {
      if (socket.destroyed || socket._xsightBlocked) continue;
      try {
        if (!socket.write(chunk)) {
          socket._xsightBlocked = true;
        }
      } catch {
        safeCloseSocket(socket);
      }
    }
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

  function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;

    try {
      if (connection && streamOpened) {
        API.close_stream(connection, 0, STREAM);
      }
    } catch {}

    try {
      Player.DisConnectDevice("", IP);
    } catch {}

    for (const socket of clients) {
      safeCloseSocket(socket);
    }

    try {
      server.close(() => process.exit(code));
    } catch {
      process.exit(code);
    }

    setTimeout(() => process.exit(code), 1000).unref();
  }

  API.onconnect = function (conn, code) {
    console.log("TRUEVIEW_CONNECT", code);

    if (code !== 0) {
      console.error("TRUEVIEW_CONNECT_FAILED", code);
      shutdown(2);
      return;
    }

    connection = conn;
    API.login(conn, USER, PASS);
  };

  API.onloginresult = function (conn, result) {
    console.log("TRUEVIEW_LOGIN", result);

    if (result !== 0) {
      console.error("TRUEVIEW_LOGIN_FAILED", result);
      shutdown(2);
      return;
    }

    connection = conn;
    conn.logined = true;
    API.open_stream(conn, 0, STREAM);
  };

  API.onopenstream = function (conn, channel, streamId, result) {
    console.log(
      "TRUEVIEW_STREAM_OPEN",
      result,
      "channel=" + channel,
      "stream=" + streamId
    );

    if (result !== 0) {
      console.error("TRUEVIEW_STREAM_OPEN_FAILED", result);
      shutdown(2);
      return;
    }

    streamOpened = true;
  };

  API.onrecvframeex = function (
    _conn,
    frameType,
    data,
    dataLen,
    _channel,
    _param1,
    _param2,
    enc
  ) {
    if (!isVideoFrameType(frameType)) return;

    const chunk = Buffer.from(data).subarray(0, Number(dataLen) || undefined);

    if (!chunk.length) return;

    videoFrames += 1;
    videoBytes += chunk.length;

    if (!firstVideoAt) {
      firstVideoAt = Date.now();
      console.log(
        "TRUEVIEW_FIRST_VIDEO_FRAME codec=" + String(enc || "unknown") +
        " bytes=" + chunk.length
      );
    }

    cache.observe(chunk);
    fanOut(chunk);
  };

  server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    console.log("==================================================");
    console.log("GINI -> XSIGHT TRUEVIEW H264 BRIDGE");
    console.log("==================================================");
    console.log("Camera:", IP + ":" + PORT);
    console.log("Bridge:", "tcp://" + BRIDGE_HOST + ":" + BRIDGE_PORT);
    console.log("Video: raw H264 only");
    console.log("Audio: discarded");
    console.log("Disk recording: disabled");
    console.log("Exposure: loopback only");
    console.log("==================================================");

    connectCamera();
  });

  const startupWatchdog = setTimeout(() => {
    if (!firstVideoAt && !stopping) {
      console.error("TRUEVIEW_VIDEO_TIMEOUT no H264 frames within 20 seconds");
      shutdown(2);
    }
  }, 20000);

  startupWatchdog.unref();

  const statusTimer = setInterval(() => {
    console.log(
      "XSIGHT_BRIDGE_STATUS " +
      JSON.stringify({
        streamOpened,
        videoFrames,
        videoBytes,
        clients: clients.size,
        bootstrapReady: Boolean(cache.sps && cache.pps && cache.idr)
      })
    );
  }, 5000);

  statusTimer.unref();

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

if (require.main === module) {
  startBridge();
}

module.exports = {
  H264BootstrapCache,
  extractAnnexBNals,
  findStartCodes,
  isVideoFrameType
};
