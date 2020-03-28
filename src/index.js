const express = require("express");
const app = express();
const https = require("https");
const fs = require("fs");

const { ConfigFile } = require("iipzy-shared/src/utils/configFile");
const Defs = require("iipzy-shared/src/defs");
const { log, logInit } = require("iipzy-shared/src/utils/logFile");
const logPath = process.platform === "win32" ? "c:/temp/" : "/var/log";
logInit(logPath, "iipzy-iperf3");
const http = require("iipzy-shared/src/services/httpService");
const { processErrorHandler } = require("iipzy-shared/src/utils/utils");

const { tokenManagerInit } = require("./backgroundServices/tokenManager");

const userDataPath = "/etc/iipzy";
let configFile = null;
let server = null;

async function main() {
  configFile = new ConfigFile(userDataPath, Defs.configFilename);
  await configFile.init();

  require("./startup/routes")(app);

  http.setBaseURL(configFile.get("serverAddress"));

  tokenManagerInit();

  const port = configFile.get("iipzyIperf3ServerPort");
  server = https
    .createServer(
      {
        key: fs.readFileSync(__dirname + "/certificate/server.key"),
        cert: fs.readFileSync(__dirname + "/certificate/server.cert")
      },
      app
    )
    .listen(port, () => {
      log(`Listening on port ${port}...`, "strt");
    });
}

processErrorHandler();
// process.on("uncaughtException", function(err) {
//   log("(Exception) uncaught exception: " + err, "strt");
//   log("stopping in 2 seconds", "strt");
//   setTimeout(() => {
//     process.exit(1);
//   }, 2 * 1000);
// });

main();

module.exports = server;
