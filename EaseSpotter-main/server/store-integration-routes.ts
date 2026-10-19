import { publicStoreLocationSchema, emptyStoreLocation } from "../shared/store-location";
import { storeLocationRoutes } from "./store-location-routes";
import { Request, Response, Router } from "express";
import { db } from "@db";
import {
  storeProfiles,
  storeFollowers,
  enhancedPromotions,
  storeIntegrationLogs,
  storeNotifications,
  storeProducts,
  insertStoreProfileSchema,
  insertStoreFollowerSchema,
  insertEnhancedPromotionSchema,
  insertStoreNotificationSchema,
  insertStoreProductSchema,
  users,
  vendors,
} from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import * as integrations from "./api-integrations";
import { persistImageDataUrl, removePersistedUpload } from "./image-storage";

const router = Router();
router.use(storeLocationRoutes(async () => db.select({
  vendorId: vendors.id,
  name: storeProfiles.name,
  businessName: vendors.businessName,
  logoUrl: storeProfiles.logoUrl,
  integrationSettings: storeProfiles.integrationSettings,
}).from(vendors).innerJoin(storeProfiles, eq(vendors.id, storeProfiles.vendorId))
  .where(eq(vendors.status, "active"))));

const parseIntegrationSettings = (settings: unknown): Record<string, any> => {
  if (!settings) return {};
  if (typeof settings === "string") {
    try {
      const parsed = JSON.parse(settings);
      return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }

  return typeof settings === "object" ? settings as Record<string, any> : {};
};

const getLocationLabels = (settings: Record<string, any>) => {
  const locationLabels = settings.locationLabels && typeof settings.locationLabels === "object"
    ? settings.locationLabels as Record<string, any>
    : {};

  return {
    primary: typeof locationLabels.primary === "string" && locationLabels.primary.trim()
      ? locationLabels.primary.trim()
      : "Aisle",
    secondary: typeof locationLabels.secondary === "string" && locationLabels.secondary.trim()
      ? locationLabels.secondary.trim()
      : "Shelf",
  };
};

const withLocationLabelFields = <T extends { integrationSettings?: unknown }>(profile: T) => {
  const integrationSettings = parseIntegrationSettings(profile.integrationSettings);
  const locationLabels = getLocationLabels(integrationSettings);
  const location = publicStoreLocationSchema.safeParse(integrationSettings.publicLocation);

  return {
    ...profile,
    integrationSettings,
    publicLocation: location.success ? location.data : emptyStoreLocation,
    locationLabelPrimary: locationLabels.primary,
    locationLabelSecondary: locationLabels.secondary,
  };
};

// Middleware to verify authentication
const isAuthenticated = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
};

// Get store profile for the vendor
router.get("/profile", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    return res.status(200).json(withLocationLabelFields(profile));
  } catch (error) {
    console.error("Error fetching store profile:", error);
    return res.status(500).json({ error: "Failed to fetch store profile" });
  }
});

