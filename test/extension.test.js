const assert = require('assert');
const extension = require('../extension');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
let vscode;
try {
    vscode = require('vscode');
} catch {
    vscode = require('./vscode-mock');
}

const originalConsoleError = console.error;

function createMockResponse(statusCode, headers, body) {
    const lowerHeaders = {};
    if (headers) {
        for (const [key, value] of Object.entries(headers)) {
            lowerHeaders[key.toLowerCase()] = value;
        }
    }
    let dataCallback;
    return {
        statusCode,
        headers: lowerHeaders,
        on: (event, cb) => {
            if (event === 'data') dataCallback = cb;
            if (event === 'end') {
                process.nextTick(() => {
                    if (dataCallback && body) {
                        dataCallback(Buffer.from(body));
                    }
                    cb();
                });
            }
        }
    };
}

async function withMockHttps(responses, fn) {
    const originalGet = https.get;
    let callIndex = 0;

    https.get = function(url, options, callback) {
        const response = responses[callIndex++] || createMockResponse(200);
        const req = new EventEmitter();
        req.destroy = () => {};

        process.nextTick(() => callback(response));
        return req;
    };

    try {
        await fn();
    } finally {
        https.get = originalGet;
    }
}

describe('Extension Test Suite', () => {
    beforeEach(() => {
        console.error = () => {};
    });

    afterEach(() => {
        console.error = originalConsoleError;
    });

    it('extractVersion parses array response', () => {
        const data = '["1.133.0","1.132.1","1.132.0"]';
        const result = extension.extractVersion(data);
        assert.strictEqual(result, '1.133.0');
    });

    it('extractVersion parses GitHub API response', () => {
        const data = '{"tag_name":"v1.85.0","name":"1.85.0"}';
        const result = extension.extractVersion(data);
        assert.strictEqual(result, 'v1.85.0');
    });

    it('extractVersion returns null for empty array', () => {
        const data = '[]';
        const result = extension.extractVersion(data);
        assert.strictEqual(result, null);
    });

    it('extractVersion returns null for invalid JSON', () => {
        const data = 'not json';
        const result = extension.extractVersion(data);
        assert.strictEqual(result, null);
    });

    it('extractVersion returns null for object without tag_name', () => {
        const data = '{"name":"1.85.0"}';
        const result = extension.extractVersion(data);
        assert.strictEqual(result, null);
    });

    it('extractVersion returns tag_name when present', () => {
        const data = '{"tag_name":"v1.85.0"}';
        const result = extension.extractVersion(data);
        assert.strictEqual(result, 'v1.85.0');
    });

    it('getPlatformSuffix returns linux-x64 for x64', () => {
        const originalArch = process.arch;
        Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
        const result = extension.getPlatformSuffix();
        assert.strictEqual(result, 'linux-x64');
        Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
    });

    it('getPlatformSuffix returns linux-arm64 for arm64', () => {
        const originalArch = process.arch;
        Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
        const result = extension.getPlatformSuffix();
        assert.strictEqual(result, 'linux-arm64');
        Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
    });

    it('getPlatformSuffix returns linux-armhf for arm', () => {
        const originalArch = process.arch;
        Object.defineProperty(process, 'arch', { value: 'arm', configurable: true });
        const result = extension.getPlatformSuffix();
        assert.strictEqual(result, 'linux-armhf');
        Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
    });

    it('getPlatformSuffix defaults to linux-x64 for unknown arch', () => {
        const originalArch = process.arch;
        Object.defineProperty(process, 'arch', { value: 'unknown', configurable: true });
        const result = extension.getPlatformSuffix();
        assert.strictEqual(result, 'linux-x64');
        Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
    });

    it('normalizeVersion strips v prefix', () => {
        assert.strictEqual(extension.normalizeVersion('v1.85.0'), '1.85.0');
    });

    it('normalizeVersion strips suffixes', () => {
        assert.strictEqual(extension.normalizeVersion('1.85.0-insider'), '1.85.0');
    });

    it('normalizeVersion handles null', () => {
        assert.strictEqual(extension.normalizeVersion(null), null);
    });

    it('normalizeVersion leaves clean version unchanged', () => {
        assert.strictEqual(extension.normalizeVersion('1.85.0'), '1.85.0');
    });

    it('normalizeVersion handles undefined', () => {
        assert.strictEqual(extension.normalizeVersion(undefined), null);
    });

    it('normalizeVersion handles empty string', () => {
        assert.strictEqual(extension.normalizeVersion(''), null);
    });

    it('validateInstallPath allows known prefix', () => {
        assert.strictEqual(extension.validateInstallPath('/usr/share/code'), true);
    });

    it('validateInstallPath allows known prefix subdirectory', () => {
        assert.strictEqual(extension.validateInstallPath('/usr/share/code/bin'), true);
    });

    it('validateInstallPath allows custom path in home', () => {
        assert.strictEqual(extension.validateInstallPath('/home/void/Programs/vscode2'), true);
    });

    it('validateInstallPath rejects root', () => {
        assert.strictEqual(extension.validateInstallPath('/'), false);
    });

    it('validateInstallPath rejects null', () => {
        assert.strictEqual(extension.validateInstallPath(null), false);
    });

    it('validateInstallPath rejects empty string', () => {
        assert.strictEqual(extension.validateInstallPath(''), false);
    });

    it('validateInstallPath rejects /usr', () => {
        assert.strictEqual(extension.validateInstallPath('/usr'), false);
    });

    it('validateInstallPath rejects /home', () => {
        assert.strictEqual(extension.validateInstallPath('/home'), false);
    });

    it('validateInstallPath rejects /tmp', () => {
        assert.strictEqual(extension.validateInstallPath('/tmp'), false);
    });

    it('validateInstallPath allows subdirectory under /home', () => {
        assert.strictEqual(extension.validateInstallPath('/home/void'), true);
    });

    it('validateBinaryName accepts valid names', () => {
        assert.strictEqual(extension.validateBinaryName('code'), true);
        assert.strictEqual(extension.validateBinaryName('my-code'), true);
        assert.strictEqual(extension.validateBinaryName('my_code'), true);
    });

    it('validateBinaryName rejects empty string', () => {
        assert.strictEqual(extension.validateBinaryName(''), false);
    });

    it('validateBinaryName rejects null', () => {
        assert.strictEqual(extension.validateBinaryName(null), false);
    });

    it('validateBinaryName rejects special characters', () => {
        assert.strictEqual(extension.validateBinaryName('code; rm -rf /'), false);
        assert.strictEqual(extension.validateBinaryName('code$(whoami)'), false);
        assert.strictEqual(extension.validateBinaryName('code`id`'), false);
    });

    it('getBinaryName returns code for vscode flavour', () => {
        const config = {
            get: (key) => key === 'flavour' ? 'vscode' : undefined
        };
        const originalGetConfig = extension.getConfig;
        extension.getConfig = () => config;
        assert.strictEqual(extension.getBinaryName(), 'code');
        extension.getConfig = originalGetConfig;
    });

    it('getBinaryName falls back to code for other flavour without custom name', () => {
        const config = {
            get: (key) => key === 'flavour' ? 'other' : undefined
        };
        const originalGetConfig = extension.getConfig;
        extension.getConfig = () => config;
        assert.strictEqual(extension.getBinaryName(), 'code');
        extension.getConfig = originalGetConfig;
    });

    it('resolveUrls sets vscode stable URLs by default', () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'vscode');

        const result = extension.resolveUrls();

        assert.strictEqual(result.updateCheckUrl, 'https://update.code.visualstudio.com/api/releases/stable');
        assert.strictEqual(result.updateDownloadUrl, 'https://update.code.visualstudio.com');

        vscode.__clearConfig();
    });

    it('resolveUrls sets codium URLs for codium flavour', () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'codium');

        const result = extension.resolveUrls();

        assert.strictEqual(result.updateCheckUrl, 'https://api.github.com/repos/VSCodium/vscodium/releases/latest');
        assert.strictEqual(result.updateDownloadUrl, 'https://github.com/VSCodium/vscodium/releases/download');

        vscode.__clearConfig();
    });

    it('resolveUrls sets custom URLs for other flavour', () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'other');
        vscode.__setConfig('customReleasesUrl', 'https://example.com/api/releases/stable');
        vscode.__setConfig('customUpdateBaseUrl', 'https://example.com/download');

        const result = extension.resolveUrls();

        assert.strictEqual(result.updateCheckUrl, 'https://example.com/api/releases/stable');
        assert.strictEqual(result.updateDownloadUrl, 'https://example.com/download');

        vscode.__clearConfig();
    });

    it('resolveUrls includes channel in URL for vscode flavour', () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'vscode');
        vscode.__setConfig('channel', 'insider');

        const result = extension.resolveUrls();

        assert.strictEqual(result.updateCheckUrl, 'https://update.code.visualstudio.com/api/releases/insider');

        vscode.__clearConfig();
    });

    it('getDownloadUrl returns correct URL for vscode flavour', () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'vscode');

        const result = extension.getDownloadUrl('1.85.0', 'https://update.code.visualstudio.com', 'linux-x64');

        assert.strictEqual(result, 'https://update.code.visualstudio.com/1.85.0/linux-x64/stable');

        vscode.__clearConfig();
    });

    it('getDownloadUrl returns correct URL for codium flavour', () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'codium');

        const result = extension.getDownloadUrl('v1.85.0', 'https://github.com/VSCodium/vscodium/releases/download', 'linux-x64');

        assert.strictEqual(result, 'https://github.com/VSCodium/vscodium/releases/download/v1.85.0/VSCodium-linux-x64-1.85.0.tar.gz');

        vscode.__clearConfig();
    });

    it('getDownloadUrl falls back to latest when version is null', () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'vscode');

        const result = extension.getDownloadUrl(null, 'https://update.code.visualstudio.com', 'linux-x64');

        assert.strictEqual(result, 'https://update.code.visualstudio.com/latest/linux-x64/stable');

        vscode.__clearConfig();
    });

    it('updateStatusBar sets update state', () => {
        const mockItem = {
            text: '',
            tooltip: '',
            command: null,
            show: () => {},
            hide: () => {}
        };

        extension.updateStatusBar('update', mockItem);

        assert.strictEqual(mockItem.text, '$(sync) Update Available');
        assert.strictEqual(mockItem.command, 'vscode-updater.update');
        assert.strictEqual(mockItem.tooltip, 'VS Code update available. Click to update.');
    });

    it('updateStatusBar sets updated state and schedules hide', () => {
        const mockItem = {
            text: '',
            tooltip: '',
            command: null,
            show: () => {},
            hide: () => {}
        };

        extension.updateStatusBar('updated', mockItem);

        assert.strictEqual(mockItem.text, '$(check) Up to Date');
        assert.strictEqual(mockItem.command, null);
    });

    it('updateStatusBar sets error state', () => {
        const mockItem = {
            text: '',
            tooltip: '',
            command: null,
            show: () => {},
            hide: () => {}
        };

        extension.updateStatusBar('error', mockItem);

        assert.strictEqual(mockItem.text, '$(error) Update Failed');
        assert.strictEqual(mockItem.command, 'vscode-updater.update');
    });

    it('updateStatusBar sets checking state', () => {
        const mockItem = {
            text: '',
            tooltip: '',
            command: null,
            show: () => {},
            hide: () => {}
        };

        extension.updateStatusBar('checking', mockItem);

        assert.strictEqual(mockItem.text, '$(sync~spin) Checking...');
        assert.strictEqual(mockItem.command, null);
    });

    it('updateStatusBar hides on default state', () => {
        const mockItem = {
            text: '',
            tooltip: '',
            command: null,
            show: () => {},
            hide: () => {
                called = true;
            }
        };
        let called = false;

        extension.updateStatusBar('unknown', mockItem);

        assert.strictEqual(called, true);
    });

    it('updateStatusBar sets updating state', () => {
        const mockItem = {
            text: '',
            tooltip: '',
            command: null,
            show: () => {},
            hide: () => {}
        };

        extension.updateStatusBar('updating', mockItem);

        assert.strictEqual(mockItem.text, '$(sync~spin) Updating...');
        assert.strictEqual(mockItem.tooltip, 'VS Code update in progress...');
        assert.strictEqual(mockItem.command, null);
    });
});

