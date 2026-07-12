const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 5185;
const root = __dirname;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  let filePath = path.join(root, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(port, '0.0.0.0', () => {
  console.log(`Serving on http://0.0.0.0:${port}`);
});
