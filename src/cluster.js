const cluster = require("cluster");
const os = require("os");

if (cluster.isPrimary) {
    const cpuCount = os.cpus().length;

    console.log(`Primary process: ${process.pid}`);
    console.log(`Starting ${cpuCount} workers...`);

    for (let i = 0; i < cpuCount; i++) {
        cluster.fork();
    }
} else {
    console.log(`Worker started: ${process.pid}`);
}