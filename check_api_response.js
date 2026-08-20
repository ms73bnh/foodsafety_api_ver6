const http = require('http');

http.get('http://localhost:3000/api/alerts', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("RECALLS:", JSON.stringify(parsed.recalls.rows.slice(0,2), null, 2));
    } catch(e) {
      console.log(data);
    }
  });
}).on('error', console.error);
