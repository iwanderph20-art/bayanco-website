export async function onRequestPost(context) {
  try {
    const formData = await context.request.json();
    const { name, email, subject, message } = formData;
    
    // Validate required fields
    if (!name || !email || !subject || !message) {
      return new Response(JSON.stringify({ success: false, error: 'All fields are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    // In production, you would:
    // 1. Store in Cloudflare D1 database
    // 2. Send notification email via Mailgun/SendGrid/Resend API
    // 3. Send confirmation email to user
    
    // For now, log and return success
    console.log('Contact form submission:', { name, email, subject, message, timestamp: new Date().toISOString() });
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Thank you for contacting us! We will respond within 24 hours.' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: 'Server error. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
