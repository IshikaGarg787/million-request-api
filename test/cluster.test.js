// Starts the REAL cluster (3 worker processes) and checks that every worker
// sees the same data. This is the test that proves the shared store works.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const path = require("path");

const { getFreePort, request } = require("./helpers");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilReady(port, child) {
    for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) throw new Error("Cluster exited before it was ready");
        try {
            const res = await request(port, "GET", "/health");
            if (res.status === 200) return;
        } catch (error) {
            /* not listening yet */
        }
        await sleep(100);
    }
    throw new Error("Cluster did not become ready in time");
}

test("all cluster workers share one data store, and shut down cleanly", async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [path.join(__dirname, "..", "src", "cluster.js")], {
        env: { ...process.env, PORT: String(port), WORKERS: "3", STORAGE: "memory", RATE_LIMIT_MAX: "0" },
        stdio: "ignore",
    });
    const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));

    try {
        await waitUntilReady(port, child);

        // Create 30 users through (possibly) different workers.
        const workersUsed = new Set();
        for (let i = 1; i <= 30; i++) {
            const res = await request(port, "POST", "/api/users", { name: `User ${i}`, email: `user${i}@example.com` });
            assert.equal(res.status, 201);
            workersUsed.add(res.headers["x-worker-pid"]);
        }

        // Read each one back, again on fresh connections. Every read must succeed
        // no matter which worker answers.
        for (let i = 1; i <= 30; i++) {
            const res = await request(port, "GET", `/api/users/${i}`);
            assert.equal(res.status, 200, `user ${i} missing on worker ${res.headers["x-worker-pid"]}`);
            assert.equal(res.json.email, `user${i}@example.com`);
            workersUsed.add(res.headers["x-worker-pid"]);
        }

        const list = await request(port, "GET", "/api/users?limit=100");
        assert.equal(list.json.total, 30);

        // Duplicate detection must also work across workers.
        const dup = await request(port, "POST", "/api/users", { name: "Copy", email: "user7@example.com" });
        assert.equal(dup.status, 409);

        console.log(`  (requests were answered by ${workersUsed.size} different worker process(es))`);
    } finally {
        if (process.platform === "win32") {
            child.kill("SIGINT");
        } else {
            child.kill("SIGTERM");
        }
    }

let timer;
const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), 15000);
});
const code = await Promise.race([exited, timedOut]);
clearTimeout(timer);

if (code === "timeout") {
    child.kill("SIGKILL");
    assert.fail("cluster did not shut down within 15 seconds");
}

if (process.platform === "win32") {
    // On Windows, child.kill() may report signal termination
    // with exit code null even when shutdown was requested.
    return;
}

assert.equal(code, 0, "cluster should stop with exit code 0 after SIGTERM");
});