// Create or update store profile
router.post("/profile", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }
    
    // Handle brandImageUrl to logoUrl mapping for backward compatibility
    let updatedData = { ...req.body };
    if (updatedData.brandImageUrl) {
      updatedData.logoUrl = updatedData.brandImageUrl;
      delete updatedData.brandImageUrl; // Remove brandImageUrl to avoid validation errors
    }

    const locationLabelPrimary = typeof updatedData.locationLabelPrimary === "string" && updatedData.locationLabelPrimary.trim()
      ? updatedData.locationLabelPrimary.trim()
      : "Aisle";
    const locationLabelSecondary = typeof updatedData.locationLabelSecondary === "string" && updatedData.locationLabelSecondary.trim()
      ? updatedData.locationLabelSecondary.trim()
      : "Shelf";
    delete updatedData.locationLabelPrimary;
    delete updatedData.locationLabelSecondary;
    
    // Generate a slug from the store name
    if (updatedData.name) {
      updatedData.slug = updatedData.name.toLowerCase().replace(/\s+/g, '-');
    }

    const [existingProfile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    const existingIntegrationSettings = parseIntegrationSettings(existingProfile?.integrationSettings);

    const locationResult = publicStoreLocationSchema.safeParse(
      updatedData.publicLocation ?? existingIntegrationSettings.publicLocation ?? emptyStoreLocation,
    );
    if (!locationResult.success) {
      return res.status(400).json({error: fromZodError(locationResult.error).message});
    }
    delete updatedData.publicLocation;

    updatedData.integrationSettings = {
      ...existingIntegrationSettings,
      ...(updatedData.integrationSettings && typeof updatedData.integrationSettings === "object" ? updatedData.integrationSettings : {}),
      publicLocation: locationResult.data,
      locationLabels: {
        primary: locationLabelPrimary,
        secondary: locationLabelSecondary,
      },
    };

    const validationResult = insertStoreProfileSchema.safeParse({
      ...updatedData,
      vendorId,
    });

    if (!validationResult.success) {
      const errorMessage = fromZodError(validationResult.error).message;
      return res.status(400).json({ error: errorMessage });
    }

    // Generate a slug from the store name if not provided
    const storeName = validationResult.data.name;
    const storeSlug = validationResult.data.slug || 
      storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let profile;
    if (existingProfile) {
      // Update existing profile with slug
      [profile] = await db
        .update(storeProfiles)
        .set({
          ...validationResult.data,
          slug: storeSlug,
          updatedAt: new Date(),
        })
        .where(eq(storeProfiles.id, existingProfile.id))
        .returning();
    } else {
      // Create new profile with slug
      [profile] = await db
        .insert(storeProfiles)
        .values({
          ...validationResult.data,
          slug: storeSlug,
          vendorId,
        })
        .returning();

      // Log the integration setup
      await db.insert(storeIntegrationLogs).values({
        vendorId,
        integrationType: validationResult.data.integrationType || "manual",
        action: "setup",
        status: "success",
        details: { profileId: profile.id },
        errorMessage: null, // Add the missing errorMessage field
        timestamp: new Date(),
      });
    }

    await db
      .update(vendors)
      .set({
        name: storeName,
        businessName: storeName,
        updatedAt: new Date(),
      })
      .where(eq(vendors.id, vendorId));

    return res.status(200).json(withLocationLabelFields(profile));
  } catch (error) {
    console.error("Error saving store profile:", error);
    return res.status(500).json({ error: "Failed to save store profile" });
  }
});

// Get store followers
router.get("/followers", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const followers = await db
      .select({
        id: storeFollowers.id,
        userId: storeFollowers.userId,
        followDate: storeFollowers.followDate,
        notificationPreferences: storeFollowers.notificationPreferences,
        status: storeFollowers.status,
        lastNotified: storeFollowers.lastNotified,
        username: users.username,
        email: users.email,
      })
      .from(storeFollowers)
      .innerJoin(users, eq(storeFollowers.userId, users.id))
      .where(eq(storeFollowers.storeId, profile.id))
      .orderBy(desc(storeFollowers.followDate));

    return res.status(200).json(followers);
  } catch (error) {
    console.error("Error fetching store followers:", error);
    return res.status(500).json({ error: "Failed to fetch store followers" });
  }
});

// Add a follower to a store
router.post("/followers", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { storeId, notificationPreferences } = req.body;

    if (!userId || !storeId) {
      return res.status(400).json({ error: "User ID and Store ID are required" });
    }

    const validationResult = insertStoreFollowerSchema.safeParse({
      userId,
      storeId,
      notificationPreferences,
    });

    if (!validationResult.success) {
      const errorMessage = fromZodError(validationResult.error).message;
      return res.status(400).json({ error: errorMessage });
    }

    // Check if already following
    const [existingFollower] = await db
      .select()
      .from(storeFollowers)
      .where(
        and(
          eq(storeFollowers.userId, userId),
          eq(storeFollowers.storeId, storeId)
        )
      );

    if (existingFollower) {
      return res.status(400).json({ error: "Already following this store" });
    }

    const [follower] = await db
      .insert(storeFollowers)
      .values(validationResult.data)
      .returning();

    return res.status(201).json(follower);
  } catch (error) {
    console.error("Error adding store follower:", error);
    return res.status(500).json({ error: "Failed to add store follower" });
  }
});

