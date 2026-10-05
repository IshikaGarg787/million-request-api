const userModel = require("../models/userModel");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100; // never hand back thousands of rows in one response

// Checks the name/email in a request body.
// Returns { error } or { values } (cleaned: trimmed, email in lowercase).
const readFields = (body) => {
    const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const values = {};

    if (source.name !== undefined) {
        const name = typeof source.name === "string" ? source.name.trim() : "";
        if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
            return { error: `Name must be text between 1 and ${MAX_NAME_LENGTH} characters` };
        }
        values.name = name;
    }

    if (source.email !== undefined) {
        const email = typeof source.email === "string" ? source.email.trim().toLowerCase() : "";
        if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
            return { error: "Email is not a valid email address" };
        }
        values.email = email;
    }

    return { values };
};

const createUser = async (req, res) => {
    const body = req.body || {};

    if (!body.name || !body.email) {
        return res.status(400).json({ error: "Name and email are required" });
    }

    const { error, values } = readFields(body);
    if (error) return res.status(400).json({ error });

    const user = await userModel.create(values);
    res.status(201).json(user);
};

const getUsers = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));

    const { users, total } = await userModel.list({ offset: (page - 1) * limit, limit });

    res.json({
        data: users,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    });
};

const getUserById = async (req, res) => {
    const user = await userModel.findById(req.params.id);

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
};

const updateUser = async (req, res) => {
    const { error, values } = readFields(req.body);
    if (error) return res.status(400).json({ error });

    if (values.name === undefined && values.email === undefined) {
        return res.status(400).json({ error: "Send a name and/or an email to update" });
    }

    const user = await userModel.update(req.params.id, values);

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
};

const deleteUser = async (req, res) => {
    const deleted = await userModel.remove(req.params.id);

    if (!deleted) {
        return res.status(404).json({ error: "User not found" });
    }

    res.status(204).send();
};

module.exports = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
};
