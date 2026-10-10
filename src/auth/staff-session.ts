import type { StaffRole } from '../generated/prisma/client.js';

export interface StaffSession {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  branchId: string | null;
  business: { id: string; name: string; slug: string };
}
