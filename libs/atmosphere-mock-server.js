var _ = require('lodash');
var express = require('express');
var https = require('https');
var http = require('http');
var fs = require('fs');
var bodyParser = require('body-parser');
var uuid = require('node-uuid');
var ip = require('ip');
var fileUpload = require('express-fileupload');
var debug = require('./debug.js');
var defaultConfig = require('./config.json');
var defaultOptions = require('./options.json');

var app = express();

app.use(fileUpload());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(allowOrigins);
app.use(logRouteDetails);

var expressWs;
var config;
var discard = false;
var longPoll;
var activePoll;
var messageQueue = [];

var websocketKeyMap = {};

function AtmosphereMockServer(options) {
  config = _.assignIn({}, defaultConfig, options);

  app.options('*', preflightRequest);

  app.get(config.url, broadcastRequest);

  var options = {
    key: fs.readFileSync(config.sslKey),
    cert: fs.readFileSync(config.sslCert)
  };
  var httpsServer = https.createServer(options, app).listen(config.port, function () {
    console.log('Server started on', 'https://' + ip.address() + ':' + config.port);
  });

  if (config.transport === 'websocket') {
    expressWs = require('express-ws')(app, httpsServer);
    app.ws(config.url, broadcastWebsocketRequest);
  }

  if (!!config.templateEngine) {
    app.set('view engine', 'pug');
  }

  if (!!config.staticDir) {
    if (!fs.existsSync(config.staticDir + config.uploadDir)){
      fs.mkdirSync(config.staticDir + config.uploadDir);
    }
    app.use(express.static(config.staticDir, config.staticOptions));
  }

  if (config.libraryDir) {
    app.use(express.static(config.staticDir + '/' + config.libraryDir, config.staticOptions));
  }
}

AtmosphereMockServer.prototype = {
  sendResponse: function (data) {
    if (config.transport === 'websocket') {
      var broadcastWs = expressWs.getWss(config.url);
      var websocketData = websocketKeyMap[data.clientSessionId];
      if (websocketData && websocketData.key) {
        _.forEach(broadcastWs.clients, function (client) {
          if (websocketData.key === client.upgradeReq.headers['sec-websocket-key']) {
            var formattedMessage = formatResponse(data);
            client.send(formattedMessage);
          }
        });
      } else {
        return debug.error({message: 'There is no active websocket connection, skipping response'});
      }
    } else {
      if (!activePoll) {
        return debug.error({message: 'There is no active polling session, skipping response'});
      }
      messageQueue.push(data);
      activePoll.end();
    }
  },
  all: function (url, callback) {
    app.all(url, callback);
  },
  get: function (url, callback) {
    app.get(url, callback);
  },
  post: function (url, callback) {
    app.post(url, callback);
  },
  delete: function (url, callback) {
    app.delete(url, callback);
  },
  put: function (url, callback) {
    app.put(url, callback);
  },
  options: function (url, callback) {
    app.options(url, callback);
  },
  param: function (url, callback) {
    app.param(url, callback);
  }
};

function allowOrigins(req, res, next) {
  if (config.enableXDR && !res.headersSent) {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  }
  next();
}

function preflightRequest(req, res) {
  if (config.enableXDR) {
    res.writeHead(204, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Methods': req.headers['access-control-request-method'] || 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || ''
    });
  }
  return res.end();
}

function broadcastRequest(req, res) {
  if (config.transport === 'websocket') {
    return broadcastNonWebsocketRequest(req, res);
  }
  return broadcastLongPollRequest(req, res);
}

function broadcastLongPollRequest(req, res) {
  var message;
  var formattedMessage;
  var options = defaultOptions;
  res.writeHead(options.statusCode, options.headers);

  if (config.transport !== 'long-polling') {
    config.transport = 'long-polling';
    debug.log('setting config.transport: ' + config.transport);
  }

  if (req.query['X-Atmosphere-Transport'] === 'close' || discard) {
    discard = false;
    return res.end();
  }

  if (req.query['X-Atmosphere-tracking-id'] === '0') {
    discard = true;
    var messageParts = [uuid.v4(), '0', config.heartbeatPadding];
    message = messageParts.join(config.messageDelimiter);
    formattedMessage = formatResponse(message);
    return res.end(formattedMessage);
  }

  if (messageQueue.length) {
    message = messageQueue.shift();
    formattedMessage = formatResponse(message);
    return res.end(formattedMessage);
  }

  activePoll = res;
  longPoll && clearTimeout(longPoll);
  longPoll = setTimeout(function () {
    if (activePoll) {
      activePoll.end('\n');
    }
  }, config.pollTimeout);
}

function broadcastWebsocketRequest(ws, req) {
  if (req.query['X-Atmosphere-tracking-id'] === '0') {
    var sessionId = uuid.v4();
    var messageParts = [sessionId, config.clientHeartbeatInterval, config.heartbeatPadding];
    var formattedMessage = formatResponse(messageParts.join(config.messageDelimiter));

    ws.send(formattedMessage);

    websocketKeyMap[sessionId] = {
      key: req.headers['sec-websocket-key'],
      intervalId: setInterval(_.bind(function () {
        try {
          ws.send(formatResponse(config.heartbeatPadding));
        } catch (error) {
          clearInterval(websocketKeyMap[this].intervalId);
          _.unset(websocketKeyMap, this);
          debug.log('Clearing websocket heartbeat interval for session id: ' + this);
        }
      }, sessionId), config.serverHeartbeatInterval)
    };
  }
}

function broadcastNonWebsocketRequest(req, res) {
  if (req.query['X-Atmosphere-Transport'] === 'close') {
    var sessionId = req.query['X-Atmosphere-tracking-id'];
    if (websocketKeyMap[sessionId]) {
      clearInterval(websocketKeyMap[sessionId].intervalId);
      _.unset(websocketKeyMap, sessionId);
    } else {
      debug.error({message: 'Could not find websocket connection to remove'});
    }
  }
  return res.end();
}

function formatResponse(message) {
  var response = '';
  if (!_.isString(message)) {
    message = JSON.stringify(message);
  }
  if (config.trackMessageLength) {
    response += message.length + '|';
  }
  debug.response(response + message);
  return response + message;
}

function logRouteDetails(req, res, next) {
  var message = 'Request details ->';
  message += '\n\tMethod: ' + req.method;
  message += '\n\tURL: ' + req.url;
  if (!_.isEmpty(req.params)) {
    message += '\n\tPath parameters ->';
    _.forEach(req.params, function (value, key) {
      message += '\n\t\t' + key + ': ' + value;
    });
  }
  if (!_.isEmpty(req.query)) {
    message += '\n\tQuery parameters ->';
    _.forEach(req.query, function (value, key) {
      message += '\n\t\t' + key + ': ' + value;
    });
  }
  debug.request(message);
  next();
}

module.exports = AtmosphereMockServer;
