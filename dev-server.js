import fs from 'node:fs';
import path from 'node:path';

// .env.local 및 .env 로드
['.env.local', '.env'].forEach(f => {
  const p = path.resolve(f);
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    });
  }
});

import http from 'node:http';
import analyzeHandler from './api/analyze.js';

const PORT = 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = parsedUrl.pathname;

  // 1. API 요청 처리 (/api/analyze)
  if (pathname === '/api/analyze') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      let body = {};
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        if (rawBody) body = JSON.parse(rawBody);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: '유효하지 않은 JSON 본문입니다.' }));
      }

      req.body = body;

      const mockRes = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.headers['Content-Type'] = 'application/json; charset=utf-8';
          res.writeHead(this.statusCode, this.headers);
          res.end(JSON.stringify(data));
        }
      };

      try {
        await analyzeHandler(req, mockRes);
      } catch (err) {
        console.error('API Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 2. 정적 파일 서비스
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(process.cwd(), pathname);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('500 Internal Server Error');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('\n======================================================');
  console.log(`🚀 손금 분석 서버가 성공적으로 실행되었습니다!`);
  console.log(`👉 브라우저 주소: http://localhost:${PORT}`);
  console.log('======================================================\n');
});
