import { db, pool } from "./db";
import {
  customers,
  orders,
  orderItems,
  customerSegments,
  customerSegmentMemberships
} from "./db/schema";
import { sql } from "drizzle-orm";

async function seedCustomerSegmentData() {
  try {
    console.log("Seeding customer segment data...");

    // Generate sample customers
    const sampleCustomers = [
      {
        vendorId: 1,
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-123-4567',
        status: 'active',
        totalSpent: 1240.50,
        totalOrders: 8,
        createdAt: new Date('2023-02-15'),
        lastActive: new Date('2024-03-30')
      },
      {
        vendorId: 1,
        email: 'jane.smith@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '555-234-5678',
        status: 'active',
        totalSpent: 3420.75,
        totalOrders: 15,
        createdAt: new Date('2022-11-05'),
        lastActive: new Date('2024-04-01')
      },
      {
        vendorId: 1,
        email: 'bob.johnson@example.com',
        firstName: 'Bob',
        lastName: 'Johnson',
        phone: '555-345-6789',
        status: 'active',
        totalSpent: 89.99,
        totalOrders: 1,
        createdAt: new Date(new Date().setDate(new Date().getDate() - 20)),
        lastActive: new Date(new Date().setDate(new Date().getDate() - 20))
      },
      {
        vendorId: 1,
        email: 'alice.wong@example.com',
        firstName: 'Alice',
        lastName: 'Wong',
        phone: '555-456-7890',
        status: 'active',
        totalSpent: 2850.25,
        totalOrders: 12,
        createdAt: new Date('2023-04-18'),
        lastActive: new Date('2023-09-10')
      },
      {
        vendorId: 1,
        email: 'mike.davis@example.com',
        firstName: 'Mike',
        lastName: 'Davis',
        phone: '555-567-8901',
        status: 'active',
        totalSpent: 165.50,
        totalOrders: 2,
        createdAt: new Date(new Date().setDate(new Date().getDate() - 25)),
        lastActive: new Date(new Date().setDate(new Date().getDate() - 25))
      },
      {
        vendorId: 1,
        email: 'sarah.miller@example.com',
        firstName: 'Sarah',
        lastName: 'Miller',
        phone: '555-678-9012',
        status: 'active',
        totalSpent: 4120.99,
        totalOrders: 18,
        createdAt: new Date('2022-05-30'),
        lastActive: new Date('2024-03-15')
      },
      {
        vendorId: 1,
        email: 'david.brown@example.com',
        firstName: 'David',
        lastName: 'Brown',
        phone: '555-789-0123',
        status: 'active',
        totalSpent: 1875.25,
        totalOrders: 9,
        createdAt: new Date('2023-07-02'),
        lastActive: new Date('2023-11-20')
      },
      {
        vendorId: 1,
        email: 'emma.wilson@example.com',
        firstName: 'Emma',
        lastName: 'Wilson',
        phone: '555-890-1234',
        status: 'active',
        totalSpent: 3250.75,
        totalOrders: 14,
        createdAt: new Date('2023-01-15'),
        lastActive: new Date('2024-03-28')
      }
    ];

    // Insert customers
    for (const customer of sampleCustomers) {
      await pool.query(`
        INSERT INTO customers 
          (vendor_id, email, first_name, last_name, phone_number, status, total_spent, total_orders, created_at, last_active)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING
      `, [
        customer.vendorId,
        customer.email,
        customer.firstName,
        customer.lastName,
        customer.phone,
        customer.status,
        customer.totalSpent,
        customer.totalOrders,
        customer.createdAt,
        customer.lastActive
      ]);
    }

    console.log("Sample customers added");

    // Get customers
    const allCustomers = await db.select().from(customers).where(sql`vendor_id = 1`);
    console.log(`Found ${allCustomers.length} customers`);

    // Get segments
    const allSegments = await db.select().from(customerSegments).where(sql`vendor_id = 1`);
    console.log(`Found ${allSegments.length} segments`);

    // Map customers to segments based on conditions
    const customerMappings = [];

    for (const customer of allCustomers) {
      for (const segment of allSegments) {
        let shouldAdd = false;

        // Check segment type and apply condition logic
        if (segment.type === 'rfm') {
          // High Value Customers
          if (segment.name === 'High Value Customers' && customer.totalSpent > 2000) {
            shouldAdd = true;
          }
          // Frequent Shoppers
          else if (segment.name === 'Frequent Shoppers' && customer.totalOrders > 10) {
            shouldAdd = true;
          }
          // Recent Shoppers
          else if (segment.name === 'Recent Shoppers' && 
                   customer.lastActive && 
                   (new Date().getTime() - customer.lastActive.getTime()) < (60 * 24 * 60 * 60 * 1000)) { // Less than 60 days
            shouldAdd = true;
          }
          // At Risk Customers
          else if (segment.name === 'At Risk Customers' && 
                   customer.totalSpent > 1000 && 
                   customer.lastActive && 
                   (new Date().getTime() - customer.lastActive.getTime()) > (180 * 24 * 60 * 60 * 1000)) { // More than 180 days
            shouldAdd = true;
          }
        }
        // Behavioral
        else if (segment.type === 'behavioral') {
          // New Customers - first purchase in the last 30 days
          if (segment.name === 'New Customers' && 
              customer.createdAt && 
              (new Date().getTime() - customer.createdAt.getTime()) < (30 * 24 * 60 * 60 * 1000)) {
            shouldAdd = true;
          }
        }

        if (shouldAdd) {
          customerMappings.push({
            segmentId: segment.id,
            customerId: customer.id
          });
        }
      }
    }

    // Insert customer segment memberships
    for (const mapping of customerMappings) {
      await pool.query(`
        INSERT INTO customer_segment_memberships 
          (segment_id, customer_id)
        VALUES 
          ($1, $2)
        ON CONFLICT DO NOTHING
      `, [mapping.segmentId, mapping.customerId]);
    }

    console.log(`Added ${customerMappings.length} customer-segment memberships`);

    // Update the customer_count in each segment
    for (const segment of allSegments) {
      const membershipCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(customerSegmentMemberships)
        .where(sql`segment_id = ${segment.id}`);
      
      await db
        .update(customerSegments)
        .set({ customerCount: membershipCount[0].count })
        .where(sql`id = ${segment.id}`);
    }

    console.log("Updated segment customer counts");

    return true;
  } catch (error) {
    console.error("Error seeding customer segment data:", error);
    return false;
  }
}

// Execute the function
seedCustomerSegmentData()
  .then(() => {
    console.log("Customer segment seeding complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error running customer segment seeding:", err);
    process.exit(1);
  });