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

let outputChannel;
const LOG_LEVELS = { info: 0, debug: 1, trace: 2 };

function getLogLevel() {
    try {
        const config = vscode.workspace.getConfiguration('vscode-updater');
        return config.get('logLevel') || 'info';
    } catch {
        return 'info';
    }
}

function log(level, ...args) {
    const currentLevel = getLogLevel();
    if (LOG_LEVELS[level] > LOG_LEVELS[currentLevel]) {
        return;
    }
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        if (arg instanceof Error) {
            return `${arg.name}: ${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const fullMessage = `${prefix} ${message}`;
    if (outputChannel) {
        outputChannel.appendLine(fullMessage);
    }
    if (level === 'info') {
        console.log(fullMessage);
    } else if (level === 'debug') {
        console.debug(fullMessage);
    } else if (level === 'trace') {
        // trace goes to output channel only — no console overhead
    }
}

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
let isChecking = false;
let globalState;

const LAST_CHECK_KEY = 'vscode-updater.lastCheckTimestamp';

async function validateFileSize(filePath, label, retries = 3, retryDelay = 200) {
    let stats;
    for (let attempt = 1; attempt <= retries; attempt++) {
        stats = await fs.promises.stat(filePath);
        log('trace', `${label} size attempt ${attempt}:`, stats.size, 'bytes');
        if (stats.size > 0) {
            return stats;
        }
        if (attempt < retries) {
            log('warn', `${label} size is 0 on attempt ${attempt}, retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    return stats;
}

function getConfig() {
    log('trace', 'getConfig() called');
    return vscode.workspace.getConfiguration('vscode-updater');
}

function getEnabled() {
    return getConfig().get('enabled') !== false;
}

function getCheckOnStartup() {
    return getConfig().get('checkOnStartup') !== false;
}

function resolveUrls() {
    log('debug', 'resolveUrls() starting');
    const config = getConfig();
    const flavour = config.get('flavour') || 'vscode';
    const channel = config.get('channel') || 'stable';
    log('debug', 'Resolved flavour:', flavour, 'channel:', channel);

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
    log('trace', 'getInstallPath() called');
    const config = vscode.workspace.getConfiguration('vscode-updater');
    let installPath = config.get('installPath');
    log('trace', 'installPath from config:', installPath);
    if (installPath && installPath.startsWith('~/')) {
        installPath = path.join(os.homedir(), installPath.slice(2));
        log('trace', 'Expanded ~ to home directory:', installPath);
    }
    if (!installPath) {
        log('debug', 'No installPath set, detecting...');
        const detected = detectInstallPath();
        log('info', 'Auto-detected install path:', detected);
        return detected;
    }
    return installPath;
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
    if (isChecking) {
        log('trace', 'checkForUpdates() skipped - already in progress');
        return;
    }
    isChecking = true;
    log('trace', 'checkForUpdates() starting, options:', options);
    try {
        if (options.updateAvailable !== undefined) updateAvailable = options.updateAvailable;
        if (options.latestVersion !== undefined) latestVersion = options.latestVersion;
        if (options.lastNotifiedVersion !== undefined) lastNotifiedVersion = options.lastNotifiedVersion;
        log('trace', 'State after options merge:', { updateAvailable, latestVersion, lastNotifiedVersion });
        
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
                    log('debug', 'Update check response received, length:', data.length);
                    try {
                        latestVersion = extractVersion(data);
                        log('debug', 'Extracted latest version:', latestVersion);
                        const normalizedLatest = normalizeVersion(latestVersion);
                        const normalizedCurrent = normalizeVersion(getCurrentVersion());
                        
                        if (normalizedLatest && normalizedLatest !== normalizedCurrent) {
                            if (normalizedLatest !== lastNotifiedVersion) {
                                updateAvailable = true;
                                lastNotifiedVersion = normalizedLatest;
                                if (getEnabled()) {
                                    showUpdateNotification(latestVersion);
                                }
                                updateStatusBar('update');
                            }
                        } else if (normalizedLatest === normalizedCurrent) {
                            updateStatusBar('updated');
                            updateAvailable = false;
                        }
                    } catch (err) {
                        log('error', 'Failed to parse update info:', err);
                        updateStatusBar('error');
                    }
                    resolve({ updateAvailable, latestVersion, lastNotifiedVersion });
                });
                res.on('error', reject);
            });
            
            req.on('timeout', () => {
                req.destroy();
                log('error', 'Update check timed out');
                updateStatusBar('error');
                reject(new Error('Update check timed out'));
            });
            
            req.on('error', (err) => {
                log('error', 'Update check failed:', err);
                updateStatusBar('error');
                reject(err);
            });
        });
    } finally {
        isChecking = false;
        if (globalState) {
            globalState.update(LAST_CHECK_KEY, Date.now()).catch(() => {});
        }
    }
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
        log('error', 'Failed to parse version JSON:', e);
    }
    return null;
}

