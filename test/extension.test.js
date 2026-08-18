const assert = require('assert');
const extension = require('../extension');

describe('Extension Test Suite', () => {
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
});
