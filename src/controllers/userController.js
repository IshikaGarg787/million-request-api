const userModel = require("../models/userModel");

const createUser = (req, res) => {
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({
            error: "Name and email are required"
        });
    }

    const user = userModel.create({ name, email });

    res.status(201).json(user);
};

const getUsers = (req, res) => {
    const users = userModel.findAll();

    res.json(users);
};

const getUserById = (req, res) => {
    const id = Number(req.params.id);

    const user = userModel.findById(id);

    if (!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }

    res.json(user);
};

const deleteUser = (req, res) => {
    const id = Number(req.params.id);

    const deleted = userModel.delete(id);

    if (!deleted) {
        return res.status(404).json({
            error: "User not found"
        });
    }

    res.status(204).send();
};

module.exports = {
    createUser,
    getUsers,
    getUserById,
    deleteUser
};