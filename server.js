const http = require('http');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.CFBD_API_KEY || '';
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/api-key') {
    if (!API_KEY) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'API key not configured' }));
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    return res.end(JSON.stringify({ key: API_KEY }));
  }

  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    const type =
      ext === '.css' ? 'text/css' :
      ext === '.js' ? 'text/javascript' :
      'text/html';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
