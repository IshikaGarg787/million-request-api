// A tiny "fixed window" rate limiter, with no extra packages.
// Each IP address may make `max` requests per window; after that it receives
// HTTP 429 until the window resets. This protects the API from one noisy
// client (or an attack) using up all the capacity.
//
// Note: every worker process keeps its own counters, so with 8 workers one IP
// can in practice send up to roughly 8 x max. For an exact limit across many
// servers you would keep the counters in Redis.

const MAX_TRACKED_IPS = 200000;

function createRateLimiter({ max, windowSeconds }) {
    if (!max || max <= 0) {
        return (req, res, next) => next(); // limiter switched off
    }

    const windowMs = windowSeconds * 1000;
    const hits = new Map(); // ip -> { count, resetAt }

    const removeExpired = () => {
        const now = Date.now();
        for (const [ip, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(ip);
        }
    };

    setInterval(removeExpired, windowMs).unref();

    return (req, res, next) => {
        const now = Date.now();
        const ip = req.ip || "unknown";

        let entry = hits.get(ip);
        if (!entry || entry.resetAt <= now) {
            if (hits.size >= MAX_TRACKED_IPS) {
                removeExpired();
                if (hits.size >= MAX_TRACKED_IPS) hits.clear(); // last-resort memory guard
            }
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(ip, entry);
        }

        entry.count++;

        const secondsLeft = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        res.setHeader("RateLimit-Limit", max);
        res.setHeader("RateLimit-Remaining", Math.max(0, max - entry.count));
        res.setHeader("RateLimit-Reset", secondsLeft);

        if (entry.count > max) {
            res.setHeader("Retry-After", secondsLeft);
            return res.status(429).json({ error: "Too many requests, please slow down" });
        }

        next();
    };
}

module.exports = createRateLimiter;
