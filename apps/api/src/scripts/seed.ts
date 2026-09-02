import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants, users } from '../db/schema';
import { hashPassword } from '../lib/password';
import { templateService } from '../services/template';

const DEV_ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL || 'admin@nextlite.local';
const DEV_ADMIN_PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'admin123456';
const DEV_ADMIN_NAME = process.env.DEV_ADMIN_NAME || 'NextLite Admin';

async function seed() {
  console.log('🌱 Seeding development admin account...\n');
  
  // Check if admin already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, DEV_ADMIN_EMAIL),
  });
  
  if (existingUser) {
    console.log(`✅ Admin account already exists: ${DEV_ADMIN_EMAIL}`);
    console.log('   Skipping admin creation.\n');
  } else {
    // Create admin tenant
    const tenantNow = new Date();
    const [tenant] = await db.insert(tenants).values({
      name: 'NextLite Admin',
      slug: 'nextlite-admin',
      status: 'active',
      createdAt: tenantNow,
      updatedAt: tenantNow,
    }).returning();
    
    console.log(`✅ Created tenant: ${tenant.name} (${tenant.id})`);
    
    // Create admin user
    const passwordHash = await hashPassword(DEV_ADMIN_PASSWORD);
    const userNow = new Date();
    const [user] = await db.insert(users).values({
      tenantId: tenant.id,
      email: DEV_ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
      emailVerified: true, // Dev admin is pre-verified
      createdAt: userNow,
      updatedAt: userNow,
    }).returning();
    
    console.log(`✅ Created admin user: ${user.email} (${user.id})`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Email verified: ${user.emailVerified}\n`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Development admin account created!\n');
    console.log('   Email:    ' + DEV_ADMIN_EMAIL);
    console.log('   Password: ' + DEV_ADMIN_PASSWORD);
    console.log('   Role:     ADMIN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  // Seed agent templates
  await templateService.seedTemplates();

  process.exit(0);
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
