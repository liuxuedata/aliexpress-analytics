const handler = require('./start/index.js');

module.exports = handler;
module.exports.default = handler;
module.exports.createHandler = handler.createHandler;
module.exports.sanitizeReturnTo = handler.sanitizeReturnTo;
