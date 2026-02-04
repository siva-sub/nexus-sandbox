/**
 * Playwright Screenshot Capture Script
 * Captures all Nexus Sandbox dashboard screens
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');

const SCREENS = [
    { path: '/payment', name: 'payment', description: 'Send Payment' },
    { path: '/psp', name: 'psp', description: 'PSP Dashboard' },
    { path: '/fxp', name: 'fxp', description: 'FX Rates (FXP)' },
    { path: '/sap', name: 'sap', description: 'Liquidity (SAP)' },
    { path: '/ips', name: 'ips', description: 'IPS Dashboard' },
    { path: '/pdo', name: 'pdo', description: 'PDO Dashboard' },
    { path: '/explorer', name: 'explorer', description: 'Payments Explorer' },
    { path: '/messages', name: 'messages', description: 'Messages' },
    { path: '/mesh', name: 'mesh', description: 'Network Mesh' },
    { path: '/actors', name: 'actors', description: 'Actors' },
    { path: '/settings', name: 'settings', description: 'Settings' },
];

async function captureScreenshots() {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log('🚀 Starting screenshot capture...');
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,  // Retina quality
    });
    const page = await context.newPage();

    // Capture each screen
    for (const screen of SCREENS) {
        const url = BASE_URL + screen.path;
        console.log(`📸 Capturing ${screen.description} (${screen.path})...`);

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(1000); // Let animations settle

            const screenshotPath = path.join(OUTPUT_DIR, `${screen.name}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`   ✅ Saved: ${screen.name}.png`);
        } catch (error) {
            console.error(`   ❌ Failed: ${error.message}`);
        }
    }

    // Also capture mobile viewport for navbar testing
    console.log('\n📱 Capturing mobile viewport (Payment page)...');
    await context.close();
    const mobileContext = await browser.newContext({
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
    });
    const mobilePage = await mobileContext.newPage();

    try {
        await mobilePage.goto(BASE_URL + '/payment', { waitUntil: 'networkidle' });
        await mobilePage.waitForTimeout(1000);
        await mobilePage.screenshot({ path: path.join(OUTPUT_DIR, 'payment-mobile.png'), fullPage: true });
        console.log('   ✅ Saved: payment-mobile.png');

        // Open hamburger menu and capture
        const burger = await mobilePage.locator('button[class*="Burger"]');
        if (await burger.isVisible()) {
            await burger.click();
            await mobilePage.waitForTimeout(500);
            await mobilePage.screenshot({ path: path.join(OUTPUT_DIR, 'payment-mobile-menu.png'), fullPage: true });
            console.log('   ✅ Saved: payment-mobile-menu.png');
        }
    } catch (error) {
        console.error(`   ❌ Mobile capture failed: ${error.message}`);
    }

    await browser.close();
    console.log('\n🎉 Screenshot capture complete!');
    console.log(`📁 Screenshots saved to: ${OUTPUT_DIR}`);
}

captureScreenshots().catch(console.error);
