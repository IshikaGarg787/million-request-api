const StoreError = require("../models/StoreError");

// Runs when no route matched the URL.
const notFound = (req, res) => {
    res.status(404).json({ error: "Route not found" });
};

// Runs when anything throws. Express 5 sends errors from async functions here
// automatically, so controllers don't need try/catch.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof StoreError && err.code === StoreError.DUPLICATE_EMAIL) {
        return res.status(409).json({ error: err.message });
    }

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Request body is not valid JSON" });
    }

    if (err.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body is too large" });
    }

    const status = err.status || err.statusCode;
    if (status === 503) {
        return res.status(503).json({ error: "Service temporarily unavailable, please retry" });
    }
    if (status >= 400 && status < 500) {
        return res.status(status).json({ error: "Bad request" });
    }

    console.error(`[${process.pid}] Unexpected error:`, err);
    res.status(500).json({ error: "Internal server error" });
};

module.exports = { notFound, errorHandler };