// Unfollow a store
router.delete("/followers/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const followerId = parseInt(req.params.id);

    if (!userId || isNaN(followerId)) {
      return res.status(400).json({ error: "Valid follower ID is required" });
    }

    // Verify ownership of the follower relationship
    const [existingFollower] = await db
      .select()
      .from(storeFollowers)
      .where(
        and(
          eq(storeFollowers.id, followerId),
          eq(storeFollowers.userId, userId)
        )
      );

    if (!existingFollower) {
      return res.status(404).json({ error: "Follower relationship not found" });
    }

    await db
      .delete(storeFollowers)
      .where(eq(storeFollowers.id, followerId));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error removing store follower:", error);
    return res.status(500).json({ error: "Failed to remove store follower" });
  }
});

// Update follower notification preferences
router.patch("/followers/:id/preferences", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const followerId = parseInt(req.params.id);
    const { notificationPreferences } = req.body;

    if (!userId || isNaN(followerId) || !notificationPreferences) {
      return res.status(400).json({ error: "Valid follower ID and notification preferences are required" });
    }

    // Verify ownership of the follower relationship
    const [existingFollower] = await db
      .select()
      .from(storeFollowers)
      .where(
        and(
          eq(storeFollowers.id, followerId),
          eq(storeFollowers.userId, userId)
        )
      );

    if (!existingFollower) {
      return res.status(404).json({ error: "Follower relationship not found" });
    }

    const [updatedFollower] = await db
      .update(storeFollowers)
      .set({
        notificationPreferences,
      })
      .where(eq(storeFollowers.id, followerId))
      .returning();

    return res.status(200).json(updatedFollower);
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

// Get enhanced promotions
router.get("/promotions", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const promotions = await db
      .select()
      .from(enhancedPromotions)
      .where(eq(enhancedPromotions.vendorId, vendorId))
      .orderBy(desc(enhancedPromotions.createdAt));

    return res.status(200).json(promotions);
  } catch (error) {
    console.error("Error fetching enhanced promotions:", error);
    return res.status(500).json({ error: "Failed to fetch enhanced promotions" });
  }
});

// Create a new enhanced promotion
router.post("/promotions", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const validationResult = insertEnhancedPromotionSchema.safeParse({
      ...req.body,
      vendorId,
    });

    if (!validationResult.success) {
      const errorMessage = fromZodError(validationResult.error).message;
      return res.status(400).json({ error: errorMessage });
    }

    const [promotion] = await db
      .insert(enhancedPromotions)
      .values(validationResult.data)
      .returning();

    return res.status(201).json(promotion);
  } catch (error) {
    console.error("Error creating enhanced promotion:", error);
    return res.status(500).json({ error: "Failed to create enhanced promotion" });
  }
});

// Get a specific enhanced promotion
router.get("/promotions/:id", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    const promotionId = parseInt(req.params.id);

    if (!vendorId || isNaN(promotionId)) {
      return res.status(400).json({ error: "Valid promotion ID is required" });
    }

    const [promotion] = await db
      .select()
      .from(enhancedPromotions)
      .where(
        and(
          eq(enhancedPromotions.id, promotionId),
          eq(enhancedPromotions.vendorId, vendorId)
        )
      );

    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    return res.status(200).json(promotion);
  } catch (error) {
    console.error("Error fetching enhanced promotion:", error);
    return res.status(500).json({ error: "Failed to fetch enhanced promotion" });
  }
});

