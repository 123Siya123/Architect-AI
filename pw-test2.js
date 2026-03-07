const { chromium } = require('playwright');

(async () => {
    console.log('Starting Playwright...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(`[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    page.on('pageerror', err => {
        console.log(`[PAGE ERROR] ${err.message}`);
    });

    try {
        console.log('Navigating...');
        await page.goto('http://localhost:3000/design', { waitUntil: 'networkidle', timeout: 30000 });
        console.log('Finished navigating, waiting 5 seconds...');
        await page.waitForTimeout(5000);
    } catch (e) {
        console.error('Test run failed:', e);
    } finally {
        await browser.close();
    }
})();
