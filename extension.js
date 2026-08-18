let vscode;
try {
    vscode = require('vscode');
} catch  {
    vscode = require('./test/vscode-mock');
}
const { execFile, spawn } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { URL } = require('url');

const cpMkdir = promisify(fs.mkdir);
const cpReaddir = promisify(fs.readdir);

const cpRm = promisify(fs.rm);
const cpStat = promisify(fs.stat);

const DEFAULT_UPDATE_CHECK_URL = 'https://update.code.visualstudio.com/api/releases/stable';
const DEFAULT_UPDATE_DOWNLOAD_URL = 'https://update.code.visualstudio.com';
const CACHE_DIR = path.join(os.homedir(), '.cache', 'vscode-updater');

function getCacheKey(url) {
    return url.replace(/[^a-zA-Z0-9]/g, '_');
}

function getCacheFilePath(url) {
    return path.join(CACHE_DIR, getCacheKey(url) + '.tar.gz');
}

async function ensureCacheDir() {
    try {
        await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    } catch {
        // ignore
    }
}

async function getCachedFile(url) {
    await ensureCacheDir();
    const cachePath = getCacheFilePath(url);
    if (fs.existsSync(cachePath)) {
        try {
            const stats = await fs.promises.stat(cachePath);
            if (stats.size > 0) {
                const gzipBuffer = Buffer.alloc(2);
                const fd = await fs.promises.open(cachePath, 'r');
                await fd.read(gzipBuffer, 0, 2, 0);
                await fd.close();
                if (gzipBuffer[0] === 0x1f && gzipBuffer[1] === 0x8b) {
                    return cachePath;
                }
            }
        } catch {
            // ignore corrupt cache
        }
    }
    return null;
}

async function saveToCache(url, filePath) {
    await ensureCacheDir();
    const cachePath = getCacheFilePath(url);
    try {
        await fs.promises.rename(filePath, cachePath);
    } catch {
        // ignore cache write errors
    }
}

const FORBIDDEN_INSTALL_PREFIXES = [
    '/',
    '/usr',
    '/home',
    '/tmp',
    '/var',
    '/snap',
    '/dev',
    '/proc',
    '/sys',
    '/boot',
    '/root',
    '/nix'
];

let updateCheckUrl;
let updateDownloadUrl;
let statusBarItem;
let checkInterval;
let updateAvailable = false;
let latestVersion = null;
let lastNotifiedVersion = null;
let statusBarHideTimeout = null;
let isUpdating = false;

function getConfig() {
    return vscode.workspace.getConfiguration('vscode-updater');
}

function resolveUrls() {
    const config = getConfig();
    const flavour = config.get('flavour') || 'vscode';
    const channel = config.get('channel') || 'stable';

    if (flavour === 'other') {
        updateCheckUrl = config.get('customReleasesUrl') || DEFAULT_UPDATE_CHECK_URL;
        updateDownloadUrl = config.get('customUpdateBaseUrl') || DEFAULT_UPDATE_DOWNLOAD_URL;
        return { updateCheckUrl, updateDownloadUrl };
    }

    if (flavour === 'codium') {
        updateCheckUrl = 'https://api.github.com/repos/VSCodium/vscodium/releases/latest';
        updateDownloadUrl = 'https://github.com/VSCodium/vscodium/releases/download';
        return { updateCheckUrl, updateDownloadUrl };
    }

    updateCheckUrl = `https://update.code.visualstudio.com/api/releases/${channel}`;
    updateDownloadUrl = DEFAULT_UPDATE_DOWNLOAD_URL;
    return { updateCheckUrl, updateDownloadUrl };
}

function getInstallPath() {
    const config = vscode.workspace.getConfiguration('vscode-updater');
    let installPath = config.get('installPath');
    if (installPath && installPath.startsWith('~/')) {
        installPath = path.join(os.homedir(), installPath.slice(2));
    }
    return installPath || detectInstallPath();
}