function showUpdateNotification(version) {
    log('info', 'showUpdateNotification() called with version:', version);
    const choice = vscode.window.showInformationMessage(
        `VS Code ${version} is available. Would you like to update now?`,
        'Update Now',
        'Later'
    );

    choice.then(selection => {
        if (selection === 'Update Now') {
            vscode.commands.executeCommand('vscode-updater.update');
        }
    });
}

function getDownloadUrl(version, downloadUrl, platform) {
    log('trace', 'getDownloadUrl() called');
    const config = getConfig();
    const flavour = config.get('flavour') || 'vscode';
    const v = version || latestVersion || 'latest';
    const baseUrl = downloadUrl || updateDownloadUrl;
    const plat = platform || PLATFORM;
    log('trace', 'Download URL params:', { flavour, version: v, baseUrl, platform: plat });

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
    log('info', 'downloadFile() starting');
    log('debug', 'URL:', url, '-> dest:', dest);
    const res = await followRedirects(url);
    log('debug', 'Response status:', res.statusCode);
    if (res.statusCode < 200 || res.statusCode >= 300) {
        log('error', 'Download failed with status:', res.statusCode);
        throw new Error(`Download failed with status ${res.statusCode}`);
    }
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', async () => {
            file.close();
            try {
                const stats = await fs.promises.stat(dest);
                log('debug', 'Downloaded file size:', stats.size, 'bytes');
                if (stats.size === 0) {
                    log('error', 'Downloaded file is empty');
                    await fs.promises.rm(dest).catch(() => {});
                    reject(new Error('Downloaded file is empty'));
                    return;
                }
            } catch {
                log('error', 'Failed to verify downloaded file');
                reject(new Error('Failed to verify downloaded file'));
                return;
            }
            log('info', 'Download completed successfully');
            resolve();
        });
        res.on('error', reject);
    });
}

