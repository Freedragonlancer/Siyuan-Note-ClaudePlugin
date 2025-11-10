/**
 * Clean Deploy Script for SiYuan Plugin Development
 *
 * This script performs a complete clean deployment:
 * 1. Closes SiYuan application
 * 2. Removes SiYuan cache
 * 3. Deletes old plugin files
 * 4. Rebuilds the plugin
 * 5. Deploys fresh plugin files
 * 6. Optionally restarts SiYuan
 *
 * Usage:
 *   npm run clean-deploy              # Clean deploy without auto-start
 *   npm run clean-deploy:auto-start   # Clean deploy with auto-start
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const CONFIG = {
    siyuanPath: 'N:/Siyuan-Note',
    pluginName: 'siyuan-plugin-claude-assistant',
    siyuanExe: 'N:/Siyuan-Note/SiYuan.exe', // Adjust if needed
};

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n[${ step }] ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠ ${message}`, 'yellow');
}

/**
 * Execute shell command
 */
function exec(command, options = {}) {
    try {
        const output = execSync(command, {
            encoding: 'utf-8',
            stdio: options.silent ? 'pipe' : 'inherit',
            ...options
        });
        return { success: true, output };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Check if SiYuan process is running
 */
function isSiYuanRunning() {
    const isWindows = os.platform() === 'win32';

    if (isWindows) {
        const result = exec('tasklist /FI "IMAGENAME eq SiYuan.exe"', { silent: true });
        return result.success && result.output.includes('SiYuan.exe');
    } else {
        const result = exec('pgrep -f SiYuan', { silent: true });
        return result.success && result.output.trim() !== '';
    }
}

/**
 * Close SiYuan application
 */
function closeSiYuan() {
    logStep('1/7', 'Closing SiYuan application...');

    if (!isSiYuanRunning()) {
        logSuccess('SiYuan is not running');
        return true;
    }

    const isWindows = os.platform() === 'win32';

    if (isWindows) {
        const result = exec('taskkill /F /IM SiYuan.exe', { silent: true });
        if (result.success) {
            logSuccess('SiYuan process terminated');
            // Wait for process to fully exit
            const maxWait = 5000; // 5 seconds
            const startTime = Date.now();
            while (isSiYuanRunning() && (Date.now() - startTime) < maxWait) {
                // Wait for process to exit
            }
            return true;
        } else {
            logWarning('Could not terminate SiYuan process');
            return false;
        }
    } else {
        const result = exec('pkill -f SiYuan', { silent: true });
        if (result.success) {
            logSuccess('SiYuan process terminated');
            return true;
        } else {
            logWarning('Could not terminate SiYuan process');
            return false;
        }
    }
}

/**
 * Remove directory recursively
 */
function removeDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return true;
    }

    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        return true;
    } catch (error) {
        logError(`Failed to remove ${dirPath}: ${error.message}`);
        return false;
    }
}

/**
 * Clean SiYuan cache
 */
function cleanCache() {
    logStep('2/7', 'Cleaning SiYuan cache...');

    const tempPath = path.join(CONFIG.siyuanPath, 'temp');

    if (removeDir(tempPath)) {
        logSuccess(`Removed cache directory: ${tempPath}`);
        return true;
    } else {
        logWarning(`Failed to remove cache: ${tempPath}`);
        return false;
    }
}

/**
 * Remove old plugin files
 */
function removeOldPlugin() {
    logStep('3/7', 'Removing old plugin files...');

    const pluginPath = path.join(CONFIG.siyuanPath, 'data', 'plugins', CONFIG.pluginName);

    if (removeDir(pluginPath)) {
        logSuccess(`Removed plugin directory: ${pluginPath}`);
        return true;
    } else {
        logWarning(`Failed to remove plugin: ${pluginPath}`);
        return false;
    }
}

/**
 * Clean dist directory
 */
function cleanDist() {
    logStep('4/7', 'Cleaning dist directory...');

    const distPath = path.join(process.cwd(), 'dist');

    if (removeDir(distPath)) {
        logSuccess('Removed dist directory');
        return true;
    } else {
        logWarning('Failed to remove dist directory');
        return false;
    }
}

/**
 * Build plugin
 */
function buildPlugin() {
    logStep('5/7', 'Building plugin...');

    log('Running: npm run build', 'yellow');
    const result = exec('npm run build');

    if (result.success) {
        logSuccess('Plugin built successfully');
        return true;
    } else {
        logError('Build failed');
        return false;
    }
}