// Update an enhanced promotion
router.put("/promotions/:id", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    const promotionId = parseInt(req.params.id);

    if (!vendorId || isNaN(promotionId)) {
      return res.status(400).json({ error: "Valid promotion ID is required" });
    }

    // Check if promotion exists and belongs to vendor
    const [existingPromotion] = await db
      .select()
      .from(enhancedPromotions)
      .where(
        and(
          eq(enhancedPromotions.id, promotionId),
          eq(enhancedPromotions.vendorId, vendorId)
        )
      );

    if (!existingPromotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const validationResult = insertEnhancedPromotionSchema.safeParse({
      ...req.body,
      vendorId,
    });

    if (!validationResult.success) {
      const errorMessage = fromZodError(validationResult.error).message;
      return res.status(400).json({ error: errorMessage });
    }

    const [updatedPromotion] = await db
      .update(enhancedPromotions)
      .set({
        ...validationResult.data,
        updatedAt: new Date(),
      })
      .where(eq(enhancedPromotions.id, promotionId))
      .returning();

    return res.status(200).json(updatedPromotion);
  } catch (error) {
    console.error("Error updating enhanced promotion:", error);
    return res.status(500).json({ error: "Failed to update enhanced promotion" });
  }
});

// Delete an enhanced promotion
router.delete("/promotions/:id", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    const promotionId = parseInt(req.params.id);

    if (!vendorId || isNaN(promotionId)) {
      return res.status(400).json({ error: "Valid promotion ID is required" });
    }

    // Check if promotion exists and belongs to vendor
    const [existingPromotion] = await db
      .select()
      .from(enhancedPromotions)
      .where(
        and(
          eq(enhancedPromotions.id, promotionId),
          eq(enhancedPromotions.vendorId, vendorId)
        )
      );

    if (!existingPromotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    await db
      .delete(enhancedPromotions)
      .where(eq(enhancedPromotions.id, promotionId));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting enhanced promotion:", error);
    return res.status(500).json({ error: "Failed to delete enhanced promotion" });
  }
});

// Get notifications for the current user
router.get("/notifications", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const notifications = await db
      .select()
      .from(storeNotifications)
      .where(eq(storeNotifications.userId, userId))
      .orderBy(desc(storeNotifications.createdAt));

    return res.status(200).json(notifications);
  } catch (error) {
    console.error("Error fetching store notifications:", error);
    return res.status(500).json({ error: "Failed to fetch store notifications" });
  }
});

// Mark a notification as read
router.patch("/notifications/:id/read", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    const notificationId = parseInt(req.params.id);

    if (!userId || isNaN(notificationId)) {
      return res.status(400).json({ error: "Valid notification ID is required" });
    }

    // Check if notification exists and belongs to user
    const [existingNotification] = await db
      .select()
      .from(storeNotifications)
      .where(
        and(
          eq(storeNotifications.id, notificationId),
          eq(storeNotifications.userId, userId)
        )
      );

    if (!existingNotification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const [updatedNotification] = await db
      .update(storeNotifications)
      .set({
        isRead: true,
      })
      .where(eq(storeNotifications.id, notificationId))
      .returning();

    return res.status(200).json(updatedNotification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Get store products for a specific store profile
router.get("/products", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    // Get products for this store
    const products = await db
      .select()
      .from(storeProducts)
      .where(eq(storeProducts.storeId, profile.id))
      .orderBy(desc(storeProducts.createdAt));

    return res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching store products:", error);
    return res.status(500).json({ error: "Failed to fetch store products" });
  }
});

// Get a specific store product
router.get("/products/:id", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    const productId = parseInt(req.params.id);

    if (!vendorId || isNaN(productId)) {
      return res.status(400).json({ error: "Valid product ID is required" });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    // Get specific product
    const [product] = await db
      .select()
      .from(storeProducts)
      .where(
        and(
          eq(storeProducts.id, productId),
          eq(storeProducts.storeId, profile.id)
        )
      );

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching store product:", error);
    return res.status(500).json({ error: "Failed to fetch store product" });
  }
});

