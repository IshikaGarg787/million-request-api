const cluster = require("cluster");
const os = require("os");

const PORT = 3000;

if (cluster.isPrimary) {
    const cpuCount = os.cpus().length;

    console.log(`Primary process: ${process.pid}`);
    console.log(`Starting ${cpuCount} workers...`);

    for (let i = 0; i < cpuCount; i++) {
        cluster.fork();
    }

    cluster.on("exit", (worker) => {
        console.log(`Worker ${worker.process.pid} exited`);
        console.log("Starting replacement worker...");
        cluster.fork();
    });
} else {
    const app = require("./server");

    app.listen(PORT, () => {
        console.log(`Worker ${process.pid} listening on port ${PORT}`);
    });
}