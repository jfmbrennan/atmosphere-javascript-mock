var _ = require('lodash');
var express = require('express');
var https = require('https');
var http = require('http');
var fs = require('fs');
var bodyParser = require('body-parser');
var uuid = require('node-uuid');
var debug = require('./debug.js');
var defaultConfig = require('./config.json');
var defaultOptions = require('./options.json');

var app = express();
var expressWs = require('express-ws')(app);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(allowOrigins);
app.use(logRouteDetails);

var config;
var discard = false;
var longPoll;
var activePoll;
var messageQueue = [];

function AtmosphereMockServer(options) {
    config = _.assignIn({}, defaultConfig, options);

    app.options('*', preflightRequest);

    if (config.transport === 'websocket') {
        config.url += '*';
        app.ws(config.url, broadcastWebsocketRequest);
    } else {
        app.get(config.url, broadcastLongPollRequest);
    }
}

AtmosphereMockServer.prototype = {
    sendResponse: function (data) {
        if (config.transport === 'websocket') {
            var broadcastWs = expressWs.getWss(config.url);
            _.forEach(broadcastWs.clients, function (client) {
                var formattedMessage = formatResponse(data);
                client.send(formattedMessage);
            });
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
    start: function () {
        app.listen(config.port, config.host, function () {
            debug.log('Atmosphere Mock Server listening on port ' + config.port);
        });
        if (config.ssl) {
            var options = {
                key: fs.readFileSync(config.sslKey),
                cert: fs.readFileSync(config.sslCert)
            };
            https.createServer(options, app).listen(config.sslPort, function () {
                debug.log('Secure Atmosphere Mock Server listening on port ' + config.sslPort);
            });
        }
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
    res.end();
}

function broadcastLongPollRequest(req, res) {
    var message;
    var formattedMessage;
    var options = defaultOptions;
    res.writeHead(options.statusCode, options.headers);

    if (req.query['X-Atmosphere-Transport'] === 'close' || discard) {
        discard = false;
        return res.end();
    }

    if (req.query['X-Atmosphere-tracking-id'] === '0') {
        discard = true;
        message = uuid.v4() + '|0|X|';
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
        var message = uuid.v4() + '|0|X|';
        var formattedMessage = formatResponse(message);
        ws.send(formattedMessage);
    }
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