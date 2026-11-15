const { chromium } = require(process.env.PW_CORE ?? 'C:/Users/step1/pwtmp/node_modules/playwright-core');
const path = require('path');

async function main() {
  const url = process.argv[2] || 'https://rzp.io/rzp/piS1IVW';
  console.log(`Automating Razorpay Checkout: ${url}`);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Title:', await page.title());

    await page.click('button:has-text("Start Subscription")');
    await page.waitForTimeout(3000);

    const checkoutFrame = page.frames().find((f) => f.url().includes('checkout/public'));
    if (!checkoutFrame) {
      console.error('Checkout frame not found!');
      return;
    }

    // Inspect inputs in frame
    const inputs = await checkoutFrame.$$eval('input', (els) =>
      els.map((e) => ({ type: e.type, name: e.name, placeholder: e.placeholder, id: e.id }))
    );
    console.log('Inputs found in contact modal:', JSON.stringify(inputs, null, 2));

    // Fill phone
    const phoneInput = await checkoutFrame.$('input[type="tel"], input[name="contact"], input[placeholder*="mobile" i], input[placeholder*="phone" i]');
    if (phoneInput) {
      console.log('Filling phone: 9876543210');
      await phoneInput.fill('9876543210');
    }

    // Fill email
    const emailInput = await checkoutFrame.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    if (emailInput) {
      console.log('Filling email: qa_test@thabaal.in');
      await emailInput.fill('qa_test@thabaal.in');
    }

    await page.waitForTimeout(1000);
    console.log('Clicking Continue button...');
    await checkoutFrame.click('button:has-text("Continue")');
    await page.waitForTimeout(4000);

    const sOptions = path.join(__dirname, '..', 'tests', 'qa', 'screenshots', '02-payment-methods-unlocked.png');
    await page.screenshot({ path: sOptions, fullPage: true });
    console.log('Screenshot of unlocked payment methods saved:', sOptions);

    const textAfterContact = await checkoutFrame.innerText('body');
    console.log('\n--- BODY AFTER CONTACT SUBMISSION ---');
    console.log(textAfterContact.replace(/\s+/g, ' ').slice(0, 500));

    // Look for Cards or UPI or EMandate
    const cardOption = await checkoutFrame.$('button:has-text("Cards"), div:has-text("Cards"), [role="button"]:has-text("Cards")');
    const upiOption = await checkoutFrame.$('button:has-text("UPI"), div:has-text("UPI"), [role="button"]:has-text("UPI")');
    const emandateOption = await checkoutFrame.$('button:has-text("EMandate"), div:has-text("EMandate"), [role="button"]:has-text("EMandate")');

    console.log('UPI option present:', !!upiOption);
    console.log('Card option present:', !!cardOption);
    console.log('EMandate option present:', !!emandateOption);

    if (upiOption) {
      console.log('Clicking UPI option...');
      await upiOption.click();
      await page.waitForTimeout(3000);

      const sUpi = path.join(__dirname, '..', 'tests', 'qa', 'screenshots', '03-upi-selected.png');
      await page.screenshot({ path: sUpi, fullPage: true });
      console.log('Screenshot saved:', sUpi);

      const upiText = await checkoutFrame.innerText('body');
      console.log('\n--- BODY IN UPI SCREEN ---');
      console.log(upiText.replace(/\s+/g, ' ').slice(0, 500));
    }
  } catch (err) {
    console.error('Error during automation:', err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
