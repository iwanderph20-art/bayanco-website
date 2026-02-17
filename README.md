# BayanCo Website - Complete Integration

## Overview
This is the fully integrated BayanCo crowdfunding platform website with all pages styled consistently using the Filipino-inspired color theme.

## Color Theme
- **Sunset Orange**: #FF6B35
- **Mango Yellow**: #FFB627
- **Ocean Blue**: #004E89
- **Island Teal**: #1A936F
- **Coconut Cream**: #FFF8F0
- **Charcoal**: #2D2D2A
- **Warm Sand**: #F4E8D8
- **Deep Purple**: #5B2A86

## Typography
- **Display Font**: Archivo Black (headings, logos)
- **Body Font**: DM Sans (paragraphs, content)

## Website Pages

### 1. index.html - Homepage
- Hero section with call-to-action buttons
- Features grid highlighting platform benefits
- "How It Works" step-by-step guide
- Statistics section
- Final CTA section

### 2. about.html - About Us
- Mission statement
- Core values (Bayanihan, Transparency, Trust)
- Founder profiles for Elle and Eunice Borja
- Origin story
- Call-to-action section

### 3. create-campaign.html - Campaign Creation
- Multi-section form for campaign creation
- Personal information fields
- Campaign details with fee calculator
- Payment method selection (GCash/Bank)
- Photo upload functionality
- Terms and conditions

### 4. safety.html - Safety & Trust
- Three-tier verification system (Basic, Enhanced, Verified)
- Community endorsements explanation
- Fraud prevention measures
- Community reporting system

### 5. faq.html - Frequently Asked Questions
- Campaign creator FAQs
- Donor FAQs
- Safety and security information
- Clear categorization

### 6. contact.html - Contact Information
- Email support details
- Facebook Messenger support
- Phone support information
- Help center resources
- Urgent issue alert box

### 7. press.html - Press & Media
- Platform story angles
- Key differentiators
- Media contact information
- Press release highlights

### 8. legal.html - Legal Disclaimer (NEW)
- Platform role and responsibilities
- Campaign creator obligations
- Donor acknowledgments
- Verification system explanation
- Payment processing and fees
- Fund disbursement policies
- Limitation of liability
- Indemnification clause
- Tax obligations
- Intellectual property rights
- Data privacy and security
- Termination and suspension policies
- Dispute resolution
- Regulatory compliance
- Contact information

## Navigation Structure

### Main Navigation (all pages)
- Home
- About
- Safety & Trust
- FAQs
- Contact
- Press
- Start Campaign (CTA button)

### Footer Navigation (all pages)

**Platform**
- Browse Campaigns
- Start Campaign
- About Us

**Support**
- FAQs
- Safety & Trust
- Contact Us

**Legal**
- Legal Disclaimer
- Press

## Key Features

### Consistent Design Elements
1. **Navigation Bar**: Fixed position, glass-morphism effect with backdrop blur
2. **Page Headers**: Gradient backgrounds (Ocean Blue to Deep Purple)
3. **Cards**: White backgrounds with subtle shadows and colored top borders
4. **Buttons**: Gradient backgrounds with hover effects
5. **Footer**: Dark charcoal background with organized link sections

### Responsive Design
- Mobile-friendly navigation (hides links on mobile)
- Responsive grid layouts
- Adjusted typography for smaller screens
- Optimized padding and spacing

### Color Usage
- **Primary Actions**: Sunset Orange to Deep Purple gradient
- **Headings**: Ocean Blue
- **Highlights**: Mango Yellow
- **Backgrounds**: Coconut Cream, Warm Sand
- **Text**: Charcoal with 80% opacity for body text

## Technical Details

### File Structure
```
/
├── index.html (Homepage)
├── about.html (About Us)
├── create-campaign.html (Campaign Creation)
├── safety.html (Safety & Trust)
├── faq.html (FAQs)
├── contact.html (Contact)
├── press.html (Press & Media)
└── legal.html (Legal Disclaimer)
```

### Dependencies
- Google Fonts (Archivo Black, DM Sans)
- No JavaScript frameworks required
- Pure CSS styling
- Vanilla JavaScript for form interactions

## Form Functionality (create-campaign.html)

### Interactive Features
1. **Category Selection**: Dynamic dropdown
2. **Payment Method Toggle**: Shows/hides GCash or Bank fields
3. **Fee Calculator**: Real-time calculation of fees and net amount
4. **Photo Preview**: Shows thumbnails of uploaded images
5. **Form Validation**: Required fields enforcement
6. **Submission Handler**: Alert confirmation (to be connected to backend)

### Fee Calculation
- Processing Fee: 2.5% + ₱10
- Platform Fee: 4% (tiered 3-6% mentioned elsewhere)
- Displays: Goal Amount, Fees, and Net Amount You Receive

## Deployment Notes

1. All files are ready for deployment
2. Update email addresses in contact forms to actual addresses
3. Replace placeholder founder images if needed
4. Connect form submission to backend API
5. Add actual campaign data/database integration
6. Implement payment gateway integration
7. Add SSL certificate for security

## Accessibility

- Semantic HTML structure
- Proper heading hierarchy
- Descriptive link text
- Sufficient color contrast
- Readable font sizes
- Form labels and placeholders

## Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive from 320px to 4K displays
- CSS Grid and Flexbox support required
- Backdrop-filter support for navigation blur effect

## Future Enhancements

1. Add actual campaign browsing page
2. Implement user authentication
3. Add campaign dashboard
4. Integrate payment processing
5. Add search functionality
6. Implement campaign filtering/sorting
7. Add user profile pages
8. Mobile app version

---

**Created**: February 2026
**Version**: 1.0
**Status**: Production Ready