describe('detectInstallPath', () => {
    let originalExistsSync;

    beforeEach(() => {
        originalExistsSync = fs.existsSync;
    });

    afterEach(() => {
        fs.existsSync = originalExistsSync;
    });

    it('falls back to execPath directory when no possiblePaths exist', () => {
        const execDir = path.dirname(path.dirname(process.execPath));
        fs.existsSync = (p) => p === execDir;

        const result = extension.detectInstallPath();
        assert.strictEqual(result, execDir);
    });

    it('returns null when no paths exist', () => {
        fs.existsSync = () => false;
        const result = extension.detectInstallPath();
        assert.strictEqual(result, null);
    });
});

describe('getInstallPath', () => {
    it('returns config value when set', () => {
        vscode.__setConfig('installPath', '/custom/path');
        try {
            const result = extension.getInstallPath();
            assert.strictEqual(result, '/custom/path');
        } finally {
            vscode.__clearConfig();
        }
    });

    it('expands ~ to home directory', () => {
        vscode.__setConfig('installPath', '~/Programs/vscode2');
        try {
            const result = extension.getInstallPath();
            assert.strictEqual(result, path.join(os.homedir(), 'Programs/vscode2'));
        } finally {
            vscode.__clearConfig();
        }
    });
});

describe('showUpdateNotification', () => {
    it('shows information message with version', () => {
        let capturedMessage = null;
        const originalShowInformationMessage = vscode.window.showInformationMessage;
        vscode.window.showInformationMessage = (msg) => {
            capturedMessage = msg;
            return { then: (cb) => cb('Later') };
        };

        extension.showUpdateNotification('1.85.0');

        assert.strictEqual(capturedMessage, 'VS Code 1.85.0 is available. Would you like to update now?');
        vscode.window.showInformationMessage = originalShowInformationMessage;
    });
});

