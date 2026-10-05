// Used by the load test: gives every POST request its own unique email.
const { randomUUID } = require("crypto");

module.exports = function setupRequest(request) {
    request.body = JSON.stringify({ name: "Load Test", email: `load-${randomUUID()}@bench.test` });
    return request;
};
