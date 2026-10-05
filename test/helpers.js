const http = require("http");
const net = require("net");

// Asks the operating system for a port nobody else is using.
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

// One request on a brand-new connection (so a cluster can pick any worker).
function request(port, method, path, body) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const req = http.request(
            {
                port,
                method,
                path,
                agent: false,
                headers: {
                    Connection: "close",
                    ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
                },
            },
            (res) => {
                let text = "";
                res.on("data", (chunk) => (text += chunk));
                res.on("end", () => {
                    let json = null;
                    try {
                        json = text ? JSON.parse(text) : null;
                    } catch (e) {
                        /* not JSON */
                    }
                    resolve({ status: res.statusCode, headers: res.headers, json, text });
                });
            }
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

module.exports = { getFreePort, request };
