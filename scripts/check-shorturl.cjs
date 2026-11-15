const https = require('https');

https.get('https://rzp.io/rzp/HJ7389H', res => {
  console.log('Status:', res.statusCode);
  console.log('Location:', res.headers.location);
});
