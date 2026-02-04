/**
 * Playwright Full Flow Video Recording Script
 * Records a comprehensive navigation through ALL Nexus Sandbox screens
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'recordings');

// All routes to visit
const ROUTES = [
    { path: '/payment', name: 'Send Payment', wait: 3000 },
    { path: '/psp', name: 'PSP Dashboard', wait: 2500 },
    { path: '/fxp', name: 'FX Rates', wait: 2500 },
    { path: '/sap', name: 'Liquidity', wait: 2500 },
    { path: '/ips', name: 'IPS Dashboard', wait: 2500 },
    { path: '/pdo', name: 'PDO Dashboard', wait: 2500 },
    { path: '/explorer', name: 'Payments Explorer', wait: 2500 },
    { path: '/messages', name: 'Messages', wait: 2500 },
    { path: '/mesh', name: 'Network Mesh', wait: 2500 },
    { path: '/actors', name: 'Actors', wait: 2500 },
    { path: '/settings', name: 'Settings', wait: 2500 },
];

async function recordFullFlow() {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log('🎬 Starting FULL FLOW recording...');
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);
    console.log(`🌐 Base URL: ${BASE_URL}`);
    console.log(`📍 Routes to visit: ${ROUTES.length}\n`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        recordVideo: {
            dir: OUTPUT_DIR,
            size: { width: 1920, height: 1080 }
        }
    });
    const page = await context.newPage();

    try {
        // Visit each route
        for (let i = 0; i < ROUTES.length; i++) {
            const route = ROUTES[i];
            console.log(`📍 [${i + 1}/${ROUTES.length}] ${route.name} (${route.path})...`);

            await page.goto(BASE_URL + route.path, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(route.wait);
        }

        // Toggle theme twice to show both modes
        console.log('\n🌓 Toggling theme (dark → light → dark)...');
        const themeToggle = page.locator('button[title*="color scheme"]');
        if (await themeToggle.isVisible()) {
            await themeToggle.click();
            await page.waitForTimeout(2000);
            await themeToggle.click();
            await page.waitForTimeout(1500);
        }

        // Final view of payment page
        console.log('\n📍 Final: Back to Payment page...');
        await page.goto(BASE_URL + '/payment', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        console.log('\n✅ Recording complete!');

    } catch (error) {
        console.error(`❌ Error during recording: ${error.message}`);
    }

    // Close context to save video
    await context.close();
    await browser.close();

    // Rename video file
    const files = fs.readdirSync(OUTPUT_DIR);
    const webmFiles = files.filter(f => f.endsWith('.webm') && f !== 'full-flow.webm' && f !== 'happy-flow.webm');
    if (webmFiles.length > 0) {
        const latestFile = webmFiles.sort().pop();
        const oldPath = path.join(OUTPUT_DIR, latestFile);
        const newPath = path.join(OUTPUT_DIR, 'full-flow.webm');

        // Remove old full-flow.webm if exists
        if (fs.existsSync(newPath)) {
            fs.unlinkSync(newPath);
        }

        fs.renameSync(oldPath, newPath);
        console.log(`\n📹 Video saved to: ${newPath}`);
    }

    console.log('🎉 Full flow recording complete!');
}

recordFullFlow().catch(console.error);
