class UserModel {
    constructor() {
        this.users = [];
        this.nextId = 1;
    }

    create(user) {
        const newUser = {
            id: this.nextId++,
            name: user.name,
            email: user.email
        };

        this.users.push(newUser);

        return newUser;
    }

    findAll() {
        return this.users;
    }

    findById(id) {
        return this.users.find(user => user.id === id);
    }

    delete(id) {
        const index = this.users.findIndex(user => user.id === id);

        if (index === -1) {
            return false;
        }

        this.users.splice(index, 1);
        return true;
    }
}

module.exports = new UserModel();