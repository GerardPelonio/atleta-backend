import dotenv from 'dotenv';
dotenv.config();
import nodemailer from 'nodemailer';

/**
 * Configure Nodemailer transporter.
 * Supports Gmail, generic SMTP servers (Host/Port), or named services (Outlook, Yahoo, Mailtrap, etc.).
 * Falls back gracefully to Dev Console logging if credentials are missing.
 */
function createTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const host = process.env.EMAIL_HOST;
  const port = process.env.EMAIL_PORT;
  const service = process.env.EMAIL_SERVICE;

  if (!user || !pass) {
    return null;
  }

  // Option 1: Custom SMTP host & port (e.g. Mailtrap, SendGrid, Amazon SES, custom domain)
  if (host) {
    return nodemailer.createTransport({
      host,
      port: port ? parseInt(port, 10) : 587,
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for 587/25
      auth: {
        user,
        pass,
      },
    });
  }

  // Option 2: Pre-configured service (e.g. 'outlook', 'yahoo', 'hotmail', or default 'gmail')
  return nodemailer.createTransport({
    service: service || 'gmail',
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Send password reset email with formatted HTML and action button.
 */
export async function sendPasswordResetEmailService(
  toEmail: string,
  resetLink: string,
): Promise<{ sent: boolean; message: string }> {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_USER || '"Atleta Platform" <noreply@atleta.com>',
    to: toEmail,
    subject: 'Password Reset Request — Atleta',
    html: `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">

        <!-- Header -->
        <div style="background-color: #141c3a; padding: 28px 40px;">
          <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">ATLETA</h1>
          <p style="margin: 4px 0 0; color: #a0aec0; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Athlete Management Platform</p>
        </div>

        <!-- Body -->
        <div style="padding: 40px 40px 32px;">
          <h2 style="margin: 0 0 16px; color: #141c3a; font-size: 20px; font-weight: 600;">Password Reset Request</h2>

          <p style="margin: 0 0 12px; color: #374151; font-size: 15px; line-height: 1.6;">
            Dear User,
          </p>
          <p style="margin: 0 0 12px; color: #374151; font-size: 15px; line-height: 1.6;">
            We received a request to reset the password associated with your Atleta account. If you initiated this request, please click the button below to proceed.
          </p>
          <p style="margin: 0 0 28px; color: #374151; font-size: 15px; line-height: 1.6;">
            This link will expire in <strong>15 minutes</strong> for security purposes.
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${resetLink}"
               style="display: inline-block; background-color: #141c3a; color: #ffffff; text-decoration: none;
                      padding: 14px 36px; border-radius: 6px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">
              Reset My Password
            </a>
          </div>

          <!-- Security Notice -->
          <div style="background-color: #f8f9fa; border-left: 4px solid #141c3a; border-radius: 4px; padding: 14px 18px; margin-bottom: 28px;">
            <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.6;">
              <strong>Security Notice:</strong> If you did not request a password reset, please disregard this email. Your account remains secure and no changes have been made.
            </p>
          </div>

          <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
            If the button above does not work, copy and paste the following link into your browser:
          </p>
          <p style="margin: 8px 0 0; word-break: break-all;">
            <a href="${resetLink}" style="color: #141c3a; font-size: 12px;">${resetLink}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f3f4f6; padding: 20px 40px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 11px; line-height: 1.6; text-align: center;">
            This is an automated message from the Atleta Platform. Please do not reply to this email.<br/>
            &copy; ${new Date().getFullYear()} Atleta. All rights reserved.
          </p>
        </div>

      </div>
    `,
  };

  if (transporter) {
    await transporter.sendMail(mailOptions);
    return { sent: true, message: 'Password reset link sent to your email.' };
  } else {
    console.log('\n[NODEMAILER DEV MODE] Real EMAIL_USER/EMAIL_PASS not configured in .env.');
    console.log(`[NODEMAILER DEV MODE] Password Reset Link for ${toEmail}:\n${resetLink}\n`);
    return { sent: false, message: 'Dev Mode: Reset link generated and logged to console.' };
  }
}
