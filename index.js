/**
 * Created by brennan5 on 05/06/2016.
 */

var AtmosphereMockServer = require('./libs/atmosphere-mock-server');

module.exports = function (options) {
    return new AtmosphereMockServer(options);
};