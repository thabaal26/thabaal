import fs from "fs";
import { execSync } from "child_process";
import path from "path";

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Customer Loyalty & Rewards Guide — Thabaal</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #10283B;
      background: #FFFFFF;
      font-size: 13px;
      line-height: 1.45;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 2px solid #FFC329;
      margin-bottom: 14px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: #10283B;
      letter-spacing: -0.5px;
    }
    .brand-subtitle {
      font-size: 12px;
      color: #5A6B7B;
      margin-top: 2px;
    }
    .header-badge {
      background: #FFF3D6;
      border: 1px solid #FFC329;
      color: #925700;
      font-weight: 700;
      font-size: 11px;
      padding: 5px 12px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Golden Rule Banner */
    .golden-banner {
      background: #FFF9F0;
      border: 1.5px solid #EADFCB;
      border-radius: 14px;
      padding: 12px 16px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
      text-align: center;
    }
    .golden-col {
      padding: 4px;
    }
    .golden-col:not(:last-child) {
      border-right: 1px dashed #E0D3BC;
    }
    .golden-label {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      color: #6C7A87;
      letter-spacing: 0.4px;
    }
    .golden-val {
      font-size: 18px;
      font-weight: 800;
      color: #10283B;
      margin-top: 3px;
    }
    .golden-sub {
      font-size: 10.5px;
      color: #16845B;
      font-weight: 600;
      margin-top: 1px;
    }

    /* Section Styling */
    .section-title {
      font-size: 14px;
      font-weight: 800;
      color: #10283B;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title .bullet {
      width: 7px;
      height: 7px;
      background: #FFC329;
      border-radius: 50%;
      display: inline-block;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid #EADFCB;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 15px;
    }
    th {
      background: #FBF7F0;
      color: #475867;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #EADFCB;
    }
    td {
      padding: 9px 12px;
      font-size: 12px;
      border-bottom: 1px solid #F0E6D5;
      vertical-align: middle;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:nth-child(even) td {
      background: #FAFAFA;
    }

    /* Tier Badges */
    .tier-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: 8px;
      font-weight: 800;
      font-size: 11px;
      letter-spacing: 0.3px;
    }
    .tier-silver {
      background: #E8ECEF;
      color: #384551;
      border: 1px solid #CBD5E1;
    }
    .tier-gold {
      background: #FEF3C7;
      color: #92400E;
      border: 1px solid #FCD34D;
    }
    .tier-platinum {
      background: #EDE9FE;
      color: #5B21B6;
      border: 1px solid #DDD6FE;
    }

    /* Example Card */
    .example-card {
      background: #F0FDF4;
      border: 1.5px solid #BBF7D0;
      border-radius: 14px;
      padding: 13px 16px;
      margin-bottom: 15px;
    }
    .example-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }
    .example-title {
      font-weight: 800;
      font-size: 13px;
      color: #166534;
    }
    .example-tag {
      background: #DCFCE7;
      color: #15803D;
      font-weight: 700;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
    }
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      background: #FFFFFF;
      padding: 10px;
      border-radius: 10px;
      border: 1px solid #DCFCE7;
      margin-bottom: 8px;
      text-align: center;
    }
    .step-item b {
      display: block;
      font-size: 15px;
      color: #10283B;
      margin-top: 2px;
    }
    .step-item span {
      font-size: 10.5px;
      color: #64748B;
      font-weight: 600;
    }
    .example-conclusion {
      font-size: 11.5px;
      color: #1E293B;
      line-height: 1.4;
      margin-top: 6px;
    }

    /* Rules Grid */
    .rules-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .rule-box {
      border: 1px solid #EADFCB;
      border-radius: 12px;
      padding: 10px 14px;
      background: #FFFFFF;
    }
    .rule-box.safe {
      border-left: 4px solid #16845B;
    }
    .rule-box.guard {
      border-left: 4px solid #DC2626;
    }
    .rule-title {
      font-size: 11.5px;
      font-weight: 800;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .rule-title.safe-title { color: #16845B; }
    .rule-title.guard-title { color: #DC2626; }
    .rule-box ul {
      list-style-type: disc;
      padding-left: 16px;
      font-size: 11px;
      color: #475569;
      line-height: 1.4;
    }

    /* Footer */
    .footer {
      border-top: 1px solid #EADFCB;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5px;
      color: #8899A6;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-title">Thabaal Customer Loyalty & Rewards System</div>
      <div class="brand-subtitle">Simple, Transparent Loyalty Program for WhatsApp Commerce & Retail Customers</div>
    </div>
    <div class="header-badge">Store Owner Guide</div>
  </div>

  <!-- 4-Pillar Summary Banner -->
  <div class="golden-banner">
    <div class="golden-col">
      <div class="golden-label">Earning Rate</div>
      <div class="golden-val">1 pt / ₹10</div>
      <div class="golden-sub">Spend ₹100 = 10 pts</div>
    </div>
    <div class="golden-col">
      <div class="golden-label">Point Cash Value</div>
      <div class="golden-val">100 pts = ₹50</div>
      <div class="golden-sub">1 point = ₹0.50 cash</div>
    </div>
    <div class="golden-col">
      <div class="golden-label">Redemption Steps</div>
      <div class="golden-val">₹25 Steps</div>
      <div class="golden-sub">Starts at 50 points</div>
    </div>
    <div class="golden-col">
      <div class="golden-label">Single Order Cap</div>
      <div class="golden-val">Max ₹250 Off</div>
      <div class="golden-sub">Protects profit margin</div>
    </div>
  </div>

  <!-- Section 1: How Points Are Earned -->
  <div class="section-title"><span class="bullet"></span> 1. How Customers Earn Points</div>
  <table>
    <thead>
      <tr>
        <th style="width: 28%;">Source</th>
        <th style="width: 25%;">Points Given</th>
        <th>Real-Life Example & Benefit</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><b>Purchase Spend</b></td>
        <td><b style="color: #10283B;">1 pt for every ₹10</b></td>
        <td>Customer buys a 5L oil can worth ₹1,200 $\rightarrow$ automatically earns <b>120 points</b> (₹60 value).</td>
      </tr>
      <tr>
        <td><b>Repeat Order Bonus</b></td>
        <td><b style="color: #16845B;">+50 points</b> / order</td>
        <td>Given on every order after the 1st. Nudges customers to order again instead of choosing rivals.</td>
      </tr>
      <tr>
        <td><b>Past Google Sheet Orders</b></td>
        <td><b style="color: #0284C7;">+35 points</b> / item</td>
        <td>Past offline/sheet buyers imported into Thabaal immediately start with loyalty credit.</td>
      </tr>
      <tr>
        <td><b>Store Manager Bonus</b></td>
        <td><b>+50, +100, +200 pts</b></td>
        <td>Manager can reward points manually in 1-click for festive wishes, Google reviews, or VIP relations.</td>
      </tr>
    </tbody>
  </table>

  <!-- Section 2: VIP Customer Tiers -->
  <div class="section-title"><span class="bullet"></span> 2. VIP Customer Tiers (Easy Automatic Level-Up)</div>
  <p style="font-size: 11.5px; color: #5A6B7B; margin-bottom: 8px;">
    A customer qualifies for the next VIP tier as soon as they meet <b>ANY ONE</b> of the 3 conditions (Points, Orders, or Total ₹ Spent):
  </p>
  <table>
    <thead>
      <tr>
        <th style="width: 22%;">VIP Tier</th>
        <th style="width: 22%;">Points Needed</th>
        <th style="width: 24%;">Total Orders</th>
        <th>Total Amount Spent</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><span class="tier-badge tier-silver">🥈 Silver</span></td>
        <td><b>100 points</b></td>
        <td><b>1 order</b></td>
        <td>Any amount (active buyer)</td>
      </tr>
      <tr>
        <td><span class="tier-badge tier-gold">🥇 Gold</span></td>
        <td><b>250 points</b></td>
        <td><b>2 orders</b></td>
        <td><b>₹1,500</b> total spent</td>
      </tr>
      <tr>
        <td><span class="tier-badge tier-platinum">💎 Platinum</span></td>
        <td><b>500 points</b></td>
        <td><b>4 orders</b></td>
        <td><b>₹3,000</b> total spent</td>
      </tr>
    </tbody>
  </table>

  <!-- Section 3: Walkthrough Example -->
  <div class="example-card">
    <div class="example-header">
      <span class="example-title">💡 Concrete Walkthrough Example (3 Orders totaling ₹1,250)</span>
      <span class="example-tag">Customer Journey</span>
    </div>
    <div class="steps-grid">
      <div class="step-item">
        <span>Order Spend (₹1,250)</span>
        <b>125 pts</b>
      </div>
      <div class="step-item">
        <span>Repeat Bonus (2 × 50)</span>
        <b style="color: #16845B;">+100 pts</b>
      </div>
      <div class="step-item">
        <span>Total Accumulated</span>
        <b style="color: #10283B;">225 pts</b>
      </div>
      <div class="step-item">
        <span>Rupee Cash Value</span>
        <b style="color: #B45309;">₹112.50</b>
      </div>
    </div>
    <div class="example-conclusion">
      • <b>Instant Redemption</b>: Since redemption happens in ₹25 steps (₹25, ₹50, ₹75, ₹100), the customer can redeem <b>₹100 OFF</b> right away using 200 points. The remaining 25 points stay in their account.<br>
      • <b>Automatic Gold VIP</b>: Since they completed 3 orders (more than the 2 required), they are automatically promoted to <b>Gold Tier</b>!
    </div>
  </div>

  <!-- Section 4: Rules & Safeguards -->
  <div class="section-title"><span class="bullet"></span> 3. Store Rules & Profit Safeguards</div>
  <div class="rules-grid">
    <div class="rule-box safe">
      <div class="rule-title safe-title">✓ Customer-Friendly Benefits</div>
      <ul>
        <li><b>Points Never Expire</b>: Customers never feel rushed or lose their hard-earned points.</li>
        <li><b>Redeem from 50 Points</b>: Quick first reward (₹25 off) motivates customers on order #2.</li>
        <li><b>WhatsApp 1-Click Offers</b>: The portal generates direct 1-click personal discount links.</li>
      </ul>
    </div>
    <div class="rule-box guard">
      <div class="rule-title guard-title">✕ Store Protection Rules</div>
      <ul>
        <li><b>No Fake Points</b>: No points for unconfirmed orders, cancelled orders, or abandoned carts.</li>
        <li><b>Max ₹250 Discount Cap</b>: Protects margins so large orders cannot be excessively discounted.</li>
        <li><b>Only Paid/Confirmed Orders</b>: Points are credited only when an order is confirmed or paid.</li>
      </ul>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>Platform: <b>Thabaal</b> · WhatsApp Commerce, CRM & Loyalty</span>
    <span>Document: Client Loyalty Architecture Guide · Confidential</span>
  </div>

</body>
</html>
`;

const htmlPath = path.join(process.cwd(), "public", "docs", "loyalty-guide.html");
const pdfPath = path.join(process.cwd(), "public", "docs", "Thabaal_Loyalty_Rewards_Guide.pdf");
const rootPdfPath = path.join(process.cwd(), "..", "Thabaal_Loyalty_Rewards_Guide.pdf");

fs.writeFileSync(htmlPath, htmlContent, "utf8");
console.log("HTML written to:", htmlPath);

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

console.log("Rendering PDF with Chrome headless...");
const cmd = `"${chromePath}" --headless --disable-gpu --run-all-compositor-stages-before-draw --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${htmlPath}"`;
execSync(cmd);

// Also copy to project root for instant access
fs.copyFileSync(pdfPath, rootPdfPath);

console.log("✅ PDF Generated successfully at:");
console.log("1. " + pdfPath);
console.log("2. " + rootPdfPath);
