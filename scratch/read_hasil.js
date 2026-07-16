import fs from 'fs';

const buf = fs.readFileSync('hasil.json');
console.log("Buffer length:", buf.length);
console.log("First 20 bytes:", buf.slice(0, 20));

// Try UTF-16LE decoding
let text = buf.toString('utf16le');
if (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) {
  text = text.slice(1);
}
console.log("As UTF-16LE snippet:");
console.log(text.slice(0, 500));

// Try UTF-8 decoding
let text8 = buf.toString('utf8');
if (text8.charCodeAt(0) === 0xFEFF || text8.charCodeAt(0) === 0xFFFE) {
  text8 = text8.slice(1);
}
console.log("As UTF-8 snippet:");
console.log(text8.slice(0, 500));
