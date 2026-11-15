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

  // Fill valid contact
  await frame.locator('[data-testid="contactNumber"]').fill('9443123456');
  await frame.locator('[data-testid="email-container"] input').fill('support@thabaal.in');
  await frame.locator('button:has-text("Continue")').click();
  await page.waitForTimeout(3000);

  // Click UPI on the left menu
  console.log('Clicking UPI option...');
  await frame.locator('text="UPI"').first().click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'whatsapp-portal/tests/qa/screenshots/08-upi-menu-opened.png', fullPage: true });

  const text = await frame.innerText('body');
  console.log('--- Body in UPI menu ---');
  console.log(text.replace(/\s+/g, ' ').slice(0, 600));

  await browser.close();
}

main().catch(console.error);
