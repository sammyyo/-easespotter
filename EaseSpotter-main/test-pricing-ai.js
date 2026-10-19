// Simple script to test the AI pricing assistant endpoint
import fetch from 'node-fetch';

async function testAIAssistant() {
  try {
    // Login first to get a session
    console.log('Logging in...');
    const loginRes = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'password'
      }),
      credentials: 'include'
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.statusText}`);
    }

    const loginData = await loginRes.json();
    console.log('Login successful:', loginData.username);

    const cookies = loginRes.headers.get('set-cookie');

    // Now call the AI recommendation endpoint
    console.log('\nTesting AI Recommendation endpoint...');
    const aiRes = await fetch('http://localhost:5000/api/pricing/ai-recommendation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      },
      body: JSON.stringify({
        category: 'electronics',
        targetMargin: 35,
        competitorFocus: true,
        demandElasticity: 6,
        marketShare: true,
        prompt: 'Please consider seasonal factors in your recommendation.'
      }),
      credentials: 'include'
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      throw new Error(`AI recommendation request failed: ${aiRes.statusText}\n${errorText}`);
    }

    const result = await aiRes.json();
    console.log('\nAI Recommendation Result:');
    console.log('Recommended Price Adjustment:', result.recommendation?.optimalPriceAdjustment);
    console.log('Confidence:', result.recommendation?.confidence + '%');
    console.log('\nRationale:', result.recommendation?.rationale);
    
    console.log('\nInsights:');
    result.insights?.forEach((insight, i) => {
      console.log(`${i + 1}. ${insight}`);
    });
    
    console.log('\nCompetitor Analysis:');
    console.log('Positioning:', result.competitorAnalysis?.positioningSummary);
    console.log('Price Gap:', result.competitorAnalysis?.priceGap);
    
    console.log('\nWhat-if Scenarios:');
    result.whatIfScenarios?.forEach(scenario => {
      console.log(`\n${scenario.name} (${scenario.priceChange}):`);
      console.log(`  Revenue: ${scenario.estimatedImpact?.revenue}`);
      console.log(`  Margin: ${scenario.estimatedImpact?.margin}`);
      console.log(`  Sales Volume: ${scenario.estimatedImpact?.salesVolume}`);
      console.log(`  Total Profit: ${scenario.estimatedImpact?.totalProfit}`);
      console.log(`  Risk Level: ${scenario.riskLevel}`);
    });
    
  } catch (error) {
    console.error('Error testing AI assistant:', error);
  }
}

testAIAssistant();