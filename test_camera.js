const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.goto('http://localhost:3001/design', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));

    // Inject a global reference to the scene from within React Three Fiber if possible.
    // Since R3F hides the scene, we can just check the canvas size and background color briefly.

    console.log('Clicking Plan...');
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const planBtn = buttons.find(b => b.textContent && b.textContent.includes('Plan'));
        if (planBtn) planBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));

    const camData = await page.evaluate(() => {
        try {
            const canvas = document.querySelector('canvas');
            if (!canvas) return 'No canvas found';

            return {
                width: canvas.clientWidth,
                height: canvas.clientHeight,
                style: canvas.style.cssText
            };
        } catch (e) {
            return e.toString();
        }
    });

    console.log('Canvas Data:', camData);
    await browser.close();
})();
