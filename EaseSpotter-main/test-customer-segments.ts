import { db } from "./db";
import { customerSegments, customerSegmentMemberships } from "./db/schema";
import { eq, sql } from "drizzle-orm";

async function testCustomerSegments() {
  console.log("Testing customer segments data access...");
  
  try {
    // Check if the customer_segments table exists and has data
    console.log("Checking customer_segments table...");
    const segments = await db.select().from(customerSegments);
    console.log(`Found ${segments.length} customer segments:`);
    console.table(segments.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      vendorId: s.vendorId,
      customerCount: s.customerCount
    })));

    // Check if the customer_segment_memberships table exists and has data
    console.log("\nChecking customer_segment_memberships table...");
    const memberships = await db.select().from(customerSegmentMemberships);
    console.log(`Found ${memberships.length} segment memberships:`);
    console.table(memberships.map(m => ({
      id: m.id,
      segmentId: m.segmentId,
      customerId: m.customerId
    })));

    // Check each segment's membership count
    console.log("\nChecking membership counts for each segment...");
    for (const segment of segments) {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(customerSegmentMemberships)
        .where(eq(customerSegmentMemberships.segmentId, segment.id));
      
      // Convert the count to a number because it might be returned as a string or object
      const memberCount = parseInt(String(result[0]?.count || '0'), 10);
      console.log(`Segment ${segment.id} (${segment.name}): ${memberCount} members, stored count: ${segment.customerCount}`);
    }

    return true;
  } catch (error) {
    console.error("Error testing customer segments:", error);
    return false;
  }
}

// Run the test
testCustomerSegments()
  .then(() => {
    console.log("Test completed");
    process.exit(0);
  })
  .catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
  });