async function extractTarGz(tarPath, dest) {
    log('info', 'extractTarGz() starting');
    log('debug', 'Extracting:', tarPath, '->', dest);
    return new Promise((resolve, reject) => {
        execFile('tar', ['-xzf', tarPath, '-C', dest], { timeout: getConfig().get('tarTimeout') || 600000 }, (error) => {
            if (error) {
                log('error', 'tar extraction failed:', error);
                reject(error);
            } else {
                log('info', 'tar extraction completed');
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
    log('trace', 'getBinaryName() called');
    const config = getConfig();
    const flavour = config.get('flavour') || 'vscode';
    const customBinaryName = config.get('customBinaryName');
    log('trace', 'Binary name config:', { flavour, customBinaryName });
    
    if (flavour === 'codium') {
        return 'codium';
    }
    
    if (flavour === 'other' && customBinaryName && validateBinaryName(customBinaryName)) {
        return customBinaryName;
    }
    
    return 'code';
}

function restartVSCode() {
    log('info', 'restartVSCode() called');
    const binaryName = getBinaryName();
    const currentExecPath = process.execPath;
    log('debug', 'Restarting with binary:', binaryName, 'execPath:', currentExecPath);
    
    spawn('pkill', ['-x', binaryName], { stdio: 'ignore' }).on('close', () => {
        spawn(currentExecPath, [], {
            detached: true,
            stdio: 'inherit'
        }).unref();
    }).unref();
}

async function performUpdate() {
    log('info', 'performUpdate() starting');
    const installPath = getInstallPath();
    log('info', 'Resolved installPath:', installPath);
    if (!installPath) {
        vscode.window.showErrorMessage('Could not detect VS Code installation path. Please set `vscode-updater.installPath` in settings.');
        log('error', 'No install path detected');
        return;
    }

    if (!fs.existsSync(installPath)) {
        vscode.window.showErrorMessage(`Installation path does not exist: ${installPath}`);
        log('error', 'Install path does not exist:', installPath);
        return;
    }

    if (!validateInstallPath(installPath)) {
        vscode.window.showErrorMessage(`Installation path is not allowed for safety reasons: ${installPath}`);
        log('error', 'Install path is not allowed for safety reasons:', installPath);
        return;
    }

    log('info', 'Creating temp directory...');
    const tempDirConfig = getConfig().get('tempDir');
    log('trace', 'tempDir setting:', tempDirConfig);
    const tempBase = tempDirConfig && tempDirConfig.trim() !== '' ? tempDirConfig.trim() : os.tmpdir();
    log('info', 'Using temp base directory:', tempBase);
    const tmpDir = await fs.promises.mkdtemp(path.join(tempBase, 'vscode-update-'));
    log('info', 'Temp directory created:', tmpDir);
    const tarFile = path.join(tmpDir, 'vscode.tar.gz');
    let oldPath = null;

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Updating VS Code...',
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                log('info', 'Update cancellation requested');
                cpRm(tmpDir, { recursive: true, force: true }).catch(() => {});
                if (oldPath) {
                    cpRm(oldPath, { recursive: true, force: true }).catch(() => {});
                }
                vscode.window.showInformationMessage('Update canceled.');
                throw new Error('canceled');
            });

            log('debug', 'Resolving download URL...');
            const downloadUrl = getDownloadUrl();
            log('debug', 'Download URL:', downloadUrl);
            const cachedFile = await getCachedFile(downloadUrl);
            log('trace', 'Cached file result:', cachedFile);
            
            let archivePath;
            if (cachedFile) {
                progress.report({ message: 'Using cached download...' });
                updateStatusBar('updating');
                archivePath = cachedFile;
                log('info', 'Using cached archive:', archivePath);
            } else {
                progress.report({ message: 'Downloading update...' });
                updateStatusBar('updating');
                log('info', 'Downloading update from:', downloadUrl);
                log('debug', 'Destination file:', tarFile);
                await downloadFile(downloadUrl, tarFile);
                log('info', 'Download completed');
                await saveToCache(downloadUrl, tarFile);
                log('trace', 'Saved to cache');
                archivePath = getCacheFilePath(getDownloadUrl());
                log('trace', 'Archive path from cache:', archivePath);
            }

            log('debug', 'Validating gzip header...');
            const gzipBuffer = Buffer.alloc(2);
            const fd = await fs.promises.open(archivePath, 'r');
            await fd.read(gzipBuffer, 0, 2, 0);
            await fd.close();
            if (gzipBuffer[0] !== 0x1f || gzipBuffer[1] !== 0x8b) {
                log('error', 'Invalid gzip header:', gzipBuffer);
                throw new Error('Downloaded file is not a valid gzip archive');
            }
            log('debug', 'Gzip header valid');

            progress.report({ message: 'Extracting new version...' });
            log('info', 'Extracting archive...');
            const extractDir = path.join(tmpDir, 'extracted');
            await cpMkdir(extractDir, { recursive: true });
            await extractTarGz(archivePath, extractDir);
            log('info', 'Extraction completed to:', extractDir);

            log('trace', 'Reading extracted contents from:', extractDir);
            const extractedContents = await cpReaddir(extractDir);
            log('trace', 'Extracted contents:', extractedContents);
            const sourceDir = extractedContents.length === 1 && (await cpStat(path.join(extractDir, extractedContents[0]))).isDirectory()
                ? path.join(extractDir, extractedContents[0])
                : extractDir;
            log('debug', 'Source directory:', sourceDir);

            const sourceFiles = await cpReaddir(sourceDir);
            log('trace', 'Source files count:', sourceFiles.length);
            if (sourceFiles.length === 0) {
                log('error', 'Extracted archive is empty');
                throw new Error('Extracted archive is empty');
            }

            log('trace', 'Validating source asar before move...');
            const sourceAsarPath = path.join(sourceDir, 'resources/app/node_modules.asar');
            if (fs.existsSync(sourceAsarPath)) {
                const sourceAsarStats = await validateFileSize(sourceAsarPath, 'Source asar');
                log('trace', 'Source asar size:', sourceAsarStats.size, 'bytes');
            }

            progress.report({ message: 'Replacing installation...' });
    if (getConfig().get('autoBackup') === false) {
        log('info', 'Skipping backup because autoBackup is disabled');
        await cpRm(installPath, { recursive: true, force: true });
    } else {
        oldPath = installPath + '.OLD';
        
        if (fs.existsSync(oldPath)) {
            log('debug', 'Removing existing oldPath:', oldPath);
            await cpRm(oldPath, { recursive: true, force: true });
        }
        
        await new Promise((resolve, reject) => {
            execFile('mv', [installPath, oldPath], { timeout: getConfig().get('mvTimeout') || 600000 }, (err) => {
                if (err) {
                    log('error', 'mv installPath to oldPath failed:', err);
                    reject(err);
                } else {
                    log('debug', 'mv installPath to oldPath succeeded');
                    resolve();
                }
            });
        });
    }
    
    log('debug', 'Attempting mv: sourceDir -> installPath');
    await new Promise((resolve, reject) => {
        execFile('mv', [sourceDir, installPath], { timeout: getConfig().get('mvTimeout') || 600000 }, (err) => {
            if (err) {
                reject(err);
            } else {
                log('info', 'mv succeeded');
                resolve();
            }
        });
    });

            log('debug', 'Validating node_modules.asar...');
            const asarPath = path.join(installPath, 'resources/app/node_modules.asar');
            log('trace', 'asarPath:', asarPath);
            if (fs.existsSync(asarPath)) {
                const stats = await validateFileSize(asarPath, 'asar');
                log('debug', 'asar size:', stats.size, 'bytes');
                if (stats.size === 0) {
                    log('error', 'node_modules.asar is empty after copy — installation may be corrupted');
                    throw new Error('node_modules.asar is empty after copy — installation may be corrupted');
                }
            } else {
                log('warn', 'node_modules.asar not found at expected path');
            }

            progress.report({ message: 'Cleaning up...' });
            log('info', 'Cleaning up temp files...');
            
            const deleteArchive = getConfig().get('debug.deleteDownloadedArchive');
            log('trace', 'debug.deleteDownloadedArchive setting:', deleteArchive);
            if (deleteArchive === false) {
                log('debug', 'Preserving archive for debugging');
                const debugDir = path.join(CACHE_DIR, 'debug');
                await fs.promises.mkdir(debugDir, { recursive: true }).catch(() => {});
                const debugPath = path.join(debugDir, `vscode-${latestVersion || 'latest'}.tar.gz`);
                await fs.promises.copyFile(archivePath, debugPath).catch(() => {});
            }
            
            log('trace', 'Removing tmpDir:', tmpDir);
            await cpRm(tmpDir, { recursive: true, force: true });
            log('trace', 'Removing oldPath:', oldPath);
            await cpRm(oldPath, { recursive: true, force: true }).catch(() => {});
            oldPath = null;

            log('info', 'Update completed successfully');
            vscode.window.showInformationMessage('VS Code updated successfully! Please restart to apply changes.', 'Restart Now').then(selection => {
                if (selection === 'Restart Now') {
                    log('info', 'User requested restart');
                    restartVSCode();
                }
            });
            updateStatusBar('updated');
            updateAvailable = false;
        });
    } catch (error) {
        if (error && error.message === 'canceled') {
            log('info', 'Update was canceled by user');
            return;
        }
        log('error', 'Update failed with error:', error);
        updateAvailable = false;
        
        await cpRm(tmpDir, { recursive: true, force: true }).catch(() => {});
        
        const keepFailedFolder = getConfig().get('debug.keepFailedFolder');
        log('trace', 'debug.keepFailedFolder setting:', keepFailedFolder);
        
        if (keepFailedFolder && installPath && fs.existsSync(installPath)) {
            try {
                const badPath = installPath + '.BAD';
                log('info', 'Keeping failed folder as:', badPath);
                if (fs.existsSync(badPath)) {
                    log('debug', 'Removing existing .BAD folder:', badPath);
                    await cpRm(badPath, { recursive: true, force: true });
                }
                await fs.promises.rename(installPath, badPath);
                vscode.window.showInformationMessage(`Update failed. Kept failed folder as: ${badPath}`);
            } catch (renameError) {
                log('error', 'Failed to rename failed folder:', renameError);
                if (oldPath && fs.existsSync(oldPath)) {
                    await fs.promises.rename(oldPath, installPath).catch(() => {});
                }
            }
        } else if (oldPath && fs.existsSync(oldPath)) {
            log('info', 'Restoring old installation from:', oldPath);
            try {
                await fs.promises.rename(oldPath, installPath);
                log('info', 'Old installation restored successfully');
            } catch (restoreError) {
                log('error', 'Failed to restore old installation:', restoreError);
            }
        }
        
        const errorMessage = error && error.message ? error.message : String(error);
        vscode.window.showErrorMessage(`Update failed: ${errorMessage}`);
        updateStatusBar('error');
    }
}

