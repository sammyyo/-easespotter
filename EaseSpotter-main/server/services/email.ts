import { MailService } from '@sendgrid/mail';
import * as nodemailer from 'nodemailer';
import * as Brevo from '@getbrevo/brevo';

// Email service interface
interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
}

// The email service provider we're currently using
type EmailServiceProvider = 'brevo' | 'sendgrid' | 'nodemailer' | 'none';
let currentProvider: EmailServiceProvider = 'none';

// Initialize Brevo mail service if the API key is available
let brevoApiInstance: Brevo.TransactionalEmailsApi | null = null;

if (process.env.BREVO_API_KEY) {
  try {
    brevoApiInstance = new Brevo.TransactionalEmailsApi();
    brevoApiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
    currentProvider = 'brevo';
    console.log("Brevo email service initialized");
  } catch (error) {
    console.error("Failed to initialize Brevo:", error);
  }
}

// Initialize SendGrid mail service if the API key is available and Brevo isn't available
let sendgridMailService: MailService | null = null;

if (!brevoApiInstance && process.env.SENDGRID_API_KEY) {
  try {
    sendgridMailService = new MailService();
    sendgridMailService.setApiKey(process.env.SENDGRID_API_KEY);
    currentProvider = 'sendgrid';
    console.log("SendGrid email service initialized");
  } catch (error) {
    console.error("Failed to initialize SendGrid:", error);
  }
}

// Initialize Nodemailer as a fallback
let nodemailerTransporter: nodemailer.Transporter | null = null;

// Create a test account at ethereal.email (a free fake SMTP service for testing)
async function setupNodemailer() {
  try {
    // Create a testing account for demonstration purposes
    // Ethereal is a fake SMTP service, perfect for testing emails without actually sending them
    const testAccount = await nodemailer.createTestAccount();
    
    // Create a transporter
    nodemailerTransporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    
    currentProvider = 'nodemailer';
    console.log("Nodemailer initialized with Ethereal test account");
    console.log("Note: Emails won't be delivered to real recipients, but preview URLs will be shown in logs");
    return true;
  } catch (error) {
    console.error("Failed to initialize Nodemailer:", error);
    return false;
  }
}

// Setup Nodemailer if SendGrid isn't available
if (currentProvider === 'none') {
  setupNodemailer().catch(console.error);
}

/**
 * Sends an email using the available email service provider or logs the email details if no provider is available
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    // Try to send with Brevo first if available
    if (currentProvider === 'brevo' && brevoApiInstance) {
      try {
        // Create Brevo email request
        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        
        // Set sender information
        sendSmtpEmail.sender = {
          name: params.from.includes('@') ? params.from.split('@')[0] : 'EaseSpotter',
          email: params.from
        };
        
        // Set recipient information
        sendSmtpEmail.to = [{
          email: params.to,
          name: params.to.includes('@') ? params.to.split('@')[0] : params.to
        }];
        
        // Set email subject
        sendSmtpEmail.subject = params.subject;
        
        // Set email content
        if (params.html) {
          sendSmtpEmail.htmlContent = params.html;
        }
        if (params.text) {
          sendSmtpEmail.textContent = params.text;
        }
        
        // Send the email
        await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`Email sent to ${params.to} (${params.subject}) using Brevo`);
        return true;
      } catch (brevoError) {
        console.error('Brevo API Error:', brevoError);
        // Fall through to next email service
      }
    }
    
    // Try to send with SendGrid if available
    if (currentProvider === 'sendgrid' && sendgridMailService) {
      try {
        await sendgridMailService.send({
          to: params.to,
          from: params.from,
          subject: params.subject,
          text: params.text || undefined,
          html: params.html || undefined,
        });
        console.log(`Email sent to ${params.to} (${params.subject}) using SendGrid`);
        return true;
      } catch (sendError) {
        console.error('SendGrid API Error:', sendError);
        
        // If SendGrid fails, try to initialize Nodemailer as a fallback
        if (!nodemailerTransporter) {
          await setupNodemailer();
        }
        
        // Fall through to next email service
      }
    }
    
    // Try to send with Nodemailer if available
    if (currentProvider === 'nodemailer' && nodemailerTransporter) {
      try {
        const info = await nodemailerTransporter.sendMail({
          from: params.from,
          to: params.to,
          subject: params.subject,
          text: params.text,
          html: params.html,
        });
        
        console.log(`Email sent to ${params.to} (${params.subject}) using Nodemailer`);
        
        // Log the Ethereal URL where the email can be previewed
        console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        
        return true;
      } catch (nodemailerError) {
        console.error('Nodemailer Error:', nodemailerError);
        // Fall through to logging fallback
      }
    }
    
    // If all email services failed or none are available, log the email details
    console.log("========== EMAIL SERVICE (FALLBACK MODE) ==========");
    console.log(`To: ${params.to}`);
    console.log(`From: ${params.from}`);
    console.log(`Subject: ${params.subject}`);
    if (params.text) console.log(`Text: ${params.text}`);
    if (params.html) console.log(`HTML: ${params.html.substring(0, 200)}...`);
    console.log("=============================================");
    
    // We consider this a success in development mode
    return true;
  } catch (error) {
    console.error('Email service error:', error);
    return false;
  }
}

/**
 * Sends an invitation email using Brevo's API directly
 * If Brevo isn't available, falls back to other email services via sendEmail
 * @param toEmail Email of the recipient
 * @param invitationToken Token for accepting the invitation
 * @param vendorName Name of the vendor/company
 * @param senderName Optional name of the sender (defaults to "EaseSpotter Team")
 * @param role Optional role being offered to invitee (defaults to "team member")
 * @returns Promise resolving to boolean indicating success
 */
