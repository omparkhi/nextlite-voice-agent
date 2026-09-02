export interface EmailService {
  sendVerificationEmail(to: string, name: string, verificationLink: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetLink: string): Promise<void>;
}
