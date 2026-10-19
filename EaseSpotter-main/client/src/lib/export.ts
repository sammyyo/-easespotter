import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'jspdf-autotable';

export interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string | null;
  budget: number;
  spent: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  segment: string;
  platform: string;
  tags: string[];
  channelBreakdown?: {
    channel: string;
    spend: number;
    revenue: number;
    budget?: number;
  }[];
  performanceOverTime?: {
    date: string;
    spend: number;
    revenue: number;
  }[];
}

export interface ExportableProduct {
  name: string;
  brand?: string | null;
  sku: string;
  barcode?: string | null;
  basePrice: string;
  currentPrice: string;
  category: string;
  aisle: string;
  shelf: string;
}

export function exportToCSV(data: ExportableProduct[], filename: string) {
  const headers = ['Name', 'Brand', 'SKU', 'Barcode', 'Base Price', 'Current Price', 'Category', 'Aisle', 'Shelf'];
  const csvContent = [
    headers.join(','),
    ...data.map(item => [
      `"${item.name}"`,
      `"${item.brand || ''}"`,
      `"${item.sku}"`,
      `"${item.barcode || ''}"`,
      item.basePrice,
      item.currentPrice,
      `"${item.category}"`,
      `"${item.aisle}"`,
      `"${item.shelf}"`,
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToPDF(data: ExportableProduct[], filename: string) {
  const doc = new jsPDF();
  const headers = ['Name', 'Brand', 'SKU', 'Barcode', 'Base Price', 'Current Price', 'Category', 'Location'];

  const rows = data.map(item => [
    item.name,
    item.brand || '',
    item.sku,
    item.barcode || '',
    `$${Number(item.basePrice).toFixed(2)}`,
    `$${Number(item.currentPrice).toFixed(2)}`,
    item.category,
    `Aisle: ${item.aisle}, Shelf: ${item.shelf}`
  ]);

  // @ts-ignore - autoTable is added by the import
  doc.autoTable({
    head: [headers],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 66, 66] },
    margin: { top: 15 },
    theme: 'grid'
  });

  doc.save(`${filename}.pdf`);
}

/**
 * Export campaign data to CSV
 * @param campaign The campaign to export
 * @param filename The name of the CSV file (without extension)
 */
export function exportCampaignToCSV(campaign: Campaign, filename: string) {
  // Basic campaign data
  const basicInfo = {
    "Campaign ID": campaign.id,
    "Campaign Name": campaign.name,
    "Type": campaign.type,
    "Status": campaign.status,
    "Start Date": campaign.startDate,
    "End Date": campaign.endDate || "Ongoing",
    "Budget": `$${campaign.budget.toFixed(2)}`,
    "Spent": `$${campaign.spent.toFixed(2)}`,
    "Revenue": `$${campaign.revenue.toFixed(2)}`,
    "ROI": `${((campaign.revenue / campaign.spent - 1) * 100).toFixed(1)}%`,
    "Impressions": campaign.impressions.toString(),
    "Clicks": campaign.clicks.toString(),
    "Conversions": campaign.conversions.toString(),
    "CTR": `${((campaign.clicks / campaign.impressions) * 100).toFixed(2)}%`,
    "Conversion Rate": `${((campaign.conversions / campaign.clicks) * 100).toFixed(2)}%`,
    "CPA": `$${(campaign.spent / campaign.conversions).toFixed(2)}`,
    "Customer Segment": campaign.segment,
    "Platform": campaign.platform,
    "Tags": campaign.tags.join(", ")
  };

  // Convert to CSV format
  let csvContent = Object.entries(basicInfo)
    .map(([key, value]) => `"${key}","${value}"`)
    .join('\n');

  // Add channel breakdown if available
  if (campaign.channelBreakdown && campaign.channelBreakdown.length > 0) {
    csvContent += '\n\n"Channel Breakdown"\n';
    csvContent += '"Channel","Budget","Spend","Revenue","ROI"\n';
    
    csvContent += campaign.channelBreakdown.map(channel => {
      const roi = ((channel.revenue / channel.spend - 1) * 100).toFixed(1);
      return `"${channel.channel}","$${(channel.budget || 0).toFixed(2)}","$${channel.spend.toFixed(2)}","$${channel.revenue.toFixed(2)}","${roi}%"`;
    }).join('\n');
  }

  // Add performance over time if available
  if (campaign.performanceOverTime && campaign.performanceOverTime.length > 0) {
    csvContent += '\n\n"Performance Over Time"\n';
    csvContent += '"Date","Spend","Revenue","Daily ROI"\n';
    
    csvContent += campaign.performanceOverTime.map(day => {
      const dailyRoi = ((day.revenue / day.spend - 1) * 100).toFixed(1);
      return `"${day.date}","$${day.spend.toFixed(2)}","$${day.revenue.toFixed(2)}","${dailyRoi}%"`;
    }).join('\n');
  }

  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export multiple campaigns to CSV
 * @param campaigns Array of campaigns to export
 * @param filename The name of the CSV file (without extension)
 */
export function exportCampaignsToCSV(campaigns: Campaign[], filename: string) {
  // Define headers
  const headers = [
    'Campaign ID', 
    'Campaign Name', 
    'Type', 
    'Status', 
    'Start Date', 
    'End Date', 
    'Budget', 
    'Spent',
    'Revenue', 
    'ROI', 
    'Impressions', 
    'Clicks', 
    'Conversions', 
    'CTR', 
    'Conversion Rate',
    'CPA',
    'Customer Segment',
    'Platform'
  ];
  
  // Create CSV content with headers
  let csvContent = headers.join(',') + '\n';
  
  // Add each campaign as a row
  csvContent += campaigns.map(campaign => {
    const roi = ((campaign.revenue / campaign.spent - 1) * 100).toFixed(1);
    const ctr = ((campaign.clicks / campaign.impressions) * 100).toFixed(2);
    const convRate = ((campaign.conversions / campaign.clicks) * 100).toFixed(2);
    const cpa = (campaign.spent / campaign.conversions).toFixed(2);
    
    return [
      `"${campaign.id}"`,
      `"${campaign.name}"`,
      `"${campaign.type}"`,
      `"${campaign.status}"`,
      `"${campaign.startDate}"`,
      `"${campaign.endDate || 'Ongoing'}"`,
      `$${campaign.budget.toFixed(2)}`,
      `$${campaign.spent.toFixed(2)}`,
      `$${campaign.revenue.toFixed(2)}`,
      `${roi}%`,
      campaign.impressions,
      campaign.clicks,
      campaign.conversions,
      `${ctr}%`,
      `${convRate}%`,
      `$${cpa}`,
      `"${campaign.segment}"`,
      `"${campaign.platform}"`
    ].join(',');
  }).join('\n');
  
  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
