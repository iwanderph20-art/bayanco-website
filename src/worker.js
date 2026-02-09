// BayanCo Campaign Submission Worker
// Handles form submissions and sends email notifications

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle campaign form submission
    if (url.pathname === '/api/submit-campaign' && request.method === 'POST') {
      return handleCampaignSubmission(request, env);
    }

    // Handle donation form submission
    if (url.pathname === '/api/submit-donation' && request.method === 'POST') {
      return handleDonationSubmission(request, env);
    }

    // For everything else, let the static assets handler take over
    return env.ASSETS.fetch(request);
  }
};

async function handleCampaignSubmission(request, env) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await request.json();

    // Validate required fields
    const required = ['campaignTitle', 'category', 'campaignDescription', 'targetAmount', 'deadline', 'creatorName', 'creatorEmail', 'creatorPhone', 'creatorLocation', 'paymentMethod'];
    for (const field of required) {
      if (!formData[field]) {
        return new Response(JSON.stringify({ success: false, error: `Missing required field: ${field}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Format the submission date
    const submittedAt = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

    // Calculate fees
    const target = parseFloat(formData.targetAmount);
    const platformFee = target * 0.04;
    const paymentFee = (target * 0.025) + 10;
    const netAmount = target - platformFee - paymentFee;

    // Build admin notification email HTML
    const adminEmailHtml = buildAdminEmail(formData, submittedAt, target, platformFee, paymentFee, netAmount);

    // Build welcome email HTML for the campaign creator
    const welcomeEmailHtml = buildWelcomeEmail(formData);

    // Send emails via Resend API
    const RESEND_API_KEY = env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      // If no API key, log the submission and return success
      console.log('Campaign submission (no email configured):', JSON.stringify(formData));
      return new Response(JSON.stringify({
        success: true,
        message: 'Campaign submitted successfully. Email notifications are not yet configured.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Send emails (non-blocking — submission succeeds even if emails fail)
    let emailsSent = false;
    try {
      // Send admin notification to both emails
      await sendEmail(RESEND_API_KEY, {
        from: 'BayanCo <noreply@bayanco.org>',
        to: ['iwanderph20@gmail.com', 'hello@bayanco.org'],
        subject: `New Campaign: "${formData.campaignTitle}" by ${formData.creatorName}`,
        html: adminEmailHtml
      });

      // Send welcome email to the campaign creator
      await sendEmail(RESEND_API_KEY, {
        from: 'BayanCo <noreply@bayanco.org>',
        to: [formData.creatorEmail],
        subject: `Welcome to BayanCo! Your campaign "${formData.campaignTitle}" has been submitted`,
        html: welcomeEmailHtml
      });

      emailsSent = true;
    } catch (emailError) {
      console.error('Email sending failed (submission still recorded):', emailError.message);
    }

    return new Response(JSON.stringify({
      success: true,
      message: emailsSent
        ? 'Campaign submitted successfully! Check your email for confirmation.'
        : 'Campaign submitted successfully! (Email confirmation will be sent once our email system is fully set up.)'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Error processing campaign submission:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Something went wrong. Please try again.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function handleDonationSubmission(request, env) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data = await request.json();

    // Validate required fields
    const required = ['donorName', 'donorEmail', 'donationAmount', 'paymentMethod'];
    for (const field of required) {
      if (!data[field]) {
        return new Response(JSON.stringify({ success: false, error: `Missing required field: ${field}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    const submittedAt = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
    const donationAmount = parseFloat(data.donationAmount);
    const tipPercent = parseInt(data.platformTip) || 0;
    const tipAmount = donationAmount * (tipPercent / 100);

    // Build admin notification email
    const adminEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1A936F 0%, #004E89 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 5px 0 0; opacity: 0.9; font-size: 14px; }
    .badge { display: inline-block; background: #FFB627; color: #2D2D2A; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 10px; }
    .content { padding: 30px; }
    .section { margin-bottom: 25px; }
    .section h2 { color: #004E89; font-size: 18px; margin: 0 0 15px; padding-bottom: 8px; border-bottom: 2px solid #FFB627; }
    .field { display: flex; margin-bottom: 10px; }
    .field-label { font-weight: 600; color: #666; min-width: 160px; }
    .field-value { color: #2D2D2A; }
    .amount-box { background: #E8F5E9; border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; text-align: center; }
    .amount-box .amount { font-size: 32px; font-weight: 700; color: #1A936F; }
    .amount-box .label { font-size: 14px; color: #666; }
    .footer { background: #2D2D2A; color: #aaa; padding: 20px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Donation Received</h1>
      <p>Submitted on ${submittedAt}</p>
      <div class="badge">DONATION NOTIFICATION</div>
    </div>
    <div class="content">
      <div class="amount-box">
        <div class="label">Donation Amount</div>
        <div class="amount">PHP ${donationAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
        ${tipAmount > 0 ? `<div class="label" style="margin-top: 8px;">Platform Tip: PHP ${tipAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (${tipPercent}%)</div>` : ''}
      </div>

      <div class="section" style="margin-top: 25px;">
        <h2>Campaign</h2>
        <div class="field"><span class="field-label">Campaign:</span><span class="field-value">${escapeHtml(data.campaignTitle || 'Not specified')}</span></div>
        <div class="field"><span class="field-label">Payment Method:</span><span class="field-value">${escapeHtml(data.paymentMethod)}</span></div>
      </div>

      <div class="section">
        <h2>Donor Information</h2>
        <div class="field"><span class="field-label">Name:</span><span class="field-value">${data.anonymous ? '(Anonymous)' : escapeHtml(data.donorName)}</span></div>
        <div class="field"><span class="field-label">Email:</span><span class="field-value"><a href="mailto:${escapeHtml(data.donorEmail)}">${escapeHtml(data.donorEmail)}</a></span></div>
        ${data.donorPhone ? `<div class="field"><span class="field-label">Phone:</span><span class="field-value">${escapeHtml(data.donorPhone)}</span></div>` : ''}
        ${data.donorLocation ? `<div class="field"><span class="field-label">Location:</span><span class="field-value">${escapeHtml(data.donorLocation)}</span></div>` : ''}
        ${data.donorMessage ? `<div class="field"><span class="field-label">Message:</span><span class="field-value">${escapeHtml(data.donorMessage)}</span></div>` : ''}
        <div class="field"><span class="field-label">Anonymous:</span><span class="field-value">${data.anonymous ? 'Yes' : 'No'}</span></div>
      </div>
    </div>
    <div class="footer">
      <p>BayanCo Donation Management System</p>
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>`;

    // Build donor confirmation email
    const donorEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #FFF8F0; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1A936F 0%, #004E89 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .logo { font-size: 32px; font-weight: 900; color: #FFB627; margin-bottom: 15px; }
    .content { padding: 30px; }
    .amount-highlight { background: #E8F5E9; border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .amount-highlight .amount { font-size: 28px; font-weight: 700; color: #1A936F; }
    .amount-highlight .label { font-size: 14px; color: #666; }
    .info-box { background: #FFF3E0; border-left: 4px solid #FF6B35; padding: 15px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .info-box p { margin: 0; font-size: 14px; color: #555; line-height: 1.6; }
    .info-box strong { color: #2D2D2A; }
    .disclaimer { background: #FFF8E1; border: 1px solid #FFD54F; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 13px; color: #666; line-height: 1.6; }
    .footer { background: #2D2D2A; color: #aaa; padding: 25px; text-align: center; font-size: 12px; }
    .footer a { color: #FFB627; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">BayanCo</div>
      <h1>Salamat, ${escapeHtml(data.donorName)}!</h1>
      <p style="opacity: 0.9; margin-top: 10px;">Thank you for your generous donation</p>
    </div>
    <div class="content">
      <p style="font-size: 16px; color: #2D2D2A;">Your donation pledge has been recorded. Here are the details:</p>

      <div class="amount-highlight">
        <div class="label">Your Donation</div>
        <div class="amount">PHP ${donationAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
        <div class="label" style="margin-top: 5px;">for "${escapeHtml(data.campaignTitle || 'Campaign')}"</div>
      </div>

      <div class="info-box">
        <p><strong>Next Step:</strong> Complete your payment by sending <strong>PHP ${donationAmount.toLocaleString('en-PH')}</strong> to the campaign creator via <strong>${escapeHtml(data.paymentMethod === 'gcash' ? 'GCash' : 'PayMaya')}</strong>. The campaign creator's payment details are provided on the campaign page.</p>
      </div>

      <div class="disclaimer">
        <strong>Important Reminder:</strong><br>
        Your donation goes directly to the campaign creator. BayanCo does not hold, manage, or guarantee any funds. Donations are non-refundable once sent. BayanCo is not responsible for how campaign creators use the donated funds. Donations are not tax-deductible as charitable contributions.
      </div>

      <p style="font-size: 14px; color: #666; line-height: 1.6; margin-top: 20px;">
        If you have any questions or concerns about your donation, please contact us at <a href="mailto:support@bayanco.org" style="color: #004E89;">support@bayanco.org</a>.
      </p>

      <p style="font-size: 14px; color: #2D2D2A; font-weight: 600; margin-top: 20px;">
        Maraming Salamat,<br>
        The BayanCo Team
      </p>
    </div>
    <div class="footer">
      <p style="font-size: 16px; font-weight: 700; color: #FFB627; margin-bottom: 10px;">BayanCo</p>
      <p>BayanCo - Filipino Crowdfunding Platform</p>
      <p><a href="https://bayanco.org/legal.html">Terms of Service</a> &bull; <a href="https://bayanco.org/privacy.html">Privacy Policy</a></p>
      <p style="margin-top: 10px;">You received this email because you made a donation on bayanco.org</p>
    </div>
  </div>
</body>
</html>`;

    // Send emails
    const RESEND_API_KEY = env.RESEND_API_KEY;
    let emailsSent = false;

    if (RESEND_API_KEY) {
      try {
        // Admin notification
        await sendEmail(RESEND_API_KEY, {
          from: 'BayanCo <noreply@bayanco.org>',
          to: ['iwanderph20@gmail.com', 'hello@bayanco.org'],
          subject: `New Donation: PHP ${donationAmount.toLocaleString()} for "${data.campaignTitle || 'Campaign'}" from ${data.anonymous ? 'Anonymous' : data.donorName}`,
          html: adminEmailHtml
        });

        // Donor confirmation
        await sendEmail(RESEND_API_KEY, {
          from: 'BayanCo <noreply@bayanco.org>',
          to: [data.donorEmail],
          subject: `Thank you for your donation to "${data.campaignTitle || 'Campaign'}" on BayanCo`,
          html: donorEmailHtml
        });

        emailsSent = true;
      } catch (emailError) {
        console.error('Donation email sending failed:', emailError.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: emailsSent
        ? 'Donation recorded! Check your email for payment instructions.'
        : 'Donation recorded successfully!'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Error processing donation:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Something went wrong. Please try again.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function sendEmail(apiKey, emailData) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(emailData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Resend API error:', errorText);
    throw new Error(`Email send failed: ${response.status}`);
  }

  return response.json();
}

function buildAdminEmail(data, submittedAt, target, platformFee, paymentFee, netAmount) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #004E89 0%, #5B2A86 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 5px 0 0; opacity: 0.9; font-size: 14px; }
    .badge { display: inline-block; background: #FF6B35; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 10px; }
    .content { padding: 30px; }
    .section { margin-bottom: 25px; }
    .section h2 { color: #004E89; font-size: 18px; margin: 0 0 15px; padding-bottom: 8px; border-bottom: 2px solid #FFB627; }
    .field { display: flex; margin-bottom: 10px; }
    .field-label { font-weight: 600; color: #666; min-width: 160px; }
    .field-value { color: #2D2D2A; }
    .amount-box { background: #FFF8F0; border: 2px solid #FFB627; border-radius: 8px; padding: 20px; text-align: center; }
    .amount-box .target { font-size: 32px; font-weight: 700; color: #004E89; }
    .amount-box .label { font-size: 14px; color: #666; }
    .fee-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .fee-table td { padding: 8px 0; font-size: 14px; }
    .fee-table .total td { border-top: 2px solid #ddd; font-weight: 700; color: #004E89; }
    .footer { background: #2D2D2A; color: #aaa; padding: 20px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Campaign Submission</h1>
      <p>Submitted on ${submittedAt}</p>
      <div class="badge">ACTION REQUIRED: Review Campaign</div>
    </div>
    <div class="content">
      <div class="amount-box">
        <div class="label">Target Funding Amount</div>
        <div class="target">PHP ${target.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
      </div>

      <div class="section" style="margin-top: 25px;">
        <h2>Campaign Details</h2>
        <div class="field"><span class="field-label">Title:</span><span class="field-value">${escapeHtml(data.campaignTitle)}</span></div>
        <div class="field"><span class="field-label">Category:</span><span class="field-value">${escapeHtml(data.category)}</span></div>
        <div class="field"><span class="field-label">Deadline:</span><span class="field-value">${escapeHtml(data.deadline)}</span></div>
        <div class="field"><span class="field-label">Payment Method:</span><span class="field-value">${escapeHtml(data.paymentMethod)}</span></div>
        ${data.paymentAccountName ? `<div class="field"><span class="field-label">Account Name:</span><span class="field-value">${escapeHtml(data.paymentAccountName)}</span></div>` : ''}
        ${data.paymentAccountNumber ? `<div class="field"><span class="field-label">Account Number:</span><span class="field-value">${escapeHtml(data.paymentAccountNumber)}</span></div>` : ''}
        <div style="margin-top: 10px;">
          <div class="field-label">Description:</div>
          <p style="color: #2D2D2A; margin-top: 5px; line-height: 1.6;">${escapeHtml(data.campaignDescription)}</p>
        </div>
      </div>

      <div class="section">
        <h2>Creator Information</h2>
        <div class="field"><span class="field-label">Full Name:</span><span class="field-value">${escapeHtml(data.creatorName)}</span></div>
        <div class="field"><span class="field-label">Email:</span><span class="field-value"><a href="mailto:${escapeHtml(data.creatorEmail)}">${escapeHtml(data.creatorEmail)}</a></span></div>
        <div class="field"><span class="field-label">Phone:</span><span class="field-value">${escapeHtml(data.creatorPhone)}</span></div>
        <div class="field"><span class="field-label">Location:</span><span class="field-value">${escapeHtml(data.creatorLocation)}</span></div>
      </div>

      <div class="section">
        <h2>Fee Breakdown</h2>
        <table class="fee-table">
          <tr><td>Target Amount</td><td style="text-align:right;">PHP ${target.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Platform Fee (4%)</td><td style="text-align:right;">- PHP ${platformFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Payment Processing (2.5% + PHP 10)</td><td style="text-align:right;">- PHP ${paymentFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total"><td>Creator Receives</td><td style="text-align:right;">PHP ${netAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      ${data.rewards ? `
      <div class="section">
        <h2>Reward Tiers</h2>
        <p style="line-height: 1.6;">${escapeHtml(data.rewards)}</p>
      </div>` : ''}

      <div class="section">
        <h2>Agreements</h2>
        <div class="field"><span class="field-label">Regular Updates:</span><span class="field-value">${data.updates ? 'Yes' : 'No'}</span></div>
        <div class="field"><span class="field-label">Transparency:</span><span class="field-value">${data.transparency ? 'Yes' : 'No'}</span></div>
        <div class="field"><span class="field-label">Terms Accepted:</span><span class="field-value">${data.terms ? 'Yes' : 'No'}</span></div>
        <div class="field"><span class="field-label">Privacy Accepted:</span><span class="field-value">${data.privacy ? 'Yes' : 'No'}</span></div>
      </div>
    </div>
    <div class="footer">
      <p>BayanCo Campaign Management System</p>
      <p>This is an automated notification. Please review and approve this campaign.</p>
    </div>
  </div>
</body>
</html>`;
}

function buildWelcomeEmail(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #FFF8F0; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #004E89 0%, #5B2A86 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 10px 0 0; opacity: 0.9; font-size: 16px; }
    .logo { font-size: 32px; font-weight: 900; color: #FFB627; margin-bottom: 15px; }
    .content { padding: 30px; }
    .greeting { font-size: 18px; color: #2D2D2A; margin-bottom: 20px; }
    .campaign-card { background: #FFF8F0; border-left: 4px solid #FF6B35; padding: 20px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .campaign-card h3 { margin: 0 0 5px; color: #004E89; font-size: 20px; }
    .campaign-card .meta { color: #666; font-size: 14px; }
    .steps { margin: 25px 0; }
    .step { display: flex; margin-bottom: 15px; }
    .step-number { background: #FF6B35; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; margin-right: 15px; margin-top: 2px; }
    .step-content h4 { margin: 0 0 4px; color: #2D2D2A; font-size: 15px; }
    .step-content p { margin: 0; color: #666; font-size: 14px; line-height: 1.5; }
    .highlight-box { background: #E8F5E9; border: 1px solid #4CAF50; border-radius: 8px; padding: 15px 20px; margin: 20px 0; }
    .highlight-box p { margin: 0; color: #2E7D32; font-size: 14px; }
    .highlight-box strong { color: #1B5E20; }
    .cta-button { display: inline-block; background: #FF6B35; color: white; padding: 14px 30px; border-radius: 5px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 15px 0; }
    .divider { border: none; border-top: 1px solid #eee; margin: 25px 0; }
    .tips { background: #F3E5F5; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .tips h3 { color: #5B2A86; margin: 0 0 10px; font-size: 16px; }
    .tips ul { margin: 0; padding-left: 20px; color: #444; font-size: 14px; line-height: 2; }
    .footer { background: #2D2D2A; color: #aaa; padding: 25px; text-align: center; font-size: 12px; }
    .footer a { color: #FFB627; text-decoration: none; }
    .social-links { margin: 10px 0; }
    .social-links a { color: #FFB627; margin: 0 10px; text-decoration: none; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">BayanCo</div>
      <h1>Welcome, ${escapeHtml(data.creatorName)}!</h1>
      <p>Your campaign has been submitted for review</p>
    </div>
    <div class="content">
      <p class="greeting">Salamat for choosing BayanCo! We're excited to help you bring your vision to life through the spirit of bayanihan.</p>

      <div class="campaign-card">
        <h3>${escapeHtml(data.campaignTitle)}</h3>
        <div class="meta">Category: ${escapeHtml(data.category)} &bull; Target: PHP ${parseFloat(data.targetAmount).toLocaleString('en-PH')} &bull; Deadline: ${escapeHtml(data.deadline)}</div>
      </div>

      <h3 style="color: #004E89;">What Happens Next?</h3>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h4>Campaign Review</h4>
            <p>Our team will review your campaign within 24-48 hours. We'll check that everything is in order and reach out if we need anything.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h4>Campaign Goes Live</h4>
            <p>Once approved, your campaign will be published on BayanCo and visible to our community of donors.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h4>Share & Promote</h4>
            <p>Share your campaign link on social media, messaging groups, and with your network. The more people see it, the more support you'll receive.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-content">
            <h4>Receive Donations Directly</h4>
            <p>Donations are sent directly to you via ${escapeHtml(data.paymentMethod === 'paymongo' ? 'PayMongo (GCash)' : 'PayMaya (GCash)')}. BayanCo does not hold your funds — you receive them as donors contribute.</p>
          </div>
        </div>
      </div>

      <div class="highlight-box">
        <p><strong>Important:</strong> BayanCo does not hold any funds. All donations go directly from donors to you through ${escapeHtml(data.paymentMethod === 'paymongo' ? 'PayMongo' : 'PayMaya')} (GCash). A 4% platform fee and 2.5% + PHP 10 payment processing fee are automatically deducted per transaction.</p>
      </div>

      <hr class="divider">

      <div class="tips">
        <h3>Tips for a Successful Campaign</h3>
        <ul>
          <li>Upload high-quality photos and videos of your project</li>
          <li>Write a compelling story — tell donors WHY this matters</li>
          <li>Share your campaign within the first 48 hours for maximum momentum</li>
          <li>Post regular updates to keep donors engaged and build trust</li>
          <li>Thank every donor personally — it goes a long way</li>
        </ul>
      </div>

      <p style="text-align: center; margin-top: 25px;">
        <a href="https://bayanco.org/video-creators.html" class="cta-button">Watch: How to Run a Successful Campaign</a>
      </p>

      <hr class="divider">

      <p style="font-size: 14px; color: #666; line-height: 1.6;">
        If you have any questions, don't hesitate to reach out to us at <a href="mailto:support@bayanco.org" style="color: #004E89;">support@bayanco.org</a> or <a href="mailto:hello@bayanco.org" style="color: #004E89;">hello@bayanco.org</a>. We're here to help you succeed!
      </p>

      <p style="font-size: 14px; color: #2D2D2A; font-weight: 600;">
        Together We Rise,<br>
        The BayanCo Team
      </p>
    </div>
    <div class="footer">
      <p style="font-size: 16px; font-weight: 700; color: #FFB627; margin-bottom: 10px;">BayanCo</p>
      <div class="social-links">
        <a href="#">Facebook</a> &bull;
        <a href="#">Twitter</a> &bull;
        <a href="#">Instagram</a>
      </div>
      <p style="margin-top: 15px;">BayanCo - Filipino Crowdfunding Platform</p>
      <p><a href="https://bayanco.org/legal.html">Terms of Service</a> &bull; <a href="https://bayanco.org/privacy.html">Privacy Policy</a></p>
      <p style="margin-top: 10px;">You received this email because you created a campaign on bayanco.org</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
