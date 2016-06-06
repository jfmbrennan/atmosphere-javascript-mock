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

var config;
var stack = [];

function AtmosphereMockServer(options) {
    config = _.assignIn({}, defaultConfig, options);

    app.options('*', preflightRequest);

    app.get(config.url, broadcastRequest);
}

AtmosphereMockServer.prototype = {
    sendResponse: function (data) {
        var poll = stack.pop();
        if (!(poll && poll.response && poll.timeoutId)) {
            debug.error({ message: 'There is no active polling session, skipping response' });
        }
        clearTimeout(poll.timeoutId);
        poll.response.end(data);
    },
    start: function () {
        app.listen(config.port, function () {
            debug.log('Atmopshere Mock Server listening on port ' + config.port);
        });
    }
};

function preflightRequest(req, res) {
    debug.request(req.method + ' ' + req.url);

    if (config.enableXDR) {
        res.writeHead(204, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': req.headers.origin || '*',
            'Access-Control-Allow-Methods': req.headers['access-control-request-method'] || 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
            'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || ''
        });
    }
    res.end();
}

function broadcastRequest(req, res) {
    debug.request(req.method + ' ' + req.url);

    var trackingId = req.query['X-Atmosphere-tracking-id'];
    var closing = req.query['X-Atmosphere-Transport'] === 'close';
    var options = defaultOptions;

    if (config.enableXDR) {
        options.headers['Access-Control-Allow-Origin'] = req.headers.origin || '*';
    }

    res.writeHead(options.statusCode, options.headers);

    if (trackingId === '0') {
        trackingId = uuid.v4() + '|0|X|';
        res.end(trackingId.length + '|' + trackingId);
    } else if (closing) {
        res.end();
    } else {
        var timeoutId = setTimeout(function () {
            if (stack.length) {
                var response = stack.pop().response;
                response.end('\n');
            }
        }, config.pollTimeout);
        stack.push({response: res, request: req, timeoutId: timeoutId});
    }
}

_.defaults(AtmosphereMockServer.prototype, app);

module.exports = AtmosphereMockServer;