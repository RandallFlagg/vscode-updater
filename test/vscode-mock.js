const configStore = {};

module.exports = {
    version: '1.133.0',
    window: {
        showInformationMessage: () => ({ then: () => {} }),
        showErrorMessage: () => ({ then: () => {} }),
        showWarningMessage: () => ({ then: () => {} }),
        createStatusBarItem: () => ({
            show: () => {},
            hide: () => {},
            dispose: () => {},
            text: '',
            tooltip: '',
            command: null,
        }),
    },
    StatusBarAlignment: { Right: 1 },
    ProgressLocation: { Notification: 1 },
    workspace: {
        getConfiguration: () => ({
            get: (key) => configStore[key],
        }),
        onDidChangeConfiguration: () => ({
            dispose: () => {},
        }),
        textDocuments: [],
    },
    commands: {
        registerCommand: () => ({
            dispose: () => {},
        }),
    },
    __setConfig: (key, value) => {
        configStore[key] = value;
    },
    __clearConfig: () => {
        for (const key in configStore) {
            delete configStore[key];
        }
    },
};
