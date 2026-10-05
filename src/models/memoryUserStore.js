const cluster = require("cluster");
const LocalMemoryStore = require("./localMemoryStore");
const StoreError = require("./StoreError");

// -------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// When the API runs as a cluster, every worker is a separate process with its
// own memory. If each worker kept its own list of users, a user created on
// worker 1 would be "not found" on worker 2.
//
// Fix: ONE process (the primary) owns the data. Workers send it small messages
// ("create this user", "find user 5") and wait for the answer.
// If you are not running a cluster (npm run dev, tests) the data is simply kept
// in this same process.
// -------------------------------------------------------------------------

const REQUEST = "user-store-request";
const REPLY = "user-store-reply";
const TIMEOUT_MS = 5000;
const OPERATIONS = ["create", "list", "findById", "update", "remove"];

// ----- Primary side: owns the real data and answers workers -----
function attachToPrimary(clusterModule, store = new LocalMemoryStore()) {
    clusterModule.on("message", (worker, message) => {
        if (!message || message.type !== REQUEST) return;

        const reply = { type: REPLY, requestId: message.requestId };

        try {
            if (!OPERATIONS.includes(message.op)) {
                throw new Error(`Unknown store operation: ${message.op}`);
            }
            reply.result = store[message.op](...message.args);
        } catch (error) {
            reply.error = { code: error.code, message: error.message };
        }

        try {
            if (worker.isConnected()) worker.send(reply);
        } catch (sendError) {
            // The worker disappeared while we were answering; nothing to do.
        }
    });

    return store;
}

// ----- Worker side: asks the primary -----
let nextRequestId = 1;
const pending = new Map();

if (cluster.isWorker) {
    process.on("message", (message) => {
        if (!message || message.type !== REPLY) return;

        const waiting = pending.get(message.requestId);
        if (!waiting) return;

        pending.delete(message.requestId);
        clearTimeout(waiting.timer);

        if (message.error) {
            waiting.reject(
                message.error.code
                    ? new StoreError(message.error.code, message.error.message)
                    : new Error(message.error.message)
            );
        } else {
            waiting.resolve(message.result);
        }
    });
}

function askPrimary(op, args) {
    return new Promise((resolve, reject) => {
        const requestId = nextRequestId++;

        const timer = setTimeout(() => {
            pending.delete(requestId);
            const error = new Error("Data store did not answer in time");
            error.status = 503;
            reject(error);
        }, TIMEOUT_MS);

        pending.set(requestId, { resolve, reject, timer });

        try {
            process.send({ type: REQUEST, requestId, op, args });
        } catch (error) {
            pending.delete(requestId);
            clearTimeout(timer);
            error.status = 503;
            reject(error);
        }
    });
}

// ----- Public API used by the controllers -----
const local = new LocalMemoryStore();

async function run(op, args) {
    if (cluster.isWorker) return askPrimary(op, args);
    return local[op](...args);
}

module.exports = {
    init: async () => {},
    close: async () => {},
    isHealthy: () => true,

    create: (user) => run("create", [user]),
    list: (options) => run("list", [options]),
    findById: (id) => run("findById", [id]),
    update: (id, changes) => run("update", [id, changes]),
    remove: (id) => run("remove", [id]),

    // Used only by the automated tests to start from an empty store.
    clear: () => local.clear(),

    attachToPrimary,
};
