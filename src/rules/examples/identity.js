const logger = require("../../lib/logger")("rule:identity");

/**
 * @typedef IdentityConfig
 * @property {"error"|"warn"|null} method The method to call on reporter
 * @property {String} message The message to warn/error with
 */

module.exports = {
    /**
     * Generates a linting function from a config
     * @param {IdentityConfig} config 
     */
    generate(config) {
        return function IdentityRule(reporter) {
            logger.debug("Called", config);
            // Report the message if type !== succeed
            if (config.method) {
                reporter[config.method](config.message);
            }
        };
    }
};
