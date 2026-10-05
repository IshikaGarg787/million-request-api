// Load test: fires a LOT of requests at the API and prints how it coped.
//
//   npm run benchmark                  -> starts its own server, sends 1,000,000 requests
//   npm run benchmark -- --quick       -> small run (about a minute)
//   npm run benchmark -- --url http://localhost:3000   -> test a server that is already running
//
// Options:
//   --requests N      requests for the first test (default 1000000)
//   --connections N   simultaneous connections (default 200)
//   --threads N       load-generator threads (default: half of your CPU cores)
//   --server-workers N  workers for the server this script starts (default: all cores)
//
// Tip: the load generator and the server share your computer. A real test would
// run the load generator on a different machine.

const { spawn } = require("child_process");
const net = require("net");
const os = require("os");
const path = require("path");
const autocannon = require("autocannon");

// ---------- read command-line options ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const quick = flag("quick");
const REQUESTS = parseInt(option("requests", quick ? "100000" : "1000000"), 10);
const CONNECTIONS = parseInt(option("connections", "200"), 10);
const THREADS = Math.max(1, parseInt(option("threads", String(Math.floor(os.cpus().length / 2) || 1)), 10));
const SERVER_WORKERS = option("server-workers", String(os.cpus().length));
const EXTERNAL_URL = option("url", null);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (n) => Math.round(n).toLocaleString("en-US");

function getFreePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(0, () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}

async function waitUntilReady(baseUrl, child) {
    for (let i = 0; i < 150; i++) {
        if (child && child.exitCode !== null) throw new Error("The server stopped before it was ready");
        try {
            const res = await fetch(`${baseUrl}/health`);
            if (res.ok) return;
        } catch (error) {
            /* not up yet */
        }
        await sleep(100);
    }
    throw new Error("The server did not become ready in time");
}

async function startOwnServer() {
    const port = await getFreePort();
    const child = spawn(process.execPath, [path.join(__dirname, "..", "src", "cluster.js")], {
        env: {
            ...process.env,
            PORT: String(port),
            WORKERS: SERVER_WORKERS,
            STORAGE: process.env.STORAGE || "memory",
            RATE_LIMIT_MAX: "0", // a load test would be blocked by the rate limiter
            LOG_REQUESTS: "false",
        },
        stdio: "ignore",
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitUntilReady(baseUrl, child);
    return { baseUrl, child };
}

async function stopOwnServer(child) {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([exited, sleep(15000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
}

// ---------- one test ----------
async function runTest(title, options) {
    console.log(`\n>>> ${title}`);
    const startedAt = Date.now();

    const result = await autocannon({
        connections: CONNECTIONS,
        workers: THREADS > 1 ? THREADS : undefined,
        timeout: 20,
        ...options,
    });

    const seconds = (Date.now() - startedAt) / 1000;
    const perSecond = result.requests.total / seconds;
    const failed = result.non2xx + result.errors + result.timeouts;

    console.log(`    requests sent      : ${fmt(result.requests.total)} in ${seconds.toFixed(1)} s`);
    console.log(`    average speed      : ${fmt(perSecond)} requests/second`);
    console.log(`    latency (average)  : ${result.latency.average} ms   (99th percentile: ${result.latency.p99} ms)`);
    console.log(`    failed requests    : ${fmt(failed)}  (errors ${result.errors}, timeouts ${result.timeouts}, non-2xx ${result.non2xx})`);

    return { title, total: result.requests.total, average: perSecond, failed, seconds };
}

// ---------- main ----------
async function main() {
    console.log("=== Million Requests API : load test ===");
    console.log(`Computer: ${os.cpus().length} CPU core(s), ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB RAM`);
    console.log(`Settings: ${fmt(CONNECTIONS)} simultaneous connections, ${THREADS} load-generator thread(s)`);

    let baseUrl = EXTERNAL_URL;
    let child = null;

    if (!baseUrl) {
        console.log(`Starting the API with ${SERVER_WORKERS} worker(s)...`);
        ({ baseUrl, child } = await startOwnServer());
    } else {
        await waitUntilReady(baseUrl, null);
    }
    console.log(`Testing: ${baseUrl}`);

    const summary = [];

    try {
        summary.push(await runTest(`Test 1: GET /  (${fmt(REQUESTS)} requests)`, { url: `${baseUrl}/`, amount: REQUESTS }));

        // Put some users in so the read test has something to return.
        process.stdout.write("\nAdding 1,000 sample users... ");
        for (let i = 0; i < 1000; i++) {
            await fetch(`${baseUrl}/api/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: `Sample ${i}`, email: `sample${i}-${Date.now()}@bench.test` }),
            });
        }
        console.log("done");

        const smaller = Math.max(1000, Math.round(REQUESTS / 5));

        summary.push(
            await runTest(`Test 2: GET /api/users?limit=20  (${fmt(smaller)} requests)`, {
                url: `${baseUrl}/api/users?limit=20`,
                amount: smaller,
            })
        );

        summary.push(
            await runTest(`Test 3: POST /api/users  (${fmt(smaller)} new users)`, {
                url: baseUrl,
                // Every request gets its own unique email (see unique-user-request.js).
                requests: [
                    {
                        method: "POST",
                        path: "/api/users",
                        headers: { "Content-Type": "application/json" },
                        setupRequest: path.join(__dirname, "unique-user-request.js"),
                    },
                ],
                workers: THREADS, // a file path for setupRequest needs worker mode
                amount: smaller,
            })
        );
    } finally {
        await stopOwnServer(child);
    }

    const totalRequests = summary.reduce((sum, s) => sum + s.total, 0);
    const totalFailed = summary.reduce((sum, s) => sum + s.failed, 0);

    console.log("\n=== SUMMARY ===");
    for (const s of summary) {
        console.log(`${s.title.padEnd(58)} ${fmt(s.average).padStart(9)} req/s   failed: ${fmt(s.failed)}`);
    }
    console.log(`\nTotal requests handled: ${fmt(totalRequests)}   Total failed: ${fmt(totalFailed)}`);
}

main().catch((error) => {
    console.error("\nLoad test failed:", error.message);
    process.exit(1);
});