// Create a new store product
router.post("/products", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const requestBody = {
      ...req.body,
      sku: typeof req.body.sku === "string" && req.body.sku.trim() === "" ? undefined : req.body.sku,
    };

    const validationResult = insertStoreProductSchema.safeParse({
      ...requestBody,
      storeId: profile.id,
    });

    if (!validationResult.success) {
      const errorMessage = fromZodError(validationResult.error).message;
      return res.status(400).json({ error: errorMessage });
    }

    // Check if we need to set currentPrice = basePrice if not provided
    let productData = validationResult.data;

    if (productData.imageUrl) {
      const persistedImageUrl = await persistImageDataUrl(
        productData.imageUrl,
        "products",
        `store-${profile.id}-${productData.sku || productData.name}`,
      );
      if (persistedImageUrl) {
        productData.imageUrl = persistedImageUrl;
      }
    }
    
    // Ensure basePrice and currentPrice are strings
    if (productData.basePrice && typeof productData.basePrice !== 'string') {
      productData.basePrice = String(productData.basePrice);
    }
    
    if (!productData.currentPrice && productData.basePrice) {
      productData.currentPrice = productData.basePrice;
    } else if (productData.currentPrice && typeof productData.currentPrice !== 'string') {
      productData.currentPrice = String(productData.currentPrice);
    }
    
    console.log("Inserting store product with data:", {
      ...productData,
      basePrice: typeof productData.basePrice,
      currentPrice: typeof productData.currentPrice
    });

    const [product] = await db
      .insert(storeProducts)
      .values(productData)
      .returning();

    return res.status(201).json(product);
  } catch (error: any) {
    console.error("Error creating store product:", error);
    if (error.status === 413) {
      return res.status(413).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to create store product" });
  }
});

// Update a store product
router.put("/products/:id", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    const productId = parseInt(req.params.id);

    if (!vendorId || isNaN(productId)) {
      return res.status(400).json({ error: "Valid product ID is required" });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    // Check if product exists and belongs to this store
    const [existingProduct] = await db
      .select()
      .from(storeProducts)
      .where(
        and(
          eq(storeProducts.id, productId),
          eq(storeProducts.storeId, profile.id)
        )
      );

    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    const requestBody = {
      ...req.body,
      sku: typeof req.body.sku === "string" && req.body.sku.trim() === "" ? undefined : req.body.sku,
    };

    const validationResult = insertStoreProductSchema.safeParse({
      ...requestBody,
      storeId: profile.id,
    });

    if (!validationResult.success) {
      const errorMessage = fromZodError(validationResult.error).message;
      return res.status(400).json({ error: errorMessage });
    }

    // Ensure basePrice and currentPrice are strings for database consistency
    let productData = validationResult.data;
    let shouldRemoveExistingImage = false;

    if (productData.imageUrl) {
      const persistedImageUrl = await persistImageDataUrl(
        productData.imageUrl,
        "products",
        `store-${profile.id}-product-${productId}`,
      );
      if (persistedImageUrl) {
        productData.imageUrl = persistedImageUrl;
      }
      shouldRemoveExistingImage = Boolean(
        existingProduct.imageUrl
        && productData.imageUrl
        && existingProduct.imageUrl !== productData.imageUrl
      );
    }
    
    if (productData.basePrice && typeof productData.basePrice !== 'string') {
      productData.basePrice = String(productData.basePrice);
    }
    
    if (productData.currentPrice && typeof productData.currentPrice !== 'string') {
      productData.currentPrice = String(productData.currentPrice);
    }
    
    const [updatedProduct] = await db
      .update(storeProducts)
      .set({
        ...productData,
        updatedAt: new Date(),
      })
      .where(eq(storeProducts.id, productId))
      .returning();

    if (shouldRemoveExistingImage) {
      await removePersistedUpload(existingProduct.imageUrl);
    }

    return res.status(200).json(updatedProduct);
  } catch (error: any) {
    console.error("Error updating store product:", error);
    if (error.status === 413) {
      return res.status(413).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update store product" });
  }
});

