import 'dotenv/config';

async function main() {
  const accountSid = process.env.EXOTEL_ACCOUNT_SID;
  const apiKey = process.env.EXOTEL_API_KEY;
  const apiToken = process.env.EXOTEL_API_TOKEN;

  // Let's test checking call SID 10fdf79afd90f15f1cab069558a31a91
  const callSid = process.argv[2] || '10fdf79afd90f15f1cab069558a31a91';
  const url = `https://api.exotel.com/v1/Accounts/${accountSid}/Calls/${callSid}.json`;
  const auth = Buffer.from(`${apiKey}:${apiToken}`).toString('base64');

  console.log(`🔍 Checking Call SID Details: ${callSid}`);
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` }
  });

  console.log('HTTP Status:', res.status);
  const json = await res.json() as any;
  console.log('EXOTEL CALL DETAILS:', JSON.stringify(json, null, 2));
}

main();
