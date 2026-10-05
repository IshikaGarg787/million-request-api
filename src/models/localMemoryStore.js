const StoreError = require("./StoreError");

// Keeps all users in a Map (fast lookups by id) plus a second Map for emails
// so "is this email taken?" is instant even with a million users.
class LocalMemoryStore {
    constructor() {
        this.clear();
    }

    clear() {
        this.users = new Map(); // id -> user
        this.emails = new Map(); // email -> id
        this.nextId = 1;
    }

    create({ name, email }) {
        if (this.emails.has(email)) {
            throw new StoreError(StoreError.DUPLICATE_EMAIL, "Email already exists");
        }

        const user = { id: this.nextId++, name, email };
        this.users.set(user.id, user);
        this.emails.set(email, user.id);
        return user;
    }

    // Returns one page of users. Never returns "everybody" at once.
    list({ offset, limit }) {
        const users = [];
        let index = 0;

        for (const user of this.users.values()) {
            if (index >= offset + limit) break;
            if (index >= offset) users.push(user);
            index++;
        }

        return { users, total: this.users.size };
    }

    findById(id) {
        return this.users.get(Number(id)) || null;
    }

    update(id, { name, email }) {
        const user = this.users.get(Number(id));
        if (!user) return null;

        if (email !== undefined && email !== user.email) {
            if (this.emails.has(email)) {
                throw new StoreError(StoreError.DUPLICATE_EMAIL, "Email already exists");
            }
            this.emails.delete(user.email);
            this.emails.set(email, user.id);
            user.email = email;
        }

        if (name !== undefined) user.name = name;
        return user;
    }

    remove(id) {
        const user = this.users.get(Number(id));
        if (!user) return false;

        this.users.delete(user.id);
        this.emails.delete(user.email);
        return true;
    }
}

module.exports = LocalMemoryStore;