describe('followRedirects', () => {
    it('follows a single redirect', async () => {
        await withMockHttps([
            createMockResponse(302, { location: '/end' }),
            createMockResponse(200, {}, 'final')
        ], async () => {
            const result = await extension.followRedirects('https://example.com/start');
            assert.ok(result);
        });
    });

    it('handles relative redirects', async () => {
        await withMockHttps([
            createMockResponse(302, { location: '/end' }),
            createMockResponse(200, {}, 'final')
        ], async () => {
            const result = await extension.followRedirects('https://example.com/start');
            assert.ok(result);
        });
    });

    it('throws on too many redirects', async () => {
        const responses = [];
        for (let i = 0; i < 6; i++) {
            responses.push(createMockResponse(302, { location: `/redirect${i + 1}` }));
        }

        try {
            await withMockHttps(responses, async () => {
                await extension.followRedirects('https://example.com/redirect0');
            });
            assert.fail('Should have thrown');
        } catch (e) {
            assert.strictEqual(e.message, 'Too many redirects');
        }
    });

    it('returns stream directly for non-3xx response', async () => {
        await withMockHttps([
            createMockResponse(200, {}, 'final')
        ], async () => {
            const result = await extension.followRedirects('https://example.com/start');
            assert.ok(result);
        });
    });
});