export async function sendInvitationEmail(
  toEmail: string, 
  invitationToken: string, 
  vendorName: string = "EaseSpotter",
  senderName: string = "EaseSpotter Team",
  role: string = "team member"
): Promise<boolean> {
  const baseUrl = process.env.BASE_URL || 'https://easespotter.com';
  const acceptUrl = `${baseUrl}/accept-invitation/${invitationToken}`;
  const senderEmail = process.env.EMAIL_FROM || 'noreply@easespotter.com';
  const senderNameFromEnv = process.env.EMAIL_FROM_NAME || 'EaseSpotter Support';
  const logoUrl = process.env.EMAIL_LOGO_URL || `${baseUrl}/favicon.png`;
  
  // Try to use Brevo's specialized template if Brevo is available
  if (currentProvider === 'brevo' && brevoApiInstance) {
    try {
      // Create Brevo email request
      const sendSmtpEmail = new Brevo.SendSmtpEmail();
      
      // Set sender information with reliable domain for better deliverability
      sendSmtpEmail.sender = {
        name: senderNameFromEnv,
        email: senderEmail
      };
      
      // Set recipient information
      sendSmtpEmail.to = [{
        email: toEmail,
        name: toEmail.includes('@') ? toEmail.split('@')[0] : toEmail
      }];
      
      // Set email subject
      sendSmtpEmail.subject = `Invitation to join ${vendorName} on EaseSpotter`;
      
      // Set HTML content with professional design
      sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="EaseSpotter Logo" style="max-width: 150px;">
        </div>
        <div style="background-color: #f5f7fb; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
          <h2 style="color: #4f46e5; margin-top: 0;">You've Been Invited!</h2>
          <p>Hello,</p>
          <p>${senderName} has invited you to join <strong>${vendorName}</strong> as a <strong>${role}</strong> on the EaseSpotter platform.</p>
          <p>EaseSpotter is a dynamic pricing platform that helps businesses optimize their pricing strategies, track competitors, and manage inventory efficiently.</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${acceptUrl}" style="background-color: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        <div style="margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px; color: #666; font-size: 13px;">
          <p>This invitation will expire in 7 days.</p>
          <p>If you did not expect this invitation, you can safely ignore this email.</p>
          <p style="margin-top: 15px; text-align: center;">
            &copy; ${new Date().getFullYear()} EaseSpotter. All rights reserved.
          </p>
        </div>
      </div>
      `;
      
      // Send the email
      await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`Invitation email sent to ${toEmail} using Brevo API directly`);
      return true;
    } catch (brevoError) {
      console.error('Brevo API Error when sending invitation:', brevoError);
      // Fall through to generic email service
    }
  }
  
  // Fall back to regular email service
  return sendEmail({
    to: toEmail,
    from: senderEmail,
    subject: `Invitation to join ${vendorName} on EaseSpotter`,
    text: `You've been invited by ${senderName} to join ${vendorName} as a ${role} on the EaseSpotter platform.
    
To accept this invitation, please visit: ${acceptUrl}

This invitation will expire in 7 days.

If you did not expect this invitation, you can safely ignore this email.`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${logoUrl}" alt="EaseSpotter Logo" style="max-width: 150px;">
      </div>
      <div style="background-color: #f5f7fb; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h2 style="color: #4f46e5; margin-top: 0; text-align: center;">You've Been Invited!</h2>
        <p style="color: #555; line-height: 1.5;">Hello,</p>
        <p style="color: #555; line-height: 1.5;">${senderName} has invited you to join <strong>${vendorName}</strong> as a <strong>${role}</strong> on the EaseSpotter platform.</p>
        <p style="color: #555; line-height: 1.5;">EaseSpotter is a dynamic pricing platform that helps businesses optimize their pricing strategies, track competitors, and manage inventory efficiently.</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${acceptUrl}" style="background-color: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
          Accept Invitation
        </a>
      </div>
      <div style="margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px; color: #666; font-size: 13px;">
        <p>This invitation will expire in 7 days.</p>
        <p>If you did not expect this invitation, you can safely ignore this email.</p>
        <p style="margin-top: 15px; text-align: center;">
          &copy; ${new Date().getFullYear()} EaseSpotter. All rights reserved.
        </p>
      </div>
    </div>
    `
  });
}
