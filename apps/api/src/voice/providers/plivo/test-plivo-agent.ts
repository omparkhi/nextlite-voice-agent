import 'dotenv/config';
import WebSocket from 'ws';
import { createTelephonyService } from '../../telephony.js';
import { PlivoTelephonyAdapter } from './client.js';
import { validatePlivoV3Signature } from './security.js';

console.log('=== NEXTLITE VOICE — PLIVO INTEGRATION & AGENT TEST ===\n');

async function runPlivoVerification() {
  // 1. Verify Environment Variables
  console.log('1. Checking Plivo Environment Variables...');
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  const callerId = process.env.PLIVO_CALLER_ID;
  const streamHost = process.env.PLIVO_STREAM_HOST;

  console.log(`   - PLIVO_AUTH_ID: ${authId ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   - PLIVO_AUTH_TOKEN: ${authToken ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   - PLIVO_CALLER_ID: ${callerId ? `✅ ${callerId}` : '❌ Missing'}`);
  console.log(`   - PLIVO_STREAM_HOST: ${streamHost ? `✅ ${streamHost}` : '❌ Missing'}`);

  if (!authId || !authToken || !callerId) {
    console.error('❌ Plivo environment variables incomplete!');
    process.exit(1);
  }

  // 2. Test Factory & Client Adapter
  console.log('\n2. Testing PlivoTelephonyAdapter Factory...');
  const service = createTelephonyService('plivo');
  if (service instanceof PlivoTelephonyAdapter) {
    console.log('   ✅ Factory successfully instantiated PlivoTelephonyAdapter');
  } else {
    console.error('   ❌ Factory failed to instantiate PlivoTelephonyAdapter');
    process.exit(1);
  }

  // 3. Test Signature Validation Helper
  console.log('\n3. Testing Plivo V3 Signature Validation...');
  const url = `https://${streamHost}/api/telephony/plivo/stream`;
  const nonce = '123456789';
  const isValid = validatePlivoV3Signature(url, nonce, 'dummy_signature', authToken);
  console.log(`   - Signature check with dummy sig: ${!isValid ? '✅ Rejected (Correct)' : '❌ Failed'}`);

  // 4. Test Local API Server Answer & Stream Endpoints
  console.log('\n4. Testing Local Backend Answer XML Endpoint...');
  try {
    const answerRes = await fetch('http://localhost:3001/api/telephony/plivo/answer?tenant-id=test-tenant&agent-id=test-agent');
    const xml = await answerRes.text();
    console.log('   - Response status:', answerRes.status);
    console.log('   - Content-Type:', answerRes.headers.get('content-type'));
    if (xml.includes('<Stream') && xml.includes('audio/x-l16;rate=16000') && !xml.includes('statusCallbackUrl')) {
      console.log('   ✅ Valid Plivo Stream XML generated without invalid XML attributes!');
    } else {
      console.warn('   ⚠️ XML check note:', xml);
    }
  } catch (err: any) {
    console.error('   ❌ Could not connect to http://localhost:3001. Ensure API dev server is running!');
  }

  console.log('\n=== PLIVO CONFIGURATION CHECK COMPLETE ===');
}

runPlivoVerification().catch(console.error);
