# Changelog

## v1.2.7 (2017-05-26)
### Features
- Added support for template engine

## v1.2.6 (2017-05-18)
### Features
- Added file uploader to mock server

## v1.2.5 (2017-05-16)
### Bugs
- Fixed issue with client websocket connection disconnecting unexpectedly

## v1.2.4 (2017-04-26)
### Features
- Added logging of IP address to console message

## v1.2.3 (2017-04-21)
### Features
- Enforcing https and wss (dropped support for http and ws)

## v1.2.2 (2017-02-15)
### Features
- Added support for hosting static files

## v1.2.1 (2017-02-09)
### Features
- Added robustness for websockets for mock server

## v1.2.0 (2017-02-07)
### Features
- Added websocket support for mock server
- Added heartbeat to websocket connection
- Added support for multiple websocket connections

## v1.1.0 (2016-09-15)
### Features
- Updated HTTPS support for atmosphere-javascript-mock

## v1.0.9 (2016-09-15)
### Features
- Added support for HTTPS

## v1.0.8 (2016-07-26)
### Bugs
- Fixed issue where responses were being dropped if sendResponse is called multiple times simultaneously

## v1.0.7 (2016-06-21)
### Bugs
### Features
- Improved debug message logging (DEBUG=request,response node server.js)
- Reversed order of Changelog

## v1.0.6 (2016-06-20)
### Bugs
- Fixed "express deprecated app.del: Use app.delete instead" warning message
### Features

## v1.0.5 (2016-06-14)
### Bugs
### Features
- Added optional delay parameter to sendResponse method

## v1.0.4 (2016-06-09)
### Bugs
### Features
- Added support for trackMessageLength feature

## v1.0.3 (2016-06-06)
### Bugs
- Fixed polling timeout issue
### Features

## v1.0.2 (2016-06-06)
### Bugs
### Features
- Added start() function to bootstrap AtmosphereMockServer

## v1.0.1 (2016-06-06)
### Bugs
### Features
- Extended AtmosphereMockServer prototype to include express
