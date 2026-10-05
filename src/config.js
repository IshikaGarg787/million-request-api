// Central place for every setting. Values come from the .env file (if present)
// or from real environment variables, with safe defaults for each one.
require("dotenv").config({ quiet: true });

const os = require("os");

const toInt = (value, fallback) => {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? fallback : n;
};

// TRUST_PROXY can be "true", a number (how many proxies), or a name like "loopback".
const parseTrustProxy = (value) => {
    if (value === undefined || value === "" || value === "false") return false;
    if (value === "true") return true;
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
};

const config = {
    port: toInt(process.env.PORT, 3000),

    // How many worker processes to start. Default: one per CPU core.
    workers: toInt(process.env.WORKERS, os.cpus().length),

    // "memory" = no database needed (data lives in RAM, lost on restart)
    // "mongo"  = MongoDB (data is saved, shared by all workers/servers)
    storage: (process.env.STORAGE || "memory").toLowerCase(),
    mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/million_requests_api",
    mongoPoolSize: toInt(process.env.MONGO_POOL_SIZE, 20),

    // Max requests one IP address may send per window. 0 = rate limiting off.
    rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 1000),
    rateLimitWindowSeconds: toInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 60),

    bodyLimit: process.env.BODY_LIMIT || "10kb",
    logRequests: process.env.LOG_REQUESTS === "true",

    // Set to 1 when running behind nginx / a load balancer so req.ip is the real client.
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

    // Waiting for in-flight requests to finish when shutting down (milliseconds).
    shutdownTimeoutMs: toInt(process.env.SHUTDOWN_TIMEOUT_MS, 10000),
};

module.exports = config;
