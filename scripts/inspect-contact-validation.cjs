const { chromium } = require(process.env.PW_CORE ?? 'C:/Users/step1/pwtmp/node_modules/playwright-core');

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto('https://rzp.io/rzp/piS1IVW', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Start Subscription")');
  await page.waitForTimeout(3000);
  const frame = page.frames().find(f => f.url().includes('checkout/public'));

  // Inspect the country code button
  const countryBtn = await frame.$('button:has-text("+91")');
  console.log('Country button text:', countryBtn ? await countryBtn.innerText() : 'Not found');

  // Let's see what happens if we type different numbers: e.g. 9123456789, or 10 digits
  const contactLoc = frame.locator('[data-testid="contactNumber"]');
  await contactLoc.click();
  await contactLoc.type('9123456789');

  await page.waitForTimeout(1000);
  const errEl = await frame.$('[id*="error_contact"], [data-testid*="error"]');
  if (errEl) {
    console.log('Error element text:', await errEl.innerText());
  }

  // Also inspect what the input value is
  const val = await contactLoc.inputValue();
  console.log('Input value:', val);

  await browser.close();
}

main().catch(console.error);
