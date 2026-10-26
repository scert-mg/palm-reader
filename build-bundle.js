import fs from 'node:fs';

const files = ['js/db.js', 'js/storage.js', 'js/image-processor.js', 'js/error-handler.js', 'app.js'];
let combined = '';

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  // import 구문 제거
  content = content.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
  // export 키워드 제거
  content = content.replace(/export\s+(async\s+function|function|const|let|class)/g, '$1');
  content = content.replace(/export\s*\{[^}]*\};?/g, '');
  combined += `\n/* --- ${f} --- */\n` + content;
}

fs.writeFileSync('bundle.js', combined, 'utf8');
console.log('bundle.js 생성 완료! 크기:', combined.length);
