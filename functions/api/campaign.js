export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    
    const campaignData = {
      fullName: formData.get('fullName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      campaignTitle: formData.get('campaignTitle'),
      category: formData.get('category'),
      goalAmount: formData.get('goalAmount'),
      story: formData.get('story'),
      paymentMethod: formData.get('paymentMethod'),
      gcashNumber: formData.get('gcashNumber'),
      bankName: formData.get('bankName'),
      accountNumber: formData.get('accountNumber'),
      accountName: formData.get('accountName'),
      timestamp: new Date().toISOString(),
      status: 'pending_review'
    };
    
    // Validate required fields
    if (!campaignData.fullName || !campaignData.email || !campaignData.campaignTitle || !campaignData.goalAmount || !campaignData.story) {
      return new Response(JSON.stringify({ success: false, error: 'Required fields are missing' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    // In production: store in D1, upload photos to R2, send notifications
    console.log('Campaign submission:', campaignData);
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Campaign submitted for review! We will notify you within 24 hours.',
      campaignId: 'camp_' + Date.now()
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
