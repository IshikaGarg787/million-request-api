// A small custom error so the controller can tell "email already used"
// apart from real crashes. It also survives being sent between processes.
class StoreError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "StoreError";
        this.code = code;
    }
}

StoreError.DUPLICATE_EMAIL = "DUPLICATE_EMAIL";

module.exports = StoreError;
