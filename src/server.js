// Single-process server: easiest way to try the API while developing.
//   npm run dev
// For real traffic use the cluster instead:  npm start
const { start } = require("./startServer");

start().catch((error) => {
    console.error("Could not start the server:", error.message);
    process.exit(1);
});
