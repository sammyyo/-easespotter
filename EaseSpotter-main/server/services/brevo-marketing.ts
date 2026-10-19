import * as Brevo from '@getbrevo/brevo';

const defaultSenderName = process.env.EMAIL_FROM_NAME || 'EaseSpotter Marketing';
const defaultSenderEmail = process.env.EMAIL_FROM || 'noreply@easespotter.com';

// Initialize Brevo API client if the API key is available
let brevoApiInstance: Brevo.TransactionalEmailsApi | null = null;
let brevoContactsApi: Brevo.ContactsApi | null = null;
let brevoCampaignsApi: Brevo.EmailCampaignsApi | null = null;

if (process.env.BREVO_API_KEY) {
  try {
    console.log("Initializing Brevo marketing service with API key");
    
    // Set up the Brevo API client for transactional emails
    brevoApiInstance = new Brevo.TransactionalEmailsApi();
    brevoApiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
    console.log("Brevo TransactionalEmailsApi initialized successfully");
    
    // Set up the Brevo API client for contacts/lists management
    brevoContactsApi = new Brevo.ContactsApi();
    brevoContactsApi.setApiKey(Brevo.ContactsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
    console.log("Brevo ContactsApi initialized successfully");
    
    // Set up the Brevo API client for campaigns management
    brevoCampaignsApi = new Brevo.EmailCampaignsApi();
    brevoCampaignsApi.setApiKey(Brevo.EmailCampaignsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
    console.log("Brevo EmailCampaignsApi initialized successfully");
    
    console.log("All Brevo marketing services initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Brevo marketing service:", error instanceof Error ? error.message : String(error));
    console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
    
    // Reset API instances to ensure consistent state
    brevoApiInstance = null;
    brevoContactsApi = null;
    brevoCampaignsApi = null;
  }
} else {
  console.warn("BREVO_API_KEY environment variable is not set. Email marketing features will be unavailable.");
}

/**
 * Send a marketing email through Brevo
 * @param to Recipient email address
 * @param subject Email subject
 * @param htmlContent HTML content of the email
 * @param textContent Plain text content of the email (optional)
 * @param senderName Name of the sender
 * @param senderEmail Email of the sender
 * @returns Promise resolving to true if email sent successfully
 */
export async function sendMarketingEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
  senderName: string = defaultSenderName,
  senderEmail: string = defaultSenderEmail
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!brevoApiInstance) {
    return { 
      success: false, 
      error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
    };
  }

  try {
    // Create Brevo email request
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    
    // Set sender information with reliable domain for better deliverability
    sendSmtpEmail.sender = {
      name: senderName,
      email: senderEmail
    };
    
    // Parse recipients - can be a comma-separated list or segment name
    const recipients = to.split(',').map(email => email.trim());
    sendSmtpEmail.to = recipients.map(email => ({
      email,
      name: email.includes('@') ? email.split('@')[0] : email
    }));
    
    // Set email subject
    sendSmtpEmail.subject = subject;
    
    // Set email content
    sendSmtpEmail.htmlContent = htmlContent;
    if (textContent) {
      sendSmtpEmail.textContent = textContent;
    }
    
    // Send the email
    console.log(`Attempting to send marketing email to ${to}`);
    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('Email sent successfully. Brevo Response:', JSON.stringify(result, null, 2));
    
    return { 
      success: true,
      messageId: result.body?.messageId
    };
  } catch (error) {
    console.error('Error sending marketing email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get all marketing campaigns from Brevo
 * @returns Promise resolving to the list of campaigns
 */
export async function getMarketingCampaigns() {
  if (!brevoCampaignsApi) {
    return { 
      success: false, 
      error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
    };
  }

  try {
    // Get campaigns with statistics - call with individual parameters instead of an object
    // Parameters: type, status, statistics, startDate, endDate, limit, offset, sort, excludeHtmlContent
    const result = await brevoCampaignsApi.getEmailCampaigns(
      undefined, // type
      'sent',    // status (Get only sent campaigns)
      undefined, // statistics
      undefined, // startDate
      undefined, // endDate
      50,        // limit (Limit to 50 campaigns)
      undefined, // offset
      undefined, // sort
      undefined  // excludeHtmlContent
    );
    
    return {
      success: true,
      campaigns: result.body.campaigns || []
    };
  } catch (error) {
    console.error('Error fetching marketing campaigns:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get all contact lists from Brevo
 * @returns Promise resolving to the list of contact lists
 */
export async function getContactLists() {
  if (!brevoContactsApi) {
    return { 
      success: false, 
      error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
    };
  }

  try {
    // Get contact lists
    const result = await brevoContactsApi.getLists(50, 0); // Get first 50 lists
    
    return {
      success: true,
      lists: result.body.lists || []
    };
  } catch (error) {
    console.error('Error fetching contact lists:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a new email template in Brevo
 * @param name Name of the template
 * @param subject Email subject
 * @param htmlContent HTML content of the template
 * @param sender Sender information
 * @returns Promise resolving to the created template details
 */
export async function createEmailTemplate(
  name: string,
  subject: string,
  htmlContent: string,
  sender = { name: defaultSenderName, email: defaultSenderEmail }
) {
  if (!brevoCampaignsApi) {
    return { 
      success: false, 
      error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
    };
  }

  try {
    // Create the template
    const template = new Brevo.CreateSmtpTemplate();
    template.name = name;
    template.subject = subject;
    template.htmlContent = htmlContent;
    template.sender = sender;
    
    const result = await brevoCampaignsApi.createSmtpTemplate(template);
    
    return {
      success: true,
      template: result.body
    };
  } catch (error) {
    console.error('Error creating email template:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get all email templates from Brevo
 * @returns Promise resolving to the list of templates
 */
export async function getEmailTemplates() {
  if (!brevoCampaignsApi) {
    return { 
      success: false, 
      error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
    };
  }

  try {
    // Get email templates - using brevoApiInstance (TransactionalEmailsApi) instead of brevoCampaignsApi
    if (!brevoApiInstance) {
      return { 
        success: false, 
        error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
      };
    }
    
    const result = await brevoApiInstance.getSmtpTemplates();
    
    return {
      success: true,
      templates: result.body.templates || []
    };
  } catch (error) {
    console.error('Error fetching email templates:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create and send a campaign using a template to a specific contact list
 * @param name Campaign name
 * @param templateId ID of the template to use
 * @param listIds Array of contact list IDs to send to
 * @param subject Subject line (overrides template subject if provided)
 * @param scheduledAt Optional date to schedule the campaign for
 * @returns Promise resolving to the created campaign details
 */
export async function createCampaign(
  name: string,
  templateId: number,
  listIds: number[],
  subject?: string,
  scheduledAt?: Date
) {
  if (!brevoCampaignsApi) {
    return { 
      success: false, 
      error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
    };
  }

  try {
    console.log('Creating email campaign with the following parameters:');
    console.log('- Name:', name);
    console.log('- Template ID:', templateId);
    console.log('- List IDs:', listIds);
    console.log('- Subject:', subject || '(using template subject)');
    console.log('- Scheduled At:', scheduledAt ? scheduledAt.toISOString() : '(sending immediately)');
    
    // Create campaign object
    const emailCampaign = new Brevo.CreateEmailCampaign();
    emailCampaign.name = name;
    emailCampaign.templateId = templateId;
    emailCampaign.recipients = { listIds };
    
    // If a subject is provided, override the template subject
    if (subject) {
      emailCampaign.subject = subject;
    }
    
    // Set scheduled date if provided
    if (scheduledAt) {
      // Format date to ISO string
      emailCampaign.scheduledAt = scheduledAt.toISOString();
    }
    
    // Log the campaign object being sent to the API
    console.log('Sending campaign creation request to Brevo API with payload:', JSON.stringify(emailCampaign, null, 2));
    
    // Create the campaign
    const result = await brevoCampaignsApi.createEmailCampaign(emailCampaign);
    
    // Log the successful response
    console.log('Brevo API campaign creation successful:', JSON.stringify(result.body, null, 2));
    
    return {
      success: true,
      campaign: result.body
    };
  } catch (error) {
    console.error('Error creating email campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get a specific campaign's details including statistics
 * @param campaignId ID of the campaign to retrieve
 * @returns Promise resolving to the campaign details
 */
export async function getCampaignDetails(campaignId: number) {
  if (!brevoCampaignsApi) {
    return { 
      success: false, 
      error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
    };
  }

  try {
    // Get campaign details
    const result = await brevoCampaignsApi.getEmailCampaign(campaignId);
    
    return {
      success: true,
      campaign: result.body
    };
  } catch (error) {
    console.error(`Error fetching campaign ${campaignId}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Schedule an existing draft campaign
 * @param campaignId ID of the campaign to schedule
 * @param scheduledAt Date to schedule the campaign for
 * @returns Promise resolving to success status
 */
export async function scheduleCampaign(campaignId: number, scheduledAt: Date) {
  if (!brevoCampaignsApi) {
    return { 
      success: false, 
      error: "Brevo API not initialized. Please ensure BREVO_API_KEY environment variable is set." 
    };
  }

  try {
    // Create update object
    const updateEmailCampaign = new Brevo.UpdateEmailCampaign();
    updateEmailCampaign.scheduledAt = scheduledAt.toISOString();
    
    // Update the campaign
    await brevoCampaignsApi.updateEmailCampaign(campaignId, updateEmailCampaign);
    
    return {
      success: true
    };
  } catch (error) {
    console.error(`Error scheduling campaign ${campaignId}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
