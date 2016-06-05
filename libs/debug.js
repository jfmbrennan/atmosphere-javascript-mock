module.exports = {
    request: require('debug')('request'),
    response: require('debug')('response'),
    log: require('debug')('log'),
    error: require('debug')('error')
};