function updateStatusBar(state, statusBar) {
    log('trace', 'updateStatusBar() called with state:', state);
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
    outputChannel = vscode.window.createOutputChannel('VSCode Updater');
    context.subscriptions.push(outputChannel);
    outputChannel.show(true);
    log('info', 'Extension activating...');
    log('info', 'Log level:', getLogLevel());
    log('trace', 'Effective configuration:', {
        enabled: getConfig().get('enabled'),
        checkOnStartup: getConfig().get('checkOnStartup'),
        checkInterval: getConfig().get('checkInterval'),
        logLevel: getConfig().get('logLevel'),
        flavour: getConfig().get('flavour'),
        channel: getConfig().get('channel'),
        installPath: getConfig().get('installPath'),
        autoBackup: getConfig().get('autoBackup'),
        tempDir: getConfig().get('tempDir'),
        tarTimeout: getConfig().get('tarTimeout'),
        mvTimeout: getConfig().get('mvTimeout'),
    });
    resolveUrls();
    globalState = context.globalState;

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    const updateCommand = vscode.commands.registerCommand('vscode-updater.update', async () => {
        log('info', 'Update command triggered');
        if (isUpdating) {
            log('warn', 'Update already in progress, ignoring duplicate request');
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
        log('info', 'Restart command triggered');
        const unsavedEditors = vscode.workspace.textDocuments.filter(doc => doc.isDirty);
        if (unsavedEditors.length > 0) {
            log('warn', 'Unsaved files detected:', unsavedEditors.length);
            const userResponse = await vscode.window.showWarningMessage(
                `You have ${unsavedEditors.length} unsaved file(s). Do you want to continue? Unsaved changes will be lost.`,
                { modal: true },
                'Yes',
                'No'
            );
            if (userResponse !== 'Yes') {
                log('info', 'Restart canceled by user');
                vscode.window.showInformationMessage('Restart canceled.');
                return;
            }
        }
        restartVSCode();
    });

    const checkNowCommand = vscode.commands.registerCommand('vscode-updater.checkNow', async () => {
        log('info', 'Check now command triggered');
        updateStatusBar('checking');
        updateAvailable = false;
        latestVersion = null;
        lastNotifiedVersion = null;
        resolveUrls();
        try {
            await checkForUpdates();
        } catch (err) {
            log('error', 'Check for updates failed:', err);
            updateStatusBar('error');
        }
    });

    context.subscriptions.push(updateCommand, restartCommand, checkNowCommand);

    let checkTimeout;
    function scheduleNextCheck(overrideDelay) {
        const checkIntervalDays = Math.max(1, parseInt(getConfig().get('checkInterval')) || 1);
        log('info', 'Check interval set to:', checkIntervalDays, 'days');
        const rawIntervalMs = checkIntervalDays * 24 * 60 * 60 * 1000;
        const MAX_SAFE_TIMEOUT = 2147483647;
        const checkIntervalMs = Math.min(rawIntervalMs, MAX_SAFE_TIMEOUT);
        if (checkIntervalMs !== rawIntervalMs) {
            log('warn', 'Interval exceeds max safe timeout, capping to ~24.8 days');
        }
        clearTimeout(checkInterval);
        const delay = overrideDelay !== undefined ? overrideDelay : checkIntervalMs;
        checkInterval = setTimeout(async () => {
            log('trace', 'Periodic update check triggered');
            await checkForUpdates().catch((err) => {
                log('error', 'Periodic update check failed:', err);
                updateStatusBar('error');
            });
            scheduleNextCheck();
        }, delay);
    }
    clearTimeout(checkTimeout);

    if (getEnabled()) {
        (async () => {
            const lastCheckTimestamp = await globalState.get(LAST_CHECK_KEY).catch(() => null);
            const checkIntervalDays = Math.max(1, parseInt(getConfig().get('checkInterval')) || 1);
            const rawIntervalMs = checkIntervalDays * 24 * 60 * 60 * 1000;
            const MAX_SAFE_TIMEOUT = 2147483647;
            const checkIntervalMs = Math.min(rawIntervalMs, MAX_SAFE_TIMEOUT);
            
            if (getCheckOnStartup()) {
                log('info', 'checkOnStartup enabled, performing initial update check...');
                checkForUpdates().catch((err) => {
                    log('error', 'Initial update check failed:', err);
                    updateAvailable = false;
                    latestVersion = null;
                    lastNotifiedVersion = null;
                    updateStatusBar('error');
                });
            } else if (lastCheckTimestamp) {
                const elapsed = Date.now() - lastCheckTimestamp;
                const remaining = checkIntervalMs - elapsed;
                if (remaining > 0) {
                    log('info', `Last check was ${Math.round(elapsed / 1000 / 60)} minutes ago, next check in ${Math.round(remaining / 1000 / 60)} minutes`);
                    scheduleNextCheck(remaining);
                } else {
                    log('info', 'Last check was older than interval, running initial check');
                    checkForUpdates().catch((err) => {
                        log('error', 'Initial update check failed:', err);
                        updateAvailable = false;
                        latestVersion = null;
                        lastNotifiedVersion = null;
                        updateStatusBar('error');
                    });
                    scheduleNextCheck();
                }
            } else {
                log('info', 'No previous check timestamp, performing initial update check...');
                checkForUpdates().catch((err) => {
                    log('error', 'Initial update check failed:', err);
                    updateAvailable = false;
                    latestVersion = null;
                    lastNotifiedVersion = null;
                    updateStatusBar('error');
                });
                scheduleNextCheck();
            }
        })();
    } else {
        log('info', 'Extension is disabled, skipping automatic checks');
    }

    const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('vscode-updater')) {
            log('debug', 'Configuration changed, affected keys:', event.affectsConfiguration('vscode-updater.checkInterval') ? ['checkInterval'] : ['other']);
            resolveUrls();
            
            if (event.affectsConfiguration('vscode-updater.checkInterval') || event.affectsConfiguration('vscode-updater.enabled') || event.affectsConfiguration('vscode-updater.checkOnStartup')) {
                log('info', 'checkInterval/enabled/checkOnStartup changed, resetting timer');
                clearTimeout(checkTimeout);
                if (getEnabled()) {
                    scheduleNextCheck();
                }
            }
        }
    });
    
    context.subscriptions.push(configListener);

    const logLevelListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('vscode-updater.logLevel')) {
            const newLevel = getLogLevel();
            log('info', 'Log level changed to:', newLevel);
            outputChannel.show(true);
        }
    });
    context.subscriptions.push(logLevelListener);
}

function deactivate() {
    log('info', 'Extension deactivating...');
    if (checkInterval) {
        clearTimeout(checkInterval);
        log('trace', 'Cleared checkInterval');
    }
    if (statusBarHideTimeout) {
        clearTimeout(statusBarHideTimeout);
        log('trace', 'Cleared statusBarHideTimeout');
    }
    if (statusBarItem) {
        statusBarItem.dispose();
        log('trace', 'Disposed statusBarItem');
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
    LAST_CHECK_KEY,
    _setGlobalState: (gs) => { globalState = gs; },
    getEnabled,
    getCheckOnStartup,
    validateFileSize,
};
