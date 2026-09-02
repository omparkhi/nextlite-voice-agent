import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

console.log('Testing Resend with:');
console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');
console.log('From:', from);

const resend = new Resend(apiKey);

async function test() {
  try {
    const response = await resend.emails.send({
      from: from,
      to: 'parkhiom50@gmail.com',
      subject: 'Test Email from NextLite Voice',
      html: '<p>Test verification email</p>',
    });
    console.log('RESEND RESPONSE:', JSON.stringify(response, null, 2));
  } catch (err: any) {
    console.error('RESEND ERROR:', err);
  }
}

test();
