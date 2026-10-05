// Production entry point:  npm start
//
// One "primary" process starts one worker per CPU core. Every worker is a full
// copy of the web server, and the operating system spreads incoming connections
// across them, so all CPU cores are used instead of just one.
// If a worker crashes, the primary starts a new one.

const cluster = require("cluster");
const config = require("./config");

function runPrimary() {
    const workerCount = Math.max(1, config.workers);
    let shuttingDown = false;
    const crashTimes = [];

    console.log(`Primary process ${process.pid} starting ${workerCount} worker(s) (storage: ${config.storage})`);

    // In "memory" mode the primary keeps the one shared copy of the data.
    if (config.storage === "memory") {
        require("./models/memoryUserStore").attachToPrimary(cluster);
    }

    for (let i = 0; i < workerCount; i++) cluster.fork();

    cluster.on("exit", (worker, code, signal) => {
        if (shuttingDown) {
            if (Object.keys(cluster.workers).length === 0) {
                console.log("All workers stopped. Goodbye!");
                process.exit(0);
            }
            return;
        }

        console.log(`Worker ${worker.process.pid} exited (${signal || `code ${code}`}). Starting a replacement...`);

        // Crash-loop guard: if workers keep dying (for example MongoDB is down),
        // stop instead of restarting forever.
        const now = Date.now();
        crashTimes.push(now);
        while (crashTimes.length && now - crashTimes[0] > 60 * 1000) crashTimes.shift();

        if (crashTimes.length > workerCount * 5) {
            console.error("Workers keep crashing, giving up. Read the error messages above to find the cause.");
            process.exit(1);
        }

        setTimeout(() => {
            if (!shuttingDown) cluster.fork();
        }, 1000);
    });

    const stop = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;

        console.log(`${signal} received. Asking workers to finish their requests and stop...`);

        const workers = Object.values(cluster.workers);

        if (workers.length === 0) {
            process.exit(0);
            return;
        }

        let remaining = workers.length;
        let finished = false;

        const finish = () => {
            if (finished) return;
            finished = true;

            console.log("All workers stopped. Goodbye!");
            process.exit(0);
        };

        for (const worker of workers) {
            worker.once("exit", () => {
                remaining -= 1;

                if (remaining === 0) {
                    finish();
                }
            });

            worker.disconnect();
        }

        // Anything still running after the timeout is stopped forcefully.
        setTimeout(() => {
            if (finished) return;

            console.log("Shutdown timeout reached. Forcefully stopping remaining workers...");

            for (const worker of Object.values(cluster.workers)) {
                if (worker.isConnected()) {
                    worker.kill();
                }
            }

            finish();
        }, config.shutdownTimeoutMs + 2000).unref();
    };

    process.on("SIGINT", () => stop("SIGINT"));
    process.on("SIGTERM", () => stop("SIGTERM"));
}

if (cluster.isPrimary) {
    runPrimary();
} else {
    require("./startServer")
        .start()
        .catch((error) => {
            console.error(`Worker ${process.pid} could not start:`, error.message);
            process.exit(1);
        });
}
