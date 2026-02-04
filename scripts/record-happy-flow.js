/**
 * Playwright Happy Flow Video Recording Script
 * Records a complete payment flow through the Nexus Sandbox
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'recordings');

async function recordHappyFlow() {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log('🎬 Starting happy flow recording...');
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);

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
        // Step 1: Navigate to Payment page
        console.log('📍 Step 1: Navigate to Payment page...');
        await page.goto(BASE_URL + '/payment', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Step 2: Show the navigation briefly
        console.log('📍 Step 2: Tour the navigation...');
        const navItems = ['/psp', '/fxp', '/sap', '/ips', '/pdo'];
        for (const navPath of navItems) {
            await page.goto(BASE_URL + navPath, { waitUntil: 'networkidle' });
            await page.waitForTimeout(1500);
        }

        // Step 3: Back to Payment page for the main flow
        console.log('📍 Step 3: Return to Payment page...');
        await page.goto(BASE_URL + '/payment', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);

        // Step 4: Navigate to Payments Explorer
        console.log('📍 Step 4: Navigate to Payments Explorer...');
        await page.goto(BASE_URL + '/explorer', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Step 5: Navigate to Messages
        console.log('📍 Step 5: Navigate to Messages...');
        await page.goto(BASE_URL + '/messages', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Step 6: Navigate to Actors
        console.log('📍 Step 6: Navigate to Actors...');
        await page.goto(BASE_URL + '/actors', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Step 7: Navigate to Network Mesh
        console.log('📍 Step 7: Navigate to Network Mesh...');
        await page.goto(BASE_URL + '/mesh', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Step 8: Toggle dark/light theme
        console.log('📍 Step 8: Toggle dark/light theme...');
        const themeToggle = page.locator('button[title*="color scheme"]');
        if (await themeToggle.isVisible()) {
            await themeToggle.click();
            await page.waitForTimeout(1500);
            await themeToggle.click();
            await page.waitForTimeout(1000);
        }

        // Step 9: Navigate to Settings
        console.log('📍 Step 9: Navigate to Settings...');
        await page.goto(BASE_URL + '/settings', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Step 10: Final view of Payment page
        console.log('📍 Step 10: Final view of Payment page...');
        await page.goto(BASE_URL + '/payment', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        console.log('✅ Recording complete!');

    } catch (error) {
        console.error(`❌ Error during recording: ${error.message}`);
    }

    // Close context to save video
    await context.close();
    await browser.close();

    // Rename video file
    const files = fs.readdirSync(OUTPUT_DIR);
    const webmFile = files.find(f => f.endsWith('.webm'));
    if (webmFile) {
        const oldPath = path.join(OUTPUT_DIR, webmFile);
        const newPath = path.join(OUTPUT_DIR, 'happy-flow.webm');
        fs.renameSync(oldPath, newPath);
        console.log(`📹 Video saved to: ${newPath}`);
    }

    console.log('🎉 Happy flow recording complete!');
}

recordHappyFlow().catch(console.error);