function detectInstallPath() {
    const possiblePaths = [
        '/usr/share/code',
        '/usr/share/code-insiders',
        '/usr/share/vscode',
        '/opt/visual-studio-code',
        '/opt/visual-studio-code-insiders',
        '/opt/vscode',
        path.join(os.homedir(), '.vscode'),
        path.join(os.homedir(), '.vscode-insiders')
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    
    const execPath = process.execPath;
    const installDir = path.dirname(path.dirname(execPath));
    if (fs.existsSync(installDir)) {
        return installDir;
    }
    
    return null;
}

function validateInstallPath(installPath) {
    if (!installPath || installPath === '') {
        return false;
    }

    let resolved;
    try {
        resolved = fs.realpathSync(installPath);
    } catch {
        resolved = path.resolve(installPath);
    }
    
    const normalizedResolved = resolved.replace(/\\/g, '/');
    for (const prefix of FORBIDDEN_INSTALL_PREFIXES) {
        const normalizedPrefix = prefix.replace(/\\/g, '/');
        if (normalizedResolved === normalizedPrefix || normalizedResolved === normalizedPrefix + '/') {
            return false;
        }
    }

    return true;
}

function getCurrentVersion() {
    return vscode.version;
}

function normalizeVersion(version) {
    if (!version) return null;
    return version.replace(/^v/, '').split(/[+-]/)[0];
}

function getPlatformSuffix() {
    const arch = process.arch;
    switch (arch) {
        case 'x64':
            return 'linux-x64';
        case 'arm64':
            return 'linux-arm64';
        case 'arm':
            return 'linux-armhf';
        default:
            return 'linux-x64';
    }
}

const PLATFORM = getPlatformSuffix();

async function checkForUpdates(options = {}) {
    if (options.updateAvailable !== undefined) updateAvailable = options.updateAvailable;
    if (options.latestVersion !== undefined) latestVersion = options.latestVersion;
    if (options.lastNotifiedVersion !== undefined) lastNotifiedVersion = options.lastNotifiedVersion;
    
    if (updateAvailable && latestVersion === lastNotifiedVersion) {
        return { updateAvailable, latestVersion, lastNotifiedVersion };
    }

    return new Promise((resolve, reject) => {
        const req = https.get(updateCheckUrl, { 
            headers: { 'User-Agent': 'VS Code Updater Extension' },
            timeout: 30000
        }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                updateStatusBar('error');
                reject(new Error(`Version check failed with status ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    latestVersion = extractVersion(data);
                    const normalizedLatest = normalizeVersion(latestVersion);
                    const normalizedCurrent = normalizeVersion(getCurrentVersion());
                    
                    if (normalizedLatest && normalizedLatest !== normalizedCurrent) {
                        if (normalizedLatest !== lastNotifiedVersion) {
                            updateAvailable = true;
                            lastNotifiedVersion = normalizedLatest;
                            showUpdateNotification(latestVersion);
                            updateStatusBar('update');
                        }
                    } else if (normalizedLatest === normalizedCurrent) {
                        updateStatusBar('updated');
                        updateAvailable = false;
                    }
                } catch (err) {
                    console.error('Failed to parse update info:', err);
                    updateStatusBar('error');
                }
                resolve({ updateAvailable, latestVersion, lastNotifiedVersion });
            });
            res.on('error', reject);
        });
        
        req.on('timeout', () => {
            req.destroy();
            console.error('Update check timed out');
            updateStatusBar('error');
            reject(new Error('Update check timed out'));
        });
        
        req.on('error', (err) => {
            console.error('Update check failed:', err);
            updateStatusBar('error');
            reject(err);
        });
    });
}

function extractVersion(data) {
    try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
            return parsed.length > 0 ? parsed[0] : null;
        }
        if (parsed && parsed.tag_name) {
            return parsed.tag_name;
        }
} catch (e) {
        console.error('Failed to parse version JSON:', e);
    }
    return null;
}

function showUpdateNotification(version) {
    const choice = vscode.window.showInformationMessage(
        `VS Code ${version} is available. Would you like to update now?`,
        'Update Now',
        'Later'
    );

    choice.then(selection => {
        if (selection === 'Update Now') {
            performUpdate();
        }
    });
}

function getDownloadUrl(version, downloadUrl, platform) {
    const config = getConfig();
    const flavour = config.get('flavour') || 'vscode';
    const v = version || latestVersion || 'latest';
    const baseUrl = downloadUrl || updateDownloadUrl;
    const plat = platform || PLATFORM;

    if (flavour === 'codium') {
        const cleanVersion = normalizeVersion(v) || v;
        const platformMap = {
            'linux-x64': `VSCodium-linux-x64-${cleanVersion}.tar.gz`,
            'linux-arm64': `VSCodium-linux-arm64-${cleanVersion}.tar.gz`,
            'linux-armhf': `VSCodium-linux-armhf-${cleanVersion}.tar.gz`
        };
        const filename = platformMap[plat] || platformMap['linux-x64'];
        return `${baseUrl}/${v}/${filename}`;
    }

    return `${baseUrl}/${v}/${plat}/stable`;
}

async function followRedirects(url, maxRedirects = 5) {
    let currentUrl = url;
    let redirects = 0;
    
    while (redirects < maxRedirects) {
        const result = await new Promise((resolve, reject) => {
            const req = https.get(currentUrl, { 
                headers: { 'User-Agent': 'VS Code Updater Extension' },
                timeout: 30000 
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    resolve({ redirect: res.headers.location, statusCode: res.statusCode });
                } else {
                    resolve({ stream: res, statusCode: res.statusCode });
                }
                res.on('error', reject);
            });
            
            req.on('error', (err) => {
                reject(err);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });
        });
        
        if (result.redirect) {
            currentUrl = new URL(result.redirect, currentUrl).href;
            redirects++;
        } else {
            return result.stream;
        }
    }
    
    throw new Error('Too many redirects');
}

async function downloadFile(url, dest) {
    const res = await followRedirects(url);
    if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`Download failed with status ${res.statusCode}`);
    }
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', async () => {
            file.close();
            try {
                const stats = await fs.promises.stat(dest);
                if (stats.size === 0) {
                    await fs.promises.rm(dest).catch(() => {});
                    reject(new Error('Downloaded file is empty'));
                    return;
                }
            } catch {
                reject(new Error('Failed to verify downloaded file'));
                return;
            }
            resolve();
        });
        res.on('error', reject);
    });
}

async function extractTarGz(tarPath, dest) {
    return new Promise((resolve, reject) => {
        execFile('tar', ['-xzf', tarPath, '-C', dest], (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function validateBinaryName(name) {
    if (!name || typeof name !== 'string') {
        return false;
    }
    return /^[a-zA-Z0-9_-]+$/.test(name);
}

function getBinaryName() {
    const config = getConfig();
    const flavour = config.get('flavour') || 'vscode';
    const customBinaryName = config.get('customBinaryName');
    
    if (flavour === 'codium') {
        return 'codium';
    }
    
    if (flavour === 'other' && customBinaryName && validateBinaryName(customBinaryName)) {
        return customBinaryName;
    }
    
    return 'code';
}

function restartVSCode() {
    const binaryName = getBinaryName();
    const currentExecPath = process.execPath;
    
    if (process.platform === 'win32') {
        const installDir = path.dirname(currentExecPath);
        spawn('taskkill', ['/IM', binaryName + '.exe', '/F'], {
            detached: true,
            stdio: 'ignore'
        }).on('close', () => {
            spawn(path.join(installDir, binaryName + '.exe'), [], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        }).unref();
    } else {
        spawn('pkill', ['-x', binaryName], { stdio: 'ignore' }).on('close', () => {
            spawn(currentExecPath, [], {
                detached: true,
                stdio: 'inherit'
            }).unref();
        }).unref();
    }
}

async function performUpdate() {
    const installPath = getInstallPath();
    if (!installPath) {
        vscode.window.showErrorMessage('Could not detect VS Code installation path. Please set `vscode-updater.installPath` in settings.');
        return;
    }

    if (!fs.existsSync(installPath)) {
        vscode.window.showErrorMessage(`Installation path does not exist: ${installPath}`);
        return;
    }

    if (!validateInstallPath(installPath)) {
        vscode.window.showErrorMessage(`Installation path is not allowed for safety reasons: ${installPath}`);
        return;
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-update-'));
    const tarFile = path.join(tmpDir, 'vscode.tar.gz');
    let oldPath = null;

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Updating VS Code...',
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                cpRm(tmpDir, { recursive: true, force: true }).catch(() => {});
                if (oldPath) {
                    cpRm(oldPath, { recursive: true, force: true }).catch(() => {});
                }
                vscode.window.showInformationMessage('Update canceled.');
                throw new Error('canceled');
            });

            const downloadUrl = getDownloadUrl();
            const cachedFile = await getCachedFile(downloadUrl);
            
            let archivePath;
            if (cachedFile) {
                progress.report({ message: 'Using cached download...' });
                updateStatusBar('updating');
                archivePath = cachedFile;
            } else {
                progress.report({ message: 'Downloading update...' });
                updateStatusBar('updating');
                await downloadFile(downloadUrl, tarFile);
                await saveToCache(downloadUrl, tarFile);
                archivePath = getCacheFilePath(getDownloadUrl());
            }

            const gzipBuffer = Buffer.alloc(2);
            const fd = await fs.promises.open(archivePath, 'r');
            await fd.read(gzipBuffer, 0, 2, 0);
            await fd.close();
            if (gzipBuffer[0] !== 0x1f || gzipBuffer[1] !== 0x8b) {
                throw new Error('Downloaded file is not a valid gzip archive');
            }

            progress.report({ message: 'Extracting new version...' });
            const extractDir = path.join(tmpDir, 'extracted');
            await cpMkdir(extractDir, { recursive: true });
            await extractTarGz(archivePath, extractDir);

            const extractedContents = await cpReaddir(extractDir);
            const sourceDir = extractedContents.length === 1 && (await cpStat(path.join(extractDir, extractedContents[0]))).isDirectory()
                ? path.join(extractDir, extractedContents[0])
                : extractDir;

            const sourceFiles = await cpReaddir(sourceDir);
            if (sourceFiles.length === 0) {
                throw new Error('Extracted archive is empty');
            }

            progress.report({ message: 'Replacing installation...' });
            oldPath = installPath + '.OLD';
            
            if (fs.existsSync(oldPath)) {
                await cpRm(oldPath, { recursive: true, force: true });
            }
            
            await fs.promises.rename(installPath, oldPath);
            await fs.promises.rename(sourceDir, installPath);

            const asarPath = path.join(installPath, 'resources/app/node_modules.asar');
            if (fs.existsSync(asarPath)) {
                const stats = await fs.promises.stat(asarPath);
                if (stats.size === 0) {
                    throw new Error('node_modules.asar is empty after copy — installation may be corrupted');
                }
            }

            progress.report({ message: 'Cleaning up...' });
            
            const deleteArchive = getConfig().get('debug.deleteDownloadedArchive');
            if (deleteArchive === false) {
                const debugDir = path.join(CACHE_DIR, 'debug');
                await fs.promises.mkdir(debugDir, { recursive: true }).catch(() => {});
                const debugPath = path.join(debugDir, `vscode-${latestVersion || 'latest'}.tar.gz`);
                await fs.promises.copyFile(archivePath, debugPath).catch(() => {});
            }
            
            await cpRm(tmpDir, { recursive: true, force: true });
            await cpRm(oldPath, { recursive: true, force: true }).catch(() => {});
            oldPath = null;

            vscode.window.showInformationMessage('VS Code updated successfully! Please restart to apply changes.', 'Restart Now').then(selection => {
                if (selection === 'Restart Now') {
                    restartVSCode();
                }
            });
            updateStatusBar('updated');
            updateAvailable = false;
        });
    } catch (error) {
        if (error && error.message === 'canceled') {
            return;
        }
        updateAvailable = false;
        
        await cpRm(tmpDir, { recursive: true, force: true }).catch(() => {});
        
        const keepFailedFolder = getConfig().get('debug.keepFailedFolder');
        
        if (keepFailedFolder && installPath && fs.existsSync(installPath)) {
            try {
                const badPath = installPath + '.BAD';
                await fs.promises.rename(installPath, badPath);
                vscode.window.showInformationMessage(`Update failed. Kept failed folder as: ${badPath}`);
            } catch (renameError) {
                console.error('Failed to rename failed folder:', renameError);
                if (oldPath && fs.existsSync(oldPath)) {
                    await fs.promises.rename(oldPath, installPath).catch(() => {});
                }
            }
        } else if (oldPath && fs.existsSync(oldPath)) {
            try {
                await fs.promises.rename(oldPath, installPath);
            } catch (restoreError) {
                console.error('Failed to restore old installation:', restoreError);
            }
        }
        
        const errorMessage = error && error.message ? error.message : String(error);
        console.error('Update failed:', error);
        vscode.window.showErrorMessage(`Update failed: ${errorMessage}`);
        updateStatusBar('error');
    }
}

function updateStatusBar(state, statusBar) {
    const item = statusBar || statusBarItem;
    if (!item) {
        return;
    }

    switch (state) {
        case 'update':
            item.text = '$(sync) Update Available';
            item.tooltip = 'VS Code update available. Click to update.';
            item.command = 'vscode-updater.update';
            item.show();
            break;
        case 'updated':
            item.text = '$(check) Up to Date';
            item.tooltip = 'VS Code is up to date.';
            item.command = null;
            item.show();
            if (statusBarHideTimeout) {
                clearTimeout(statusBarHideTimeout);
            }
            statusBarHideTimeout = setTimeout(() => item.hide(), 5000);
            break;
        case 'error':
            item.text = '$(error) Update Failed';
            item.tooltip = 'Update failed. Click to retry.';
            item.command = 'vscode-updater.update';
            item.show();
            break;
        case 'checking':
            item.text = '$(sync~spin) Checking...';
            item.tooltip = 'Checking for VS Code updates...';
            item.command = null;
            item.show();
            break;
        case 'updating':
            item.text = '$(sync~spin) Updating...';
            item.tooltip = 'VS Code update in progress...';
            item.command = null;
            item.show();
            break;
        default:
            item.hide();
    }
}

function activate(context) {
    resolveUrls();

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    const updateCommand = vscode.commands.registerCommand('vscode-updater.update', async () => {
        if (isUpdating) {
            vscode.window.showInformationMessage('Update already in progress');
            return;
        }
        isUpdating = true;
        updateStatusBar('updating');
        statusBarItem.command = null;
        try {
            await performUpdate();
        } finally {
            isUpdating = false;
            statusBarItem.command = 'vscode-updater.update';
        }
    });

    const restartCommand = vscode.commands.registerCommand('vscode-updater.restart', async () => {
        const unsavedEditors = vscode.workspace.textDocuments.filter(doc => doc.isDirty);
        if (unsavedEditors.length > 0) {
            const userResponse = await vscode.window.showWarningMessage(
                `You have ${unsavedEditors.length} unsaved file(s). Do you want to continue? Unsaved changes will be lost.`,
                { modal: true },
                'Yes',
                'No'
            );
            if (userResponse !== 'Yes') {
                vscode.window.showInformationMessage('Restart canceled.');
                return;
            }
        }
        restartVSCode();
    });

    const checkNowCommand = vscode.commands.registerCommand('vscode-updater.checkNow', async () => {
        updateStatusBar('checking');
        updateAvailable = false;
        latestVersion = null;
        lastNotifiedVersion = null;
        resolveUrls();
        try {
            await checkForUpdates();
        } catch (err) {
            console.error('Check for updates failed:', err);
            updateStatusBar('error');
        }
    });

    context.subscriptions.push(updateCommand, restartCommand, checkNowCommand);

    const checkIntervalDays = Math.max(1, parseInt(getConfig().get('checkInterval')) || 1);
    const checkIntervalMs = checkIntervalDays * 24 * 60 * 60 * 1000;
    checkInterval = setInterval(() => {
        checkForUpdates().catch((err) => {
            console.error('Periodic update check failed:', err);
            updateStatusBar('error');
        });
    }, checkIntervalMs);

    const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('vscode-updater')) {
            resolveUrls();
            
            if (event.affectsConfiguration('vscode-updater.checkInterval')) {
                clearInterval(checkInterval);
                const newIntervalDays = Math.max(1, parseInt(getConfig().get('checkInterval')) || 1);
                const newIntervalMs = newIntervalDays * 24 * 60 * 60 * 1000;
                checkInterval = setInterval(() => {
                    checkForUpdates().catch((err) => {
                        console.error('Periodic update check failed:', err);
                        updateStatusBar('error');
                    });
                }, newIntervalMs);
            }
        }
    });
    
    context.subscriptions.push(configListener);

    checkForUpdates().catch((err) => {
        console.error('Initial update check failed:', err);
        updateStatusBar('error');
    });
}

function deactivate() {
    if (checkInterval) {
        clearInterval(checkInterval);
    }
    if (statusBarHideTimeout) {
        clearTimeout(statusBarHideTimeout);
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

module.exports = {
    activate,
    deactivate,
    extractVersion,
    getPlatformSuffix,
    validateInstallPath,
    validateBinaryName,
    normalizeVersion,
    resolveUrls,
    getDownloadUrl,
    updateStatusBar,
    getBinaryName,
    detectInstallPath,
    getInstallPath,
    showUpdateNotification,
    followRedirects,
    checkForUpdates,
};
