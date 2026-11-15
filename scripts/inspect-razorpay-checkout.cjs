const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const path = require('path');

async function main() {
  const url = process.argv[2] || 'https://rzp.io/rzp/piS1IVW';
  console.log(`Opening Razorpay Checkout: ${url}`);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Title:', await page.title());

    // Click "Start Subscription" button
    console.log('Clicking "Start Subscription" button...');
    await page.click('button:has-text("Start Subscription")');

    // Wait 5 seconds for Razorpay modal / iframe to appear
    await page.waitForTimeout(5000);

    const screenshotPath = path.join(__dirname, '..', 'tests', 'qa', 'screenshots', '01-razorpay-checkout-modal-opened.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    // List all frames
    const frames = page.frames();
    console.log(`Total frames: ${frames.length}`);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      console.log(`Frame ${i}: ${f.url()}`);
      try {
        const text = await f.innerText('body');
        if (text && text.length > 0) {
          console.log(`Frame ${i} text snippet:`, text.slice(0, 300).replace(/\n+/g, ' '));
        }
      } catch {}
    }
  } catch (err) {
    console.error('Error during checkout interaction:', err);
  } finally {
    await browser.close();
  }
}

main();
