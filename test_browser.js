const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Catch console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

    console.log('Navigating to http://localhost:3001/design...');
    await page.goto('http://localhost:3001/design', { waitUntil: 'networkidle2' });

    console.log('Wait 2s for 3D load...');
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking "Plan" View...');
    // Find the button with text Plan
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const planBtn = buttons.find(b => b.textContent && b.textContent.includes('Plan'));
        if (planBtn) planBtn.click();
    });

    console.log('Wait 2s after click...');
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking "All Floors" View...');
    // Find the floor selector buttons
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const allBtn = buttons.find(b => b.textContent && b.textContent.includes('All'));
        if (allBtn) allBtn.click();
    });

    console.log('Wait 2s after second click...');
    await new Promise(r => setTimeout(r, 2000));

    console.log('Done.');
    await browser.close();
})();
