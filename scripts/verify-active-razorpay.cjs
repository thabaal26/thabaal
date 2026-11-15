require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const secret = process.env.RAZORPAY_KEY_SECRET?.trim();

console.log('Active RAZORPAY_KEY_ID:', keyId ? keyId.substring(0, 8) + '...' : 'UNDEFINED (Clean)');
console.log('Active RAZORPAY_KEY_SECRET:', secret ? 'DEFINED' : 'UNDEFINED (Clean)');
if (keyId) {
  console.log('Mode:', keyId.startsWith('rzp_live_') ? 'LIVE' : 'TEST');
} else {
  console.log('Razorpay Status: No test key is active. Project is 100% clean and isolated from Test API.');
}
