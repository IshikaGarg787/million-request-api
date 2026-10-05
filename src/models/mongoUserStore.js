const mongoose = require("mongoose");
const config = require("../config");
const StoreError = require("./StoreError");

// Same methods as memoryUserStore, but the data lives in MongoDB.
// Every worker (and every server) connects to the same database, so they all
// see the same users, and the data survives restarts.

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        // "unique" creates a database index, so duplicates are rejected safely
        // even if two workers try to save the same email at the same moment.
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    },
    { versionKey: false }
);

const User = mongoose.model("User", userSchema);

const OBJECT_ID = /^[a-f\d]{24}$/i;
const DUPLICATE_KEY = 11000;

const toPlain = (doc) => (doc ? { id: doc._id.toString(), name: doc.name, email: doc.email } : null);

const rethrow = (error) => {
    if (error && error.code === DUPLICATE_KEY) {
        throw new StoreError(StoreError.DUPLICATE_EMAIL, "Email already exists");
    }
    throw error;
};

async function init() {
    await mongoose.connect(config.mongoUri, {
        maxPoolSize: config.mongoPoolSize,
        serverSelectionTimeoutMS: 5000,
    });
    await User.init(); // make sure the unique index exists
}

async function close() {
    await mongoose.disconnect();
}

async function create({ name, email }) {
    try {
        return toPlain(await User.create({ name, email }));
    } catch (error) {
        return rethrow(error);
    }
}

async function list({ offset, limit }) {
    const [docs, total] = await Promise.all([
        User.find().sort({ _id: 1 }).skip(offset).limit(limit).lean(),
        User.estimatedDocumentCount(), // instant, even with millions of rows
    ]);
    return { users: docs.map(toPlain), total };
}

async function findById(id) {
    if (!OBJECT_ID.test(String(id))) return null;
    return toPlain(await User.findById(id).lean());
}

async function update(id, { name, email }) {
    if (!OBJECT_ID.test(String(id))) return null;

    const changes = {};
    if (name !== undefined) changes.name = name;
    if (email !== undefined) changes.email = email;

    try {
        const doc = await User.findByIdAndUpdate(id, { $set: changes }, { new: true, lean: true, runValidators: true });
        return toPlain(doc);
    } catch (error) {
        return rethrow(error);
    }
}

async function remove(id) {
    if (!OBJECT_ID.test(String(id))) return false;
    const result = await User.deleteOne({ _id: id });
    return result.deletedCount === 1;
}

module.exports = {
    init,
    close,
    isHealthy: () => mongoose.connection.readyState === 1,
    create,
    list,
    findById,
    update,
    remove,
    clear: () => User.deleteMany({}), // tests only
};
