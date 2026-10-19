import { db } from './db';
import { vendors, users } from './db/schema';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

async function seedDatabase() {
  console.log('Seeding database with test users...');
  
  try {
    // Create vendor if it doesn't exist
    let vendorId = 1;
    const existingVendors = await db.select().from(vendors);
    
    if (existingVendors.length === 0) {
      console.log('Creating test vendor...');
      const [vendor] = await db.insert(vendors).values({
        name: 'Test Vendor',
        email: 'test@example.com',
        businessName: 'Test Store Inc.',
        address: '123 Test St, Test City',
        phone: '555-1234',
        status: 'active'
      }).returning();
      
      vendorId = vendor.id;
      console.log(`Created vendor with ID: ${vendorId}`);
    } else {
      vendorId = existingVendors[0].id;
    }
    
    // Check if users exist
    const existingUsers = await db.select().from(users);
    
    if (existingUsers.length === 0) {
      // Create admin user
      const adminUser = await db.insert(users).values({
        username: 'admin',
        email: 'admin@example.com',
        password: await hashPassword('password'),
        role: 'admin',
        vendorId: vendorId,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      // Create regular user
      const regularUser = await db.insert(users).values({
        username: 'user',
        email: 'user@example.com',
        password: await hashPassword('password'),
        role: 'user',
        vendorId: vendorId,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      console.log('Created test users:');
      console.log('- admin / password');
      console.log('- user / password');
    } else {
      console.log('Users already exist in the database');
    }
    
    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    process.exit(0);
  }
}

seedDatabase();