/**
 * Copy file
 */
function copyFile(src, dest) {
    try {
        // Ensure destination directory exists
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        fs.copyFileSync(src, dest);
        return true;
    } catch (error) {
        logError(`Failed to copy ${src} to ${dest}: ${error.message}`);
        return false;
    }
}

/**
 * Deploy plugin files
 */
function deployPlugin() {
    logStep('6/7', 'Deploying plugin files...');

    const pluginPath = path.join(CONFIG.siyuanPath, 'data', 'plugins', CONFIG.pluginName);

    // Create plugin directory
    if (!fs.existsSync(pluginPath)) {
        fs.mkdirSync(pluginPath, { recursive: true });
        logSuccess(`Created plugin directory: ${pluginPath}`);
    }

    // Files to copy
    const filesToCopy = [
        { src: 'dist/index.js', dest: 'index.js' },
        { src: 'dist/index.css', dest: 'index.css' },
        { src: 'plugin.json', dest: 'plugin.json' },
        { src: 'icon.png', dest: 'icon.png' },
        { src: 'README.md', dest: 'README.md' },
    ];

    let allSuccess = true;
    for (const file of filesToCopy) {
        const srcPath = path.join(process.cwd(), file.src);
        const destPath = path.join(pluginPath, file.dest);

        if (!fs.existsSync(srcPath)) {
            logWarning(`Source file not found: ${file.src}`);
            allSuccess = false;
            continue;
        }

        if (copyFile(srcPath, destPath)) {
            logSuccess(`Copied: ${file.src} → ${file.dest}`);
        } else {
            allSuccess = false;
        }
    }

    return allSuccess;
}

/**
 * Verify deployment
 */
function verifyDeployment() {
    logStep('7/7', 'Verifying deployment...');

    const pluginPath = path.join(CONFIG.siyuanPath, 'data', 'plugins', CONFIG.pluginName);
    const requiredFiles = ['index.js', 'index.css', 'plugin.json', 'icon.png'];

    let allExist = true;
    for (const file of requiredFiles) {
        const filePath = path.join(pluginPath, file);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            logSuccess(`${file} (${(stats.size / 1024).toFixed(2)} KB)`);
        } else {
            logError(`Missing file: ${file}`);
            allExist = false;
        }
    }

    return allExist;
}

/**
 * Start SiYuan application
 */
function startSiYuan() {
    log('\n[AUTO-START] Starting SiYuan...', 'cyan');

    if (!fs.existsSync(CONFIG.siyuanExe)) {
        logWarning(`SiYuan executable not found: ${CONFIG.siyuanExe}`);
        logWarning('Please start SiYuan manually');
        return false;
    }

    try {
        // Spawn SiYuan as detached process
        const child = spawn(CONFIG.siyuanExe, [], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        logSuccess('SiYuan started');
        return true;
    } catch (error) {
        logError(`Failed to start SiYuan: ${error.message}`);
        return false;
    }
}

/**
 * Main execution
 */
function main() {
    const autoStart = process.argv.includes('--auto-start');

    log('\n' + '='.repeat(60), 'bright');
    log('  SiYuan Plugin - Clean Deploy Script', 'bright');
    log('='.repeat(60) + '\n', 'bright');

    log(`Plugin: ${CONFIG.pluginName}`, 'yellow');
    log(`SiYuan Path: ${CONFIG.siyuanPath}`, 'yellow');
    log(`Auto-start: ${autoStart ? 'Yes' : 'No'}`, 'yellow');

    // Execute deployment steps
    const steps = [
        closeSiYuan,
        cleanCache,
        removeOldPlugin,
        cleanDist,
        buildPlugin,
        deployPlugin,
        verifyDeployment,
    ];

    for (const step of steps) {
        if (!step()) {
            logError('\n❌ Deployment failed!');
            process.exit(1);
        }
    }

    // Success message
    log('\n' + '='.repeat(60), 'green');
    log('  ✓ Clean deployment completed successfully!', 'green');
    log('='.repeat(60) + '\n', 'green');

    if (autoStart) {
        startSiYuan();
    } else {
        log('Next steps:', 'yellow');
        log('  1. Start SiYuan', 'yellow');
        log('  2. Open the plugin settings to verify', 'yellow');
        log('  3. Check console (F12) for any errors\n', 'yellow');
    }
}

// Run main function
main();
