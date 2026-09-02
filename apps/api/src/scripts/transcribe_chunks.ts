import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function main() {
  const filePath = 'C:\\Users\\Vaishnavi\\.gemini\\antigravity-ide\\brain\\87c58501-818c-4be2-aa53-1bb13c9ecb14\\recording.mp3';
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return;
  }

  const buf = fs.readFileSync(filePath);
  console.log('Total file size:', buf.length, 'bytes');

  // Split into 4 chunks (~39KB each)
  const numChunks = 4;
  const chunkSize = Math.floor(buf.length / numChunks);
  const apiKey = process.env.SARVAM_API_KEY;

  if (!apiKey) {
    console.error('SARVAM_API_KEY missing in .env');
    return;
  }

  const results: string[] = [];

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = i === numChunks - 1 ? buf.length : (i + 1) * chunkSize;
    const slice = buf.subarray(start, end);
    const chunkPath = `C:\\Users\\Vaishnavi\\.gemini\\antigravity-ide\\brain\\87c58501-818c-4be2-aa53-1bb13c9ecb14\\part_${i}.mp3`;
    fs.writeFileSync(chunkPath, slice);

    try {
      const blob = new Blob([slice]);
      const formData = new FormData();
      formData.append('file', blob, `part_${i}.mp3`);
      formData.append('model', 'saaras:v3');

      const res = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey },
        body: formData,
      });

      const data = await res.json() as any;
      console.log(`Part ${i + 1} response:`, JSON.stringify(data));
      if (data.transcript) {
        results.push(`Part ${i + 1}: ${data.transcript}`);
      }
    } catch (err: any) {
      console.error(`Part ${i + 1} error:`, err.message);
    }
  }

  console.log('\n=== FULL RECORDING TRANSCRIPT ===');
  console.log(results.join('\n'));
}

main().catch(console.error);
