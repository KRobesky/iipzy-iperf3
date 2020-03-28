const uuidv4 = require("uuid/v4");

const { configFileGet } = require("iipzy-shared/src/utils/configFile");
const Defs = require("iipzy-shared/src/defs");
const http = require("iipzy-shared/src/services/httpService");
const { log } = require("iipzy-shared/src/utils/logFile");

const tokenByUuid = new Map();

let iperf3InstanceGuid = null;

let inCreateToken = false;
let inAgeTokens = false;

function tokenManagerInit() {
  log("tokenManagerInit", "bkgd");
  setTimeout(() => {
    log("tokenManagerInit - start createToken", "bkgd");
    setInterval(() => {
      if (!inCreateToken) {
        inCreateToken = true;
        createToken();
        inCreateToken = false;
      }
    }, 5 * 1000);
  }, 1 * 1000);

  setTimeout(() => {
    log("tokenManagerInit - start ageTokens", "bkgd");
    setInterval(() => {
      if (!inAgeTokens) {
        inAgeTokens = true;
        ageTokens();
        inAgeTokens = false;
      }
    }, 5 * 1000);
  }, 4 * 1000);

  iperf3InstanceGuid = configFileGet("instanceGuid");
}

async function createToken() {
  log(">>>createToken", "bkgd");

  try {
    const token = uuidv4();
    const timestamp = Date.now();
    log("createToken: token = " + token + ", timestamp = " + timestamp, "bkgd");
    // add to cache with create time.
    tokenByUuid.set(token, timestamp);
    // send to server.
    await http.post("/iperf3/token", {
      iperf3InstanceGuid: iperf3InstanceGuid,
      iperf3Token: token
    });
  } catch (ex) {
    log("(Exception) createToken: " + ex, "bkgd");
  }
  log("<<<createToken", "bkgd");
}

function ageTokens() {
  log(">>>ageToken", "bkgd");

  try {
    // remove token older than 30 seconds
    const curTimestamp = Date.now();
    tokenByUuid.forEach((value, key, map) => {
      if (value + 30 * 1000 < curTimestamp) {
        log(
          "ageTokens: removing token = " + key + ", timestamp = " + value,
          "bkgd"
        );
        map.delete(key);
      }
    });
  } catch (ex) {
    log("(Exception) createToken: " + ex, "bkgd");
  }
  log("<<<ageTokens", "bkgd");
}

function isValidToken(token) {
  log("isValidToken: token = " + token, "bkgd");
  // check cache.
  return tokenByUuid.has(token);
}

module.exports = { tokenManagerInit, isValidToken };
