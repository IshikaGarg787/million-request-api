const express = require("express");
const userRoutes = require("./routes/userRoutes");

const app = express();

app.use(express.json());
app.use("/api/users", userRoutes);

app.use("/api/users", userRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "API is ready to handle high traffic"
    });
});

module.exports = app;