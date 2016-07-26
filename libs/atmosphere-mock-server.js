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
app.use(logRouteDetails);

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
    sendResponse: function (data) {
        var message;
        if (!activePoll) {
            return debug.error({ message: 'There is no active polling session, skipping response' });
        }
        messageQueue.push(data);
        activePoll.end();
    },
    get: function(url, callback) {
        app.get(url, callback);
    },
    post: function(url, callback) {
        app.post(url, callback);
    },
    delete: function(url, callback) {
        app.delete(url, callback);
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

function broadcastRequest(req, res) {
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
            message += '\n\t\t' + key + ': '+ value;
        });
    }
    if (!_.isEmpty(req.query)) {
        message += '\n\tQuery parameters ->';
        _.forEach(req.query, function (value, key) {
            message += '\n\t\t' + key + ': '+ value;
        });
    }
    debug.request(message);
    next();
}

module.exports = AtmosphereMockServer;