const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
            console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
        }
    });

    page.on('pageerror', err => {
        console.log(`[BROWSER UNCAUGHT EXCEPTION] ${err.message}`);
    });

    try {
        console.log('Navigating to http://localhost:3000/design...');
        await page.goto('http://localhost:3000/design', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('Waiting for 5 seconds to capture runtime errors...');
        await page.waitForTimeout(5000);
        console.log('Done.');
    } catch (e) {
        console.error('Navigation failed:', e.message);
    } finally {
        await browser.close();
    }
})();
