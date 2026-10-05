const config = require("../config");

// Pick where users are stored. Both options offer exactly the same methods,
// so the rest of the code never needs to know which one is in use.
const stores = {
    memory: () => require("./memoryUserStore"),
    mongo: () => require("./mongoUserStore"),
};

if (!stores[config.storage]) {
    throw new Error(`Unknown STORAGE "${config.storage}". Use "memory" or "mongo".`);
}

module.exports = stores[config.storage]();
