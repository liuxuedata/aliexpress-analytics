const handler = require('./callback/index.js');

module.exports = handler;
module.exports.default = handler;
module.exports.buildLazadaSignature = handler.buildLazadaSignature;
module.exports.exchangeAuthorizationCode = handler.exchangeAuthorizationCode;
module.exports.sanitizeReturnTo = handler.sanitizeReturnTo;
