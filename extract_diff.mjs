import fs from 'fs';
const logs = fs.readFileSync('C:\\Users\\Gesta\\.gemini\\antigravity-ide\\brain\\89f97b7b-47f3-49f2-bf9d-e42e3f88bc98\\.system_generated\\logs\\transcript.jsonl', 'utf8').split('\n').filter(Boolean);

let found = false;
for (const line of logs) {
  try {
     const data = JSON.parse(line);
     if (data.tool_calls) {
        for (const tc of data.tool_calls) {
           if (tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
              const argStr = JSON.stringify(tc.args);
              if (argStr.includes('Riwayat Kelas (Enrollment)')) {
                 let contentStr = '';
                 if (tc.name === 'replace_file_content') {
                     contentStr = tc.args.ReplacementContent;
                 } else {
                     contentStr = tc.args.ReplacementChunks[0].ReplacementContent;
                 }
                 fs.writeFileSync('restored_riwayat.jsx', contentStr);
                 console.log('Saved to restored_riwayat.jsx!');
                 found = true;
              }
           }
        }
     }
  } catch(e) {}
}

if (!found) console.log('Not found');
