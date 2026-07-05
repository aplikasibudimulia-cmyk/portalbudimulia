import fs from 'fs';

try {
  let content = fs.readFileSync('hasil.json', 'utf8');
  // strip BOM if it exists
  if (content.charCodeAt(0) === 0xFEFF || content.charCodeAt(0) === 0xFFFE) {
    content = content.slice(1);
  }
  
  // Also try utf16le if utf8 doesn't work well
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    console.log("Failed parsing as UTF-8, trying UTF-16LE...");
    let content16 = fs.readFileSync('hasil.json', 'utf16le');
    if (content16.charCodeAt(0) === 0xFEFF || content16.charCodeAt(0) === 0xFFFE) {
      content16 = content16.slice(1);
    }
    data = JSON.parse(content16);
  }

  console.log("JSON root is array?", Array.isArray(data));
  console.log("Length/Keys:", Array.isArray(data) ? data.length : Object.keys(data));
  
  const jsonStr = JSON.stringify(data);
  const regex = /jason/i;
  const match = jsonStr.match(regex);
  console.log("Does 'jason' exist in hasil.json?", !!match);
  
  if (match) {
    if (Array.isArray(data)) {
      const results = data.filter(item => {
        const itemStr = JSON.stringify(item).toLowerCase();
        return itemStr.includes('jason');
      });
      console.log("Filtered items:", JSON.stringify(results, null, 2));
    } else {
      for (const [k, v] of Object.entries(data)) {
        if (k.toLowerCase().includes('jason') || JSON.stringify(v).toLowerCase().includes('jason')) {
          console.log(`Key matching: ${k}`, JSON.stringify(v, null, 2));
        }
      }
    }
  }
} catch (e) {
  console.error("Error reading/parsing hasil.json:", e);
}
