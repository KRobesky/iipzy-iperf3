const express = require("express");
const router = express.Router();
const path = require("path");
const { spawn } = require("child_process");
const uuidv4 = require("uuid/v4");

const { configFileGet } = require("iipzy-shared/src/utils/configFile");
const Defs = require("iipzy-shared/src/defs");
const { log, timestampToString } = require("iipzy-shared/src/utils/logFile");
const { handleError } = require("iipzy-shared/src/utils/handleError");
const http = require("iipzy-shared/src/services/httpService");

const { isValidToken } = require("../backgroundServices/tokenManager");

let iperf3Path = null;
switch (process.platform) {
  case "darwin": {
    iperf3Path = "iperf3";
    break;
  }
  case "linux": {
    iperf3Path = "iperf3";
    break;
  }
  case "win32": {
    iperf3Path = path.resolve(__dirname, "../../extraResources/iperf3");
    break;
  }
}

log("iperf3Path=" + iperf3Path, "rout");

const iperf3InstanceGuid = configFileGet("instanceGuid");
const iperf3Address = configFileGet("iperf3Address");
const iperf3BasePort = configFileGet("iperf3BasePort");
log("iperf3: guid     = " + iperf3InstanceGuid);
log("iperf3: address  = " + iperf3Address);
log("iperf3: basePort = " + iperf3BasePort);

// multiple, concurrent iperf3 servers.
const numIperf3Servers = 2;
const iperf3Servers = new Map(); // port, inUse
const iperf3ExecByCancelToken = new Map(); // uuid, exec.

// setup server ports.
const basePortInt = parseInt(iperf3BasePort, 10);
for (let i = 0; i < numIperf3Servers; i++) {
  iperf3Servers.set((basePortInt + i).toString(), false);
}
let requestCount = 0;

function startIperf3Server(port, clientToken, iperf3Token, cancelToken) {
  log(
    "startIperf3Server: clientToken = " +
      clientToken +
      ", iper3Token = " +
      iperf3Token +
      ", cancelToken = " +
      cancelToken +
      ", requestCount = " +
      requestCount,
    "rout"
  );

  const args = ["-s", "-p", port, "--one-off", "--forceflush"];

  log("iperf3 args: " + args, "rout");

  let exec = null;
  try {
    throw "test exception";
    exec = spawn(iperf3Path, args);
    iperf3Servers.set(port, true);
  } catch (ex) {
    log("(Exception) startIperf3Server: " + ex);
    return ex.message;
  }

  iperf3ExecByCancelToken.set(cancelToken, exec);

  // give 30 seconds after last stdout for iperf3 to complete.
  let activeTime = Date.now();

  let interval = setInterval(() => {
    if (Date.now() - activeTime > 30 * 1000) {
      log(
        "(Error) startIperf3Server - timeout: iperf3Token = " + iperf3Token,
        "rout",
        "error"
      );
      if (exec) exec.kill(9);
    }
  }, 2 * 1000);

  exec.stdout.on("data", data => {
    //log("stdout: " + data.toString());
    activeTime = Date.now();
  });

  exec.stderr.on("data", data => {
    log("stderr: " + data.toString(), "rout");
  });

  exec.on("exit", async code => {
    log(
      `Iperf3 exited with code ${code}, clientToken = ${clientToken}, requestCount = ${requestCount}`,
      "rout"
    );
    exec = null;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (code === 0) {
      // send to server.
      await http.post("/iperf3/tokenused", {
        clientToken,
        iperf3InstanceGuid,
        iperf3Token
      });
    }
    iperf3Servers.set(port, false);
    iperf3ExecByCancelToken.delete(cancelToken);
  });

  return null;
}

router.delete("/", async (req, res) => {
  log(
    "DELETE - cancel - iperf3: timestamp = " +
      timestampToString(req.header("x-timestamp")),
    "rout"
  );

  const clientToken = req.header("x-client-token");
  log("clientToken = " + clientToken, "rout");

  const iperf3Token = req.query.iperf3token;
  log("iperf3Token = " + iperf3Token, "rout");

  if (
    !clientToken ||
    !iperf3Token ||
    iperf3Token === "" ||
    !isValidToken(iperf3Token)
  ) {
    return res.status(401).send("missing or invalid token.");
  }

  const cancelToken = req.query.canceltoken;
  log("cancelToken = " + cancelToken, "rout");

  const exec = iperf3ExecByCancelToken.get(cancelToken);
  if (exec) {
    log("canceling", "rout");
    exec.kill(9);
    iperf3ExecByCancelToken.delete(cancelToken);
  }
});

router.get("/", async (req, res) => {
  log(
    "GET - iperf3: timestamp = " + timestampToString(req.header("x-timestamp")),
    "rout"
  );

  const clientToken = req.header("x-client-token");
  log("clientToken = " + clientToken, "rout");

  const iperf3Token = req.query.iperf3token;
  log("iperf3Token = " + iperf3Token, "rout");

  if (
    !clientToken ||
    !iperf3Token ||
    iperf3Token === "" ||
    !isValidToken(iperf3Token)
  ) {
    return res.status(401).send("missing or invalid token.");
  }

  // find a free server.
  let freePort = null;
  for (var [port, inUse] of iperf3Servers) {
    if (!inUse) {
      freePort = port;
      break;
    }
  }
  if (!freePort) {
    const results = handleError(
      Defs.objectType_clientInstance,
      clientToken,
      Defs.statusIperf3ServerBusy,
      "All iperf3 servers are in use"
    );
    return res.status(Defs.httpStatusUnprocessableEntity).send(results);
  }

  requestCount++;
  const cancelToken = uuidv4();
  const message = startIperf3Server(
    freePort,
    clientToken,
    iperf3Token,
    cancelToken
  );

  if (message) {
    const results = handleError(
      Defs.objectType_clientInstance,
      clientToken,
      Defs.statusIperf3ServerFailed,
      "Iperf3 server failed to start: " + message
    );
    return res.status(Defs.httpStatusUnprocessableEntity).send(results);
  }

  setTimeout(() => {
    // give it a quarter second to start.
    res.send({ server: iperf3Address, port: freePort, cancelToken });
  }, 250);
});

module.exports = router;
