var _ = require('lodash');
var express = require('express');
var bodyParser = require('body-parser');
var uuid = require('node-uuid');
var debug = require('./debug.js');
var defaultConfig = require('./config.json');
var defaultOptions = require('./options.json');

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(allowOrigins);

var config;
var idle = true;
var discard = false;
var longPoll;
var activePoll;
var messageQueue = [];

function AtmosphereMockServer(options) {
    config = _.assignIn({}, defaultConfig, options);

    app.options('*', preflightRequest);

    app.get(config.url, broadcastRequest);
}

AtmosphereMockServer.prototype = {
    sendResponse: function (data, delay) {
        delay = delay || 100;
        var message;
        if (!activePoll) {
            return debug.error({ message: 'There is no active polling session, skipping response' });
        }
        if (!idle) {
            return messageQueue.push(data);
        }
        idle = false;
        setTimeout(function () {
            idle = true;
            message = formatResponse(data);
            activePoll.end(message);
        }, delay);
    },
    get: function(url, callback) {
        app.get(url, callback);
    },
    post: function(url, callback) {
        app.post(url, callback);
    },
    del: function(url, callback) {
        app.del(url, callback);
    },
    put: function(url, callback) {
        app.put(url, callback);
    },
    options: function(url, callback) {
        app.options(url, callback);
    },
    start: function () {
        app.listen(config.port, function () {
            debug.log('Atmopshere Mock Server listening on port ' + config.port);
        });
    }
};

function allowOrigins(req, res, next) {
    if (config.enableXDR && !res.headersSent) {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    }
    next();
};

function preflightRequest(req, res) {
    debug.request(req.method + ' ' + req.url);

    if (config.enableXDR) {
        res.writeHead(204, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Methods': req.headers['access-control-request-method'] || 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
            'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || ''
        });
    }
    res.end();
}

function broadcastRequest(req, res) {
    debug.request(req.method + ' ' + req.url);

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

function formatResponse(message) {
    var response = '';
    if (!_.isString(message)) {
        message = JSON.stringify(message);
    }
    if (config.trackMessageLength) {
        response += message.length + '|';
    }
    return response + message;
}

module.exports = AtmosphereMockServer;