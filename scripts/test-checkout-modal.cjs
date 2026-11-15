const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_CORE ?? 'C:/Users/step1/pwtmp/node_modules/playwright-core');

const subId = process.argv[2] || 'sub_U03xpNFHY9Fmlj';
const keyId = 'rzp_test_U03tWj5UcrFCNo';

const html = `<!DOCTYPE html>
<html>
<head>
  <title>Razorpay Checkout Simulation</title>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body style="font-family: sans-serif; padding: 40px; text-align: center;">
  <h2>Thabaal Subscription Checkout Simulation</h2>
  <button id="pay-btn" style="padding: 12px 24px; font-size: 16px;">Pay with Razorpay</button>
  <div id="status" style="margin-top: 20px;"></div>

  <script>
    document.getElementById('pay-btn').onclick = function() {
      var options = {
        key: '${keyId}',
        subscription_id: '${subId}',
        name: 'Thabaal',
        description: 'THABAAL_AUTOPAY_CANCELLATION_QA_1_RUPEE',
        prefill: {
          name: 'Thabaal QA',
          email: 'qa_tester@thabaal.in',
          contact: '9876543210'
        },
        theme: { color: '#0d1b2a' },
        handler: function(response) {
          document.getElementById('status').innerText = 'SUCCESS: ' + JSON.stringify(response);
          window.__razorpay_response = response;
        }
      };
      var rzp = new Razorpay(options);
      rzp.open();
    };
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(54322, async () => {
  console.log('Test checkout server listening on http://localhost:54322');
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await page.goto('http://localhost:54322', { waitUntil: 'networkidle' });
    await page.click('#pay-btn');
    await page.waitForTimeout(4000);

    const checkoutFrame = page.frames().find(f => f.url().includes('checkout/public'));
    if (!checkoutFrame) {
      console.error('Checkout frame not found!');
      return;
    }

    console.log('Clicking Cards option...');
    const cardOption = await checkoutFrame.$('div:has-text("Cards"), [role="button"]:has-text("Cards")');
    if (cardOption) {
      await cardOption.click();
      await page.waitForTimeout(3000);

      const sCards = path.join(__dirname, '..', 'tests', 'qa', 'screenshots', '05-card-option-opened.png');
      await page.screenshot({ path: sCards, fullPage: true });
      console.log('Cards screen screenshot saved:', sCards);

      const cardInputs = await checkoutFrame.$$eval('input', els => els.map(e => ({ name: e.name, placeholder: e.placeholder, type: e.type })));
      console.log('Inputs on Cards screen:', cardInputs);
    } else {
      console.log('Cards option element not clickable directly, inspecting clickable items...');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
    server.close();
  }
});
