const puppeteer = require('puppeteer');

(async () => {
    console.log('Starting puppeteer...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
            console.log('PAGE ERROR LOG:', msg.text());
        }
    });
    page.on('pageerror', err => {
        errors.push(err.toString());
        console.log('PAGE ERROR:', err.toString());
    });

    console.log('Navigating...');
    await page.goto('http://localhost:3001/design', { waitUntil: 'load' });

    console.log('Waiting for typical load...');
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking Plan...');
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const planBtn = buttons.find(b => b.textContent && b.textContent.includes('Plan'));
        if (planBtn) planBtn.click();
    });

    console.log('Waiting 1s...');
    await new Promise(r => setTimeout(r, 1000));

    console.log('Finished. Total Errors:', errors.length);
    await browser.close();
    process.exit(errors.length > 0 ? 1 : 0);
})();
