const express = require("express");

const config = require("./config");
const userModel = require("./models/userModel");
const userRoutes = require("./routes/userRoutes");
const createRateLimiter = require("./middleware/rateLimiter");
const { notFound, errorHandler } = require("./middleware/errorHandler");

// Builds the Express app. Settings can be overridden (the tests do this).
function createApp(overrides = {}) {
    const settings = { ...config, ...overrides };
    const app = express();

    app.disable("x-powered-by"); // don't advertise which framework we use
    app.set("etag", false); // skip computing a hash for every response (saves CPU)
    app.set("trust proxy", settings.trustProxy);

    // Cheap headers on every response. X-Worker-Pid shows which worker answered.
    app.use((req, res, next) => {
        res.setHeader("X-Worker-Pid", process.pid);
        res.setHeader("X-Content-Type-Options", "nosniff");
        next();
    });

    if (settings.logRequests) {
        app.use((req, res, next) => {
            const started = Date.now();
            res.on("finish", () => {
                console.log(`[${process.pid}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
            });
            next();
        });
    }

    // Health check for load balancers / Docker. Registered BEFORE the rate
    // limiter so monitoring is never blocked.
    app.get("/health", (req, res) => {
        const healthy = userModel.isHealthy();
        res.status(healthy ? 200 : 503).json({
            status: healthy ? "ok" : "unavailable",
            worker: process.pid,
            uptimeSeconds: Math.round(process.uptime()),
            storage: settings.storage,
        });
    });

    app.use(
        createRateLimiter({
            max: settings.rateLimitMax,
            windowSeconds: settings.rateLimitWindowSeconds,
        })
    );

    app.use(express.json({ limit: settings.bodyLimit }));

    app.get("/", (req, res) => {
        res.json({
            message: "API is ready to handle high traffic",
            worker: process.pid,
        });
    });

    app.use("/api/users", userRoutes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