// Delete a store product
router.delete("/products/:id", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    const productId = parseInt(req.params.id);

    if (!vendorId || isNaN(productId)) {
      return res.status(400).json({ error: "Valid product ID is required" });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    // Check if product exists and belongs to this store
    const [existingProduct] = await db
      .select()
      .from(storeProducts)
      .where(
        and(
          eq(storeProducts.id, productId),
          eq(storeProducts.storeId, profile.id)
        )
      );

    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    await db
      .delete(storeProducts)
      .where(eq(storeProducts.id, productId));

    await removePersistedUpload(existingProduct.imageUrl);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting store product:", error);
    return res.status(500).json({ error: "Failed to delete store product" });
  }
});

// Get store integration logs
router.get("/integration-logs", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    const isAdmin = req.user?.role === "admin";

    if (!vendorId || !isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const logs = await db
      .select()
      .from(storeIntegrationLogs)
      .where(eq(storeIntegrationLogs.vendorId, vendorId))
      .orderBy(desc(storeIntegrationLogs.timestamp));

    return res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching integration logs:", error);
    return res.status(500).json({ error: "Failed to fetch integration logs" });
  }
});

// Shopify Integration Endpoints
// Test Shopify API connection
router.post("/shopify/test-connection", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { apiKey, apiSecret, storeUrl, accessToken } = req.body;
    
    if (!storeUrl || !accessToken) {
      return res.status(400).json({ 
        error: "Store URL and access token are required for Shopify integration" 
      });
    }

    const credentials = { apiKey, apiSecret, storeUrl, accessToken };
    const isConnected = await integrations.testShopifyConnection(credentials, vendorId);

    if (isConnected) {
      return res.status(200).json({ success: true, message: "Connection successful" });
    } else {
      return res.status(400).json({ success: false, message: "Failed to connect to Shopify" });
    }
  } catch (error) {
    console.error("Error testing Shopify connection:", error);
    return res.status(500).json({ 
      error: "Failed to test Shopify connection", 
      message: error.message 
    });
  }
});

// Import products from Shopify
router.post("/shopify/import-products", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { apiKey, apiSecret, storeUrl, accessToken } = req.body;
    
    if (!storeUrl || !accessToken) {
      return res.status(400).json({ 
        error: "Store URL and access token are required for Shopify integration" 
      });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const credentials = { apiKey, apiSecret, storeUrl, accessToken };
    const importedProducts = await integrations.importShopifyProducts(
      credentials, 
      vendorId,
      profile.id
    );

    return res.status(200).json({ 
      success: true, 
      message: `Successfully imported ${importedProducts.length} products from Shopify`,
      products: importedProducts 
    });
  } catch (error) {
    console.error("Error importing Shopify products:", error);
    return res.status(500).json({ 
      error: "Failed to import products from Shopify", 
      message: error.message 
    });
  }
});

// Save Shopify credentials
router.post("/shopify/save-credentials", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { apiKey, apiSecret, storeUrl, accessToken } = req.body;
    
    if (!storeUrl || !accessToken) {
      return res.status(400).json({ 
        error: "Store URL and access token are required for Shopify integration" 
      });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    // Update store profile with Shopify integration settings
    const updatedProfile = await db
      .update(storeProfiles)
      .set({
        integrationType: "shopify",
        integrationSettings: JSON.stringify({
          shopifyStoreUrl: storeUrl,
          shopifyApiKey: apiKey,
          // Don't store secret in plain text in production
          shopifyAccessToken: accessToken
        }),
        updatedAt: new Date()
      })
      .where(eq(storeProfiles.id, profile.id))
      .returning();

    // Log the integration setup
    await db.insert(storeIntegrationLogs).values({
      vendorId,
      integrationType: "shopify",
      action: "save_credentials",
      status: "success",
      details: { storeUrl },
      errorMessage: null,
      timestamp: new Date(),
    });

    return res.status(200).json({ 
      success: true, 
      message: "Shopify credentials saved successfully",
      profile: updatedProfile[0]
    });
  } catch (error) {
    console.error("Error saving Shopify credentials:", error);
    return res.status(500).json({ 
      error: "Failed to save Shopify credentials", 
      message: error.message 
    });
  }
});

