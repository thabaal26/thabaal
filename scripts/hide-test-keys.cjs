const fs = require('fs');
let content = fs.readFileSync('.env.local', 'utf8');

// Comment out the test keys so they are safely preserved/hidden but NOT active
content = content.replace(/^RAZORPAY_KEY_ID=/m, '# [ARCHIVED_TEST_KEY_HIDDEN] RAZORPAY_KEY_ID=');
content = content.replace(/^RAZORPAY_KEY_SECRET=/m, '# [ARCHIVED_TEST_SECRET_HIDDEN] RAZORPAY_KEY_SECRET=');
content = content.replace(/^RAZORPAY_MODE=/m, '# [ARCHIVED_TEST_MODE_HIDDEN] RAZORPAY_MODE=');

fs.writeFileSync('.env.local', content, 'utf8');
console.log('Successfully updated .env.local - test keys are commented out and hidden.');
