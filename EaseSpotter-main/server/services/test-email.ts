import * as Brevo from '@getbrevo/brevo';
import * as fs from 'fs';
import * as path from 'path';

async function testBrevoEmail() {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_FROM || 'noreply@easespotter.com';
  const senderName = process.env.EMAIL_FROM_NAME || 'EaseSpotter Support';
  
  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY environment variable is not set');
    return;
  }
  
  try {
    console.log('Testing Brevo email service...');
    console.log(`BREVO_API_KEY found (first 5 chars): ${BREVO_API_KEY.substring(0, 5)}...`);
    
    // Initialize API instance
    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY);
    
    // Create a test email
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = {
      name: senderName,
      email: senderEmail
    };
    
    // Configure recipient - using the email that isn't receiving invitations
    sendSmtpEmail.to = [{
      email: 'erhini@yahoo.com',
      name: 'Test Recipient'
    }];
    
    // Set email content
    sendSmtpEmail.subject = 'EaseSpotter Test Email';
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Test Email from EaseSpotter</h2>
        <p>This is a test email sent from the EaseSpotter platform at ${new Date().toLocaleString()}</p>
        <p>If you're receiving this email, the Brevo API integration is working correctly.</p>
      </div>
    `;
    sendSmtpEmail.textContent = `Test Email from EaseSpotter

This is a test email sent from the EaseSpotter platform at ${new Date().toLocaleString()}

If you're receiving this email, the Brevo API integration is working correctly.`;
    
    console.log('Sending test email...');
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('Test email sent successfully!');
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log('MessageId:', result.messageId);
    
  } catch (error) {
    console.error('Error testing Brevo email:');
    console.error(error);
  }
}

// Execute the test
testBrevoEmail();
