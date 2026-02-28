const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    await page.goto('http://localhost:3001/design', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));

    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const planBtn = buttons.find(b => b.textContent && b.textContent.includes('Plan'));
        if (planBtn) planBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'plan_view.png' });

    await browser.close();
    console.log('Saved plan_view.png');
})();
