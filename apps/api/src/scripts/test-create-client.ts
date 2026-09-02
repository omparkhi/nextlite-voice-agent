import dotenv from 'dotenv';
import path from 'path';
import { getEmailService } from '../services/email';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testCreateClientEmail() {
  console.log('Testing create client email dispatch...');
  const email = 'parkhiom50@gmail.com';
  const name = 'Test Client Owner';
  const verificationLink = 'http://localhost:3000/verify-email/test-token-123';
  
  try {
    const emailService = getEmailService();
    console.log('Sending verification email via emailService...');
    await emailService.sendVerificationEmail(email, name, verificationLink);
    console.log('SUCCESS! Verification email sent cleanly via getEmailService()');
  } catch (err) {
    console.error('ERROR sending verification email:', err);
  }
}

testCreateClientEmail();
