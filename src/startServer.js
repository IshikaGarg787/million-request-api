const http = require("http");

const config = require("./config");
const userModel = require("./models/userModel");
const { createApp } = require("./app");

// Starts ONE web server process: connects to storage, listens for requests,
// and shuts down politely (finishing in-flight requests) on Ctrl+C / stop.
// Used by both `npm run dev` (server.js) and each cluster worker (cluster.js).
async function start() {
    await userModel.init();

    const app = createApp();
    let shuttingDown = false;

    const server = http.createServer((req, res) => {
        // While shutting down, tell clients to close their connection after this reply.
        if (shuttingDown) res.setHeader("Connection", "close");
        app(req, res);
    });

    // Keep idle connections open a bit longer than a typical load balancer (60s)
    // so the balancer never sends a request down a connection we just closed.
    server.keepAliveTimeout = 65 * 1000;
    server.headersTimeout = 66 * 1000;
    server.requestTimeout = 30 * 1000;

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        // "backlog" = how many connections may wait in line during a sudden burst.
        server.listen({ port: config.port, backlog: 4096 }, resolve);
    });

    console.log(`Worker ${process.pid} listening on port ${config.port} (storage: ${config.storage})`);

    const shutdown = (reason) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Worker ${process.pid} shutting down (${reason})...`);

        // If something hangs, don't wait forever.
        setTimeout(() => process.exit(1), config.shutdownTimeoutMs).unref();

        server.close(async () => {
            try {
                await userModel.close();
            } catch (error) {
                // ignore: we're exiting anyway
            }
            process.exit(0);
        });
        server.closeIdleConnections();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("disconnect", () => shutdown("primary disconnected"));

    return server;
}

process.on("unhandledRejection", (reason) => {
    console.error(`[${process.pid}] Unhandled promise rejection:`, reason);
});

process.on("uncaughtException", (error) => {
    console.error(`[${process.pid}] Uncaught exception, exiting:`, error);
    process.exit(1); // in cluster mode the primary starts a fresh worker
});

module.exports = { start };
