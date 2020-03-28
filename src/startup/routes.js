const express = require("express");

const { log } = require("iipzy-shared/src/utils/logFile");
const iperf3 = require("../routes/iperf3");
const error = require("../middleware/error");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "PUT, GET, POST, DELETE, OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, x-auth-token"
    );
    next();
  });
  app.use(express.json());
  app.use("/api/iperf3", iperf3);
  app.use(error);
};
