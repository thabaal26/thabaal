const { chromium } = require(process.env.PW_CORE ?? 'C:/Users/step1/pwtmp/node_modules/playwright-core');

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('https://rzp.io/rzp/piS1IVW', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Start Subscription")');
  await page.waitForTimeout(3000);
  const frame = page.frames().find(f => f.url().includes('checkout/public'));

  await frame.locator('[data-testid="contactNumber"]').fill('9443123456');
  await frame.locator('[data-testid="email-container"] input').fill('support@thabaal.in');
  await frame.locator('button:has-text("Continue")').click();
  await page.waitForTimeout(3000);

  // Click Show QR
  const showQrBtn = await frame.$('button:has-text("Show QR")');
  if (showQrBtn) {
    console.log('Clicking Show QR button...');
    await showQrBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'whatsapp-portal/tests/qa/screenshots/09-show-qr-clicked.png', fullPage: true });
    console.log('Show QR screenshot saved');
  }

  // Click Cards
  console.log('Clicking Cards option...');
  const cardOption = await frame.$('text="Cards"');
  if (cardOption) {
    await cardOption.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'whatsapp-portal/tests/qa/screenshots/10-cards-clicked.png', fullPage: true });
    console.log('Cards screenshot saved');
  }

  await browser.close();
}

main().catch(console.error);