describe('checkForUpdates', () => {
    it('detects newer version and returns update state', async () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'vscode');
        vscode.__setConfig('channel', 'stable');

        await withMockHttps([
            createMockResponse(200, {}, '["1.134.0"]')
        ], async () => {
            extension.resolveUrls();
            const result = await extension.checkForUpdates({
                updateAvailable: false,
                latestVersion: null,
                lastNotifiedVersion: null
            });

            assert.strictEqual(result.latestVersion, '1.134.0');
            assert.strictEqual(result.updateAvailable, true);
        });

        vscode.__clearConfig();
    });

    it('detects same version and returns up to date state', async () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'vscode');
        vscode.__setConfig('channel', 'stable');

        await withMockHttps([
            createMockResponse(200, {}, '["1.133.0"]')
        ], async () => {
            extension.resolveUrls();
            const result = await extension.checkForUpdates({
                updateAvailable: false,
                latestVersion: null,
                lastNotifiedVersion: null
            });

            assert.strictEqual(result.latestVersion, '1.133.0');
            assert.strictEqual(result.updateAvailable, false);
        });

        vscode.__clearConfig();
    });

    it('handles HTTP error status by rejecting', async () => {
        vscode.__clearConfig();
        vscode.__setConfig('flavour', 'vscode');
        vscode.__setConfig('channel', 'stable');

        await withMockHttps([
            createMockResponse(500, {}, 'Server Error')
        ], async () => {
            extension.resolveUrls();
            try {
                await extension.checkForUpdates({
                    updateAvailable: false,
                    latestVersion: null,
                    lastNotifiedVersion: null
                });
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e.message.includes('Version check failed'));
            }
        });

        vscode.__clearConfig();
    });
});
