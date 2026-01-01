// Setup file for Vitest
// This file runs before each test suite

// Mock localStorage for tests
global.localStorage = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (index) => {
            const keys = Object.keys(store);
            return keys[index] || null;
        },
    };
})();

// Mock Date.now() for deterministic tests
global.mockDate = (timestamp) => {
    const originalNow = Date.now;
    Date.now = () => timestamp;
    return () => {
        Date.now = originalNow;
    };
};
