const logger = require("../lib/logger")("rule:elm");

/**
 * @typedef {Object<string,Boolean|Number|Array<Number>>} ElmConfig
 * The key is used as selector. The value has the following meanings:  
 * - `{Boolean}` If true the selector must be matched. If false the selector must not be matched.  
 * - `{Number}` The number of elements the selector must resolve to. Must be exact.  
 * - `{Array<Number>}` The number of elements the selector resolves to must be between the first and the second number.
 * 
 * Note that if an element is disallowed by one rule, but allowed by another, it will be allowed.
 * This allows you to do e.g. `{ "title": false, "svg > title": true }`.
 */
/**
 * @typedef RuleElmResult
 * @property {Node} [elm] The element the result relates to
 * @property {String} message The message the result is described by
 */
/**
 * @typedef RuleExecution
 * @property {RuleElmResult[]} allowed The elements allowed by the rule
 * @property {RuleElmResult[]} disallowed The elements disallowed by the rule
 */

/**
 * Workflow:
 * 1. Find all { allowed: [], disallowed: [] }
 * 2. Filter .disallowed by not in .allowed
 * 3. If .disallowed.length, fail
 * 
 * Rules act like this:
 * - {true} If found, put in allowed
 * - {false} If found, put in disallowed
 * - {Number} If exact match, put all in allowed. If not, put all in disallowed.
 * - {Array<Number>} If match, put all in allowed. If not, put all in disallowed.
 * 
 * This means that e.g. `{ "b": 2, "a > b": true}` with "<b/><b/><a><b/><b/></a>"
 * will fail, which is something to keep in mind.
 */

/**
 * Executes a rule, returning the RuleExecution.
 * @param {String} selector The selector of the rule
 * @param {Boolean|Number|Array<Number>} config The config of the rule
 * @param {Cheerio} $ The cheerio representation of the document
 */
function executeRule(selector, config, $) {
    /** @type {RuleExecution} */
    const outp = {
        allowed: [],
        disallowed: [],
    };
    /** @type {RuleElmResult[]} */
    const matches = $.find(selector).toArray().map(
        elm => ({ elm, message: "" })
    );
    let allowed = null;
    let message = null;
    switch (typeof config) {
        case "boolean":
            if (config) {
                allowed = true;
                if (!matches.length) {
                    outp.disallowed.push({
                        elm: null,
                        message: `Expected '${selector}', none found`,
                    });
                }
            } else {
                allowed = false;
                message = "Element disallowed";
            }
            break;
        case "number":
            if (matches.length === config) {
                allowed = true;
            } else {
                allowed = false;
                message = `Found ${matches.length} elements for '${selector}', expected ${config}`;
            }
            break;
        default:
            if (config instanceof Array && config.length === 2
                    && typeof config[0] === "number" && typeof config[1] === "number") {
                if (matches.length >= config[0] && matches.length <= config[1]) {
                    allowed = true;
                } else {
                    outp.disallowed.push({
                        elm: null,
                        message: `Found ${matches.length} elements for '${selector}', expected between ${config[0]} and ${config[1]}`,
                    });
                }
            } else {
                throw `Unknown config type '${typeof config}' (${JSON.stringify(config)})`;
            }
    }
    if (allowed === true) {
        outp.allowed = outp.allowed.concat(matches);
    } else if (allowed === false) {
        outp.disallowed = outp.disallowed.concat(matches.map(
            match => {
                match.message = message;
                return match;
            }
        ));
    }
    logger.debug("outputting", outp);
    return outp;
}

module.exports = {
    /**
     * Generates a linting function from a config
     * @param {ElmConfig} config 
     */
    generate(config) {
        /**
         * Performs the linting according to the previously passed config.
         * @param {Reporter} reporter The reporter to report warnings/errors to
         * @param {Cheerio} $ A cheerio representation of the document
         * @param {AST} ast The underlying AST representation of the document.
         *                  This should be given to Reporter when warning/erroring with a node.
         */
        return function ElmRule(reporter, $, ast) {
            logger.debug("Called", config);
            // gather the result of every execution
            const executions = Object.keys(config)
                .map(selector => {
                    try {
                        return executeRule(selector, config[selector], $);
                    } catch (e) {
                        if (e instanceof Error) {
                            reporter.exception(e);
                        } else {
                            reporter.warn(`Rule '${selector}' failed to lint: ${e}`);
                        }
                        return null;
                    }
                }).filter(v => v);
            // then filter out the disallowed elms that are allowed elsewhere
            /** @type {Node[]} */
            const allowedElms = [];
            /** @type {RuleElmResult[]} */
            const disallowed = [];
            // first gather the allowed elms
            executions.forEach(execution => {
                allowedElms.push(...execution.allowed.map(result => result.elm));
            });
            // the filter the disallowed elms by whether they are allowed elsewhere
            executions.forEach(execution => {
                disallowed.push(...execution.disallowed.filter(
                    result => !allowedElms.includes(result.elm)
                ));
            });
            // finally report all the remaining disallowed elms
            disallowed.forEach(result => {
                reporter.error(result.message, result.elm, ast);
            });
        };
    }
};
