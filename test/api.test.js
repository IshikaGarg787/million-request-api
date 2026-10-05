const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const { createApp } = require("../src/app");
const userModel = require("../src/models/userModel");
const { request } = require("./helpers");

let server;
let port;

const startApp = (overrides) =>
    new Promise((resolve) => {
        const s = http.createServer(createApp({ rateLimitMax: 0, ...overrides }));
        s.listen(0, () => resolve(s));
    });

before(async () => {
    server = await startApp();
    port = server.address().port;
});

after(() => server.close());

beforeEach(() => userModel.clear());

const newUser = (overrides = {}) => ({ name: "Asha", email: "asha@example.com", ...overrides });

test("GET / says the API is ready", async () => {
    const res = await request(port, "GET", "/");
    assert.equal(res.status, 200);
    assert.equal(res.json.message, "API is ready to handle high traffic");
});

test("GET /health reports ok", async () => {
    const res = await request(port, "GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.json.status, "ok");
});

test("responses carry the worker id header", async () => {
    const res = await request(port, "GET", "/");
    assert.equal(res.headers["x-worker-pid"], String(process.pid));
});

test("POST /api/users creates a user (email is lowercased)", async () => {
    const res = await request(port, "POST", "/api/users", newUser({ email: "Asha@Example.COM" }));
    assert.equal(res.status, 201);
    assert.deepEqual(res.json, { id: 1, name: "Asha", email: "asha@example.com" });
});

test("POST rejects missing fields", async () => {
    const res = await request(port, "POST", "/api/users", { name: "No Email" });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, "Name and email are required");
});

test("POST rejects an invalid email", async () => {
    const res = await request(port, "POST", "/api/users", newUser({ email: "not-an-email" }));
    assert.equal(res.status, 400);
});

test("POST rejects a name that is not text", async () => {
    const res = await request(port, "POST", "/api/users", newUser({ name: 123 }));
    assert.equal(res.status, 400);
});

test("POST rejects a duplicate email with 409", async () => {
    await request(port, "POST", "/api/users", newUser());
    const res = await request(port, "POST", "/api/users", newUser({ name: "Other" }));
    assert.equal(res.status, 409);
});

test("POST with broken JSON returns 400 (not a crash)", async () => {
    const res = await new Promise((resolve, reject) => {
        const req = http.request(
            { port, method: "POST", path: "/api/users", agent: false, headers: { "Content-Type": "application/json" } },
            (r) => {
                let text = "";
                r.on("data", (c) => (text += c));
                r.on("end", () => resolve({ status: r.statusCode, text }));
            }
        );
        req.on("error", reject);
        req.end("{bad json");
    });
    assert.equal(res.status, 400);
});

test("a body bigger than the limit is rejected with 413", async () => {
    const res = await request(port, "POST", "/api/users", newUser({ name: "x".repeat(20000) }));
    assert.equal(res.status, 413);
});

test("GET /api/users/:id returns the user, or 404", async () => {
    await request(port, "POST", "/api/users", newUser());

    const found = await request(port, "GET", "/api/users/1");
    assert.equal(found.status, 200);
    assert.equal(found.json.email, "asha@example.com");

    const missing = await request(port, "GET", "/api/users/999");
    assert.equal(missing.status, 404);

    const garbage = await request(port, "GET", "/api/users/abc");
    assert.equal(garbage.status, 404);
});

test("GET /api/users is paginated", async () => {
    for (let i = 1; i <= 25; i++) {
        await request(port, "POST", "/api/users", newUser({ name: `User ${i}`, email: `u${i}@example.com` }));
    }

    const first = await request(port, "GET", "/api/users?limit=10");
    assert.equal(first.json.data.length, 10);
    assert.equal(first.json.total, 25);
    assert.equal(first.json.totalPages, 3);
    assert.equal(first.json.data[0].name, "User 1");

    const last = await request(port, "GET", "/api/users?limit=10&page=3");
    assert.equal(last.json.data.length, 5);
    assert.equal(last.json.data[0].name, "User 21");

    const capped = await request(port, "GET", "/api/users?limit=100000");
    assert.equal(capped.json.limit, 100); // limit is capped at 100
});

test("PATCH /api/users/:id updates fields", async () => {
    await request(port, "POST", "/api/users", newUser());

    const res = await request(port, "PATCH", "/api/users/1", { name: "Asha Kumari" });
    assert.equal(res.status, 200);
    assert.equal(res.json.name, "Asha Kumari");
    assert.equal(res.json.email, "asha@example.com");

    assert.equal((await request(port, "PATCH", "/api/users/1", {})).status, 400);
    assert.equal((await request(port, "PATCH", "/api/users/999", { name: "Nobody" })).status, 404);
});

test("PATCH cannot take another user's email", async () => {
    await request(port, "POST", "/api/users", newUser());
    await request(port, "POST", "/api/users", newUser({ name: "Ben", email: "ben@example.com" }));

    const res = await request(port, "PATCH", "/api/users/2", { email: "asha@example.com" });
    assert.equal(res.status, 409);
});

test("DELETE /api/users/:id removes the user and frees the email", async () => {
    await request(port, "POST", "/api/users", newUser());

    assert.equal((await request(port, "DELETE", "/api/users/1")).status, 204);
    assert.equal((await request(port, "GET", "/api/users/1")).status, 404);
    assert.equal((await request(port, "DELETE", "/api/users/1")).status, 404);

    const again = await request(port, "POST", "/api/users", newUser());
    assert.equal(again.status, 201);
});

test("unknown routes return a JSON 404", async () => {
    const res = await request(port, "GET", "/nope");
    assert.equal(res.status, 404);
    assert.equal(res.json.error, "Route not found");
});

test("the rate limiter returns 429 after too many requests, but /health stays open", async () => {
    const limited = await startApp({ rateLimitMax: 3, rateLimitWindowSeconds: 60 });
    const limitedPort = limited.address().port;

    try {
        const statuses = [];
        for (let i = 0; i < 5; i++) statuses.push((await request(limitedPort, "GET", "/")).status);
        assert.deepEqual(statuses, [200, 200, 200, 429, 429]);

        const blocked = await request(limitedPort, "GET", "/");
        assert.ok(blocked.headers["retry-after"]);

        const health = await request(limitedPort, "GET", "/health");
        assert.equal(health.status, 200);
    } finally {
        limited.close();
    }
});
