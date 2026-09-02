import { Resend } from 'resend';
import { EmailService } from './types';
import { createChildLogger } from '../../lib/logger';

const logger = createChildLogger({ module: 'resend-adapter' });

export class ResendAdapter implements EmailService {
  private resend: Resend;
  private from: string;
  
  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }
  
  async sendVerificationEmail(to: string, name: string, verificationLink: string): Promise<void> {
    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject: 'Verify Your NextLite Voice Account',
        html: `
          <h1>Welcome to NextLite Voice</h1>
          <p>Hi ${name},</p>
          <p>Your account has been created. Please verify your email and set your password:</p>
          <p><a href="${verificationLink}">Verify and Set Password</a></p>
          <p>This link expires in 24 hours.</p>
          <p>If you did not expect this email, please ignore it.</p>
        `,
      });
      logger.info({ to }, 'Verification email sent');
    } catch (error) {
      logger.error({ to, error }, 'Failed to send verification email');
      throw error;
    }
  }
  
  async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject: 'Reset Your NextLite Voice Password',
        html: `
          <h1>Password Reset Request</h1>
          <p>You requested a password reset for your NextLite Voice account.</p>
          <p><a href="${resetLink}">Reset Password</a></p>
          <p>This link expires in 1 hour.</p>
          <p>If you did not request this, please ignore this email.</p>
        `,
      });
      logger.info({ to }, 'Password reset email sent');
    } catch (error) {
      logger.error({ to, error }, 'Failed to send password reset email');
      throw error;
    }
  }
}