// WooCommerce Integration Endpoints
// Test WooCommerce API connection
router.post("/woocommerce/test-connection", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { siteUrl, consumerKey, consumerSecret } = req.body;
    
    if (!siteUrl || !consumerKey || !consumerSecret) {
      return res.status(400).json({ 
        error: "Site URL, consumer key and consumer secret are required for WooCommerce integration" 
      });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const connectionResult = await integrations.testWooCommerceConnection(
      profile.id,
      vendorId,
      siteUrl,
      consumerKey,
      consumerSecret
    );

    return res.status(200).json(connectionResult);
  } catch (error) {
    console.error("Error testing WooCommerce connection:", error);
    return res.status(500).json({ 
      success: false,
      error: "Failed to test WooCommerce connection", 
      message: error.message 
    });
  }
});

// Import products from WooCommerce
router.post("/woocommerce/import-products", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { siteUrl, consumerKey, consumerSecret } = req.body;
    
    if (!siteUrl || !consumerKey || !consumerSecret) {
      return res.status(400).json({ 
        error: "Site URL, consumer key and consumer secret are required for WooCommerce integration" 
      });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const importResult = await integrations.importWooCommerceProducts(
      profile.id,
      vendorId,
      siteUrl,
      consumerKey,
      consumerSecret
    );

    return res.status(200).json(importResult);
  } catch (error) {
    console.error("Error importing WooCommerce products:", error);
    return res.status(500).json({ 
      success: false,
      error: "Failed to import products from WooCommerce", 
      message: error.message 
    });
  }
});

// Save WooCommerce credentials
router.post("/woocommerce/save-credentials", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { siteUrl, consumerKey, consumerSecret } = req.body;
    
    if (!siteUrl || !consumerKey) {
      return res.status(400).json({ 
        error: "Site URL and consumer key are required for WooCommerce integration" 
      });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const saveResult = await integrations.saveWooCommerceCredentials(
      profile.id,
      vendorId,
      siteUrl,
      consumerKey,
      consumerSecret
    );

    return res.status(200).json(saveResult);
  } catch (error) {
    console.error("Error saving WooCommerce credentials:", error);
    return res.status(500).json({ 
      success: false,
      error: "Failed to save WooCommerce credentials", 
      message: error.message 
    });
  }
});

// Magento API routes
router.post("/magento/test-connection", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { url, apiKey, secretKey } = req.body;
    
    if (!url || !apiKey || !secretKey) {
      return res.status(400).json({ 
        error: "URL, API key and secret key are required for Magento integration" 
      });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const result = await integrations.testMagentoConnection(
      url,
      apiKey,
      secretKey,
      profile.id
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Magento test connection error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/magento/import-products", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { url, apiKey, secretKey } = req.body;
    
    if (!url || !apiKey || !secretKey) {
      return res.status(400).json({ 
        error: "URL, API key and secret key are required for Magento integration" 
      });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const result = await integrations.importMagentoProducts(
      url,
      apiKey,
      secretKey,
      profile.id
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Magento import products error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/magento/save-credentials", isAuthenticated, async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: "Vendor ID is required" });
    }

    const { url, apiKey, secretKey } = req.body;
    
    if (!url || !apiKey || !secretKey) {
      return res.status(400).json({ 
        error: "URL, API key and secret key are required for Magento integration" 
      });
    }

    // Get store profile
    const [profile] = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, vendorId));

    if (!profile) {
      return res.status(404).json({ error: "Store profile not found" });
    }

    const result = await integrations.saveMagentoCredentials(
      url,
      apiKey,
      secretKey,
      profile.id
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Magento save credentials error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
