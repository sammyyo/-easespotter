import { db } from "@db";
import { users, vendors, storeProfiles } from "@db/schema";
import { eq, isNull } from "drizzle-orm";

function buildStoreSlug(name: string, id: number) {
  const baseSlug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${baseSlug || "store"}-${id}`;
}

async function backfillUsersToStores() {
  console.log("Starting user/vendor/store backfill...");

  const usersWithoutVendor = await db
    .select()
    .from(users)
    .where(isNull(users.vendorId));

  let createdVendors = 0;
  let createdStoreProfiles = 0;

  for (const user of usersWithoutVendor) {
    const storeName = user.username?.trim() || `Store ${user.id}`;
    const uniqueVendorEmail = `${Date.now()}_${user.email}`;

    const { vendorId, hasStoreProfile } = await db.transaction(async (tx) => {
      const [vendor] = await tx
        .insert(vendors)
        .values({
          name: storeName,
          businessName: storeName,
          category: "other",
          email: uniqueVendorEmail,
          address: "",
          phone: "",
          currencyCode: "USD",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await tx
        .update(users)
        .set({
          vendorId: vendor.id,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      const [storeProfile] = await tx
        .insert(storeProfiles)
        .values({
          vendorId: vendor.id,
          name: storeName,
          description: `${storeName} is a store on EaseSpotter.`,
          slug: buildStoreSlug(storeName, vendor.id),
          storeType: "other",
          logoUrl: "/src/assets/EaseSpotter.png",
          isVerified: true,
          verificationDate: new Date(),
          socialLinks: {},
          businessHours: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return { vendorId: vendor.id, hasStoreProfile: Boolean(storeProfile) };
    });

    createdVendors += 1;
    if (hasStoreProfile) {
      createdStoreProfiles += 1;
    }

    console.log(`Backfilled user ${user.id} -> vendor ${vendorId}`);
  }

  const allUsers = await db.select().from(users);

  const usersNeedingStoreProfiles = allUsers.filter(
    (user) => user.vendorId !== null
  );

  for (const user of usersNeedingStoreProfiles) {
    const vendorId = user.vendorId!;
    const [existingStoreProfile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId))
      .limit(1);

    if (existingStoreProfile) {
      continue;
    }

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    if (!vendor) {
      console.warn(`Skipping user ${user.id}: vendor ${vendorId} not found`);
      continue;
    }

    const storeName = vendor.name?.trim() || user.username?.trim() || `Store ${vendorId}`;

    await db.insert(storeProfiles).values({
      vendorId,
      name: storeName,
      description: `${storeName} is a store on EaseSpotter.`,
      slug: buildStoreSlug(storeName, vendorId),
      storeType: vendor.category || "other",
      logoUrl: "/src/assets/EaseSpotter.png",
      isVerified: true,
      verificationDate: new Date(),
      socialLinks: {},
      businessHours: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    createdStoreProfiles += 1;
    console.log(`Created missing store profile for vendor ${vendorId}`);
  }

  console.log("Backfill complete.");
  console.log(`Created vendors: ${createdVendors}`);
  console.log(`Created store profiles: ${createdStoreProfiles}`);
}

backfillUsersToStores()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
