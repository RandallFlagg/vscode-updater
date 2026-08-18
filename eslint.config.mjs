export default [{
    files: ["**/*.js"],
    languageOptions: {
        globals: {
            console: "readonly",
            __dirname: "readonly",
            __filename: "readonly",
            exports: "readonly",
            module: "readonly",
            process: "readonly",
            Buffer: "readonly",
            setTimeout: "readonly",
            setInterval: "readonly",
            clearInterval: "readonly",
            suite: "readonly",
            test: "readonly",
            describe: "readonly",
            it: "readonly",
            beforeEach: "readonly",
            afterEach: "readonly",
            clearTimeout: "readonly",
            vscode: "readonly",
        },

        ecmaVersion: 2022,
        sourceType: "commonjs",
    },

    rules: {
        "no-undef": "warn",
        "no-unreachable": "warn",
        "no-unused-vars": "warn",
    },
}];
