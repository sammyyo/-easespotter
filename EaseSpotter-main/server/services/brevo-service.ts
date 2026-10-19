import * as Brevo from '@getbrevo/brevo';

const defaultSenderEmail = process.env.EMAIL_FROM || 'noreply@easespotter.com';
const defaultSenderName = process.env.EMAIL_FROM_NAME || 'EaseSpotter Support';
const defaultBaseUrl = (process.env.INVITATION_BASE_URL || process.env.BASE_URL || 'https://www.easespotter.com').replace(/\/+$/, '');
const defaultLogoUrl = process.env.EMAIL_LOGO_URL || `${defaultBaseUrl}/favicon.png`;

if (!process.env.BREVO_API_KEY) {
  console.warn('BREVO_API_KEY is not set. Email features will not work properly.');
}

let apiInstance: any = null;

function getBrevoApiInstance() {
  if (!process.env.BREVO_API_KEY) {
    return null;
  }

  if (apiInstance) {
    return apiInstance;
  }

  try {
    const TransactionalEmailsApi = (Brevo as any).TransactionalEmailsApi;
    const apiKeys = (Brevo as any).TransactionalEmailsApiApiKeys;

    if (!TransactionalEmailsApi || !apiKeys) {
      console.warn('Brevo SDK is unavailable or incompatible. Skipping Brevo email setup.');
      return null;
    }

    apiInstance = new TransactionalEmailsApi();
    apiInstance.setApiKey(apiKeys.apiKey, process.env.BREVO_API_KEY);
    return apiInstance;
  } catch (error) {
    console.warn('Failed to initialize Brevo invitation service:', error);
    return null;
  }
}

export function getBrevoInvitationConfigStatus() {
  const configured = Boolean(process.env.BREVO_API_KEY);

  return {
    configured,
    provider: configured ? 'brevo' : 'manual-link',
    senderEmail: defaultSenderEmail,
    senderName: defaultSenderName,
    baseUrl: defaultBaseUrl,
  };
}

/**
 * Send an email invitation using Brevo
 * @param senderEmail Email of the sender
 * @param senderName Name of the sender
 * @param recipientEmail Email of the recipient
 * @param recipientName Name of the recipient
 * @param invitationLink URL for the recipient to accept the invitation
 * @param role Role being offered to the invitee
 * @param companyName Name of the company/vendor
 * @returns Promise resolving to true if email sent successfully
 */
export async function sendInvitationEmail(
  senderEmail: string,
  senderName: string,
  recipientEmail: string,
  recipientName: string,
  invitationLink: string,
  role: string,
  companyName: string
): Promise<boolean> {
  try {
    const brevoApi = getBrevoApiInstance();
    const SendSmtpEmail = (Brevo as any).SendSmtpEmail;

    if (!brevoApi || !SendSmtpEmail) {
      console.warn('Brevo invitation email skipped because Brevo is not configured.');
      return false;
    }

    // Create email sending request
    const sendSmtpEmail = new SendSmtpEmail();
    
    sendSmtpEmail.sender = {
      name: defaultSenderName,
      email: defaultSenderEmail
    };
    
    // Set recipient information
    sendSmtpEmail.to = [{
      email: recipientEmail,
      name: recipientName || recipientEmail
    }];
    
    // Set email subject
    sendSmtpEmail.subject = `Invitation to join ${companyName} on EaseSpotter`;
    
    // Set HTML content with professional design
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${defaultLogoUrl}" alt="EaseSpotter Logo" style="max-width: 150px;" />
        </div>
        <div style="background-color: #f5f7fb; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
          <h2 style="color: #4f46e5; margin-top: 0; text-align: center;">You've Been Invited!</h2>
          <p style="color: #555; line-height: 1.5;">
            Hello ${recipientName || 'there'},
          </p>
          <p style="color: #555; line-height: 1.5;">
            ${senderName} has invited you to join <strong>${companyName}</strong> as a <strong>${role}</strong> on EaseSpotter, the platform for dynamic e-commerce pricing, inventory management, and supplier relationship optimization.
          </p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationLink}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        <p style="color: #555; line-height: 1.5;">
          This invitation will expire in 7 days. If you have any questions, please contact ${senderName} at ${senderEmail}.
        </p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #888; font-size: 12px;">
          <p>If you're having trouble with the button above, copy and paste the URL below into your web browser:</p>
          <p style="word-break: break-all;">${invitationLink}</p>
          <p style="margin-top: 15px; text-align: center;">
            &copy; ${new Date().getFullYear()} EaseSpotter. All rights reserved.
          </p>
        </div>
      </div>
    `;
    
    // Set plain text content as fallback
    sendSmtpEmail.textContent = `
      Hello ${recipientName || 'there'},

      ${senderName} has invited you to join ${companyName} as a ${role} on EaseSpotter, the platform for dynamic e-commerce pricing, inventory management, and supplier relationship optimization.

      To accept this invitation, please visit: ${invitationLink}

      This invitation will expire in 7 days. If you have any questions, please contact ${senderName} at ${senderEmail}.
    `;
    
    // Send the email
    console.log('Attempting to send email to:', recipientEmail);
    console.log('With subject:', sendSmtpEmail.subject);
    console.log('Using invitation link:', invitationLink);
    
    const response = await brevoApi.sendTransacEmail(sendSmtpEmail);
    console.log('Email sent successfully. Brevo Response:', JSON.stringify(response, null, 2));
    return true;
  } catch (error) {
    console.error('Error sending invitation email:', error);
    return false;
  }
}
