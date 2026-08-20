const http = require('http');

http.get('http://127.0.0.1:3000/api/alerts', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(body.substring(0, 1000)));
}).on('error', console.error);
