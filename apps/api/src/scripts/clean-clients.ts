import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { db } from '../db';
import { tenants, users, subscriptions, verificationTokens } from '../db/schema';
import { eq, ne } from 'drizzle-orm';

async function cleanClients() {
  console.log('Fetching non-admin users/tenants...');
  
  // Find non-admin users (CLIENT_OWNER, CLIENT_VIEWER)
  const clientUsers = await db.query.users.findMany({
    where: ne(users.role, 'ADMIN'),
  });
  
  console.log(`Found ${clientUsers.length} non-admin user(s):`, clientUsers.map(u => ({ id: u.id, email: u.email, tenantId: u.tenantId })));
  
  for (const user of clientUsers) {
    if (user.tenantId) {
      console.log(`Deleting verification tokens for user ${user.id}...`);
      await db.delete(verificationTokens).where(eq(verificationTokens.userId, user.id));
      
      console.log(`Deleting subscriptions for tenant ${user.tenantId}...`);
      await db.delete(subscriptions).where(eq(subscriptions.tenantId, user.tenantId));
      
      console.log(`Deleting user ${user.id}...`);
      await db.delete(users).where(eq(users.id, user.id));
      
      console.log(`Deleting tenant ${user.tenantId}...`);
      await db.delete(tenants).where(eq(tenants.id, user.tenantId));
    } else {
      console.log(`Deleting user ${user.id}...`);
      await db.delete(users).where(eq(users.id, user.id));
    }
  }
  
  // Also check if any orphaned tenants exist without admin
  const allTenants = await db.query.tenants.findMany();
  console.log(`Remaining tenants count: ${allTenants.length}`);
  
  console.log('Cleanup completed successfully!');
  process.exit(0);
}

cleanClients().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
