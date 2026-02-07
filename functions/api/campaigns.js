// Sample campaigns data (in production, this would come from D1 database)
const sampleCampaigns = [
  { id: 1, title: "Help Aling Rosa's Cancer Treatment", category: "medical", goal: 500000, raised: 387500, donors: 234, description: "Aling Rosa needs chemotherapy treatment for stage 2 breast cancer.", daysLeft: 15, verified: true },
  { id: 2, title: "Scholarship Fund for Mindanao Students", category: "education", goal: 200000, raised: 156000, donors: 189, description: "Providing scholarships for 20 deserving students in Mindanao.", daysLeft: 30, verified: true },
  { id: 3, title: "Rebuild After Typhoon Kristine", category: "emergency", goal: 1000000, raised: 892000, donors: 567, description: "Emergency relief and rebuilding for families affected by Typhoon Kristine.", daysLeft: 7, verified: true },
  { id: 4, title: "Sari-Sari Store Startup Fund", category: "business", goal: 50000, raised: 32000, donors: 45, description: "Help Nanay Linda start her sari-sari store to support her family.", daysLeft: 22, verified: false },
  { id: 5, title: "Barangay Library Project", category: "community", goal: 150000, raised: 98000, donors: 112, description: "Building a community library for children in Barangay San Jose.", daysLeft: 45, verified: true },
  { id: 6, title: "Dialysis Treatment for Tatay Ben", category: "medical", goal: 300000, raised: 175000, donors: 156, description: "Tatay Ben needs regular dialysis treatments he cannot afford.", daysLeft: 20, verified: true },
  { id: 7, title: "School Supplies for 100 Kids", category: "education", goal: 75000, raised: 75000, donors: 203, description: "Providing school supplies for underprivileged children in Tondo.", daysLeft: 0, verified: true },
  { id: 8, title: "Fishing Boat Repair Fund", category: "personal", goal: 25000, raised: 18000, donors: 34, description: "Help repair Mang Pedro's fishing boat damaged during the storm.", daysLeft: 12, verified: false }
];

export async function onRequestGet() {
  return new Response(JSON.stringify({ success: true, campaigns: sampleCampaigns }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
