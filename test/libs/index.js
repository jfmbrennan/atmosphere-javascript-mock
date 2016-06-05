var socket = atmosphere;
var request = new atmosphere.AtmosphereRequest();
request.trackMessageLength = true;

request.url = 'http://localhost:8888/broadcast';

var subSocket = socket.subscribe(request);
