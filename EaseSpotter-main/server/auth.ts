import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, vendors, storeProfiles, insertUserSchema, type SelectUser } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import { getSessionCookieSameSite } from "./config";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);
const DEFAULT_VENDOR_LOGO_PATH = "/logos/default-vendor.png";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function getUserByUsername(username: string) {
  return db.select().from(users).where(eq(users.username, username)).limit(1);
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET || 'your-session-secret-key-change-in-production';
  const cookieSameSite = getSessionCookieSameSite();
  const isCrossSiteCookie = cookieSameSite === "none";
  const sessionCookieDomain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;
  const sessionCookieName = process.env.SESSION_COOKIE_NAME?.trim() || "easespotter.sid";
  const store = new PostgresSessionStore({ 
    pool, 
    createTableIfMissing: true,
    tableName: 'session'
  });
  
  const sessionSettings: session.SessionOptions = {
    name: sessionCookieName,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    proxy: true,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === 'production' || isCrossSiteCookie,
      sameSite: cookieSameSite,
      domain: sessionCookieDomain,
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        return done(null, false);
      }

      // Don't send the password to the client
      const { password, ...userWithoutPassword } = user;
      
      // Get vendor name if user has a vendorId
      if (userWithoutPassword.vendorId) {
        const [vendor] = await db
          .select()
          .from(vendors)
          .where(eq(vendors.id, userWithoutPassword.vendorId))
          .limit(1);
          
        if (vendor) {
          // Add vendor name to user object
          (userWithoutPassword as any).vendorName = vendor.name;
        }
      }
      
      done(null, userWithoutPassword);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log("Registration request:", req.body);
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        const error = fromZodError(result.error);
        console.log("Validation error:", error.toString());
        return res.status(400).json({ error: error.toString() });
      }
      
      // Check if this is a request to override existing account
      const forceOverride = req.query.override === 'true';

      // Case-insensitive username check
      const allUsers = await db
        .select()
        .from(users);
      
      const existingUser = allUsers.find(user => 
        user.username.toLowerCase() === result.data.username.toLowerCase()
      );
      
      if (existingUser) {
        console.log("Username already exists (case-insensitive):", result.data.username);
        return res.status(400).json({ 
          error: `Username already exists. Please choose a different username.`,
          suggestedUsername: `${result.data.username}${Math.floor(Math.random() * 100)}` 
        });
      }

      // Update: We're allowing email reuse now
      // If an email already exists, we'll update it to free it up
      const existingEmail = await db
        .select()
        .from(users)
        .where(eq(users.email, result.data.email))
        .limit(1);

      if (existingEmail.length > 0) {
        console.log("Email already exists, updating to allow reuse:", result.data.email);
        
        // Update the existing email to free it up
        await db
          .update(users)
          .set({ email: `old_${result.data.email}` })
          .where(eq(users.email, result.data.email));
        
        console.log("Email updated to allow reuse:", result.data.email);
      }

      const hashedPassword = await hashPassword(result.data.password);
      const normalizedStoreName = result.data.username.trim();
      const baseSlug = normalizedStoreName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `store-${Date.now()}`;

      const user = await db.transaction(async (tx) => {
        const uniqueVendorEmail = `${Date.now()}_${result.data.email}`;

        const [vendor] = await tx
          .insert(vendors)
          .values({
            name: normalizedStoreName,
            businessName: normalizedStoreName,
            category: 'other',
            email: uniqueVendorEmail,
            address: "",
            phone: "",
            currencyCode: "USD",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        const [createdUser] = await tx
          .insert(users)
          .values({
            ...result.data,
            password: hashedPassword,
            vendorId: vendor.id,
            role: 'vendor',
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        await tx
          .insert(storeProfiles)
          .values({
            vendorId: vendor.id,
            name: normalizedStoreName,
            description: `Browse ${normalizedStoreName}'s product catalog, prices, and in-store locations.`,
            slug: `${baseSlug}-${vendor.id}`,
            storeType: 'other',
            logoUrl: DEFAULT_VENDOR_LOGO_PATH,
            isVerified: true,
            verificationDate: new Date(),
            socialLinks: {},
            businessHours: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          });

        return createdUser;
      });

      console.log("User created successfully:", { id: user.id, username: user.username });

      // Remove password before sending to client
      const { password, ...userWithoutPassword } = user;

      req.login(userWithoutPassword, (err) => {
        if (err) {
          console.error("Login error after registration:", err);
          return next(err);
        }
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error, user: SelectUser) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      req.login(user, (err) => {
        if (err) {
          return next(err);
        }
        return res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((destroyErr) => {
        if (destroyErr) return next(destroyErr);
        res.clearCookie(sessionCookieName, {
          path: "/",
          domain: sessionCookieDomain,
          secure: process.env.NODE_ENV === 'production' || isCrossSiteCookie,
          sameSite: cookieSameSite,
        });
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    
    // If user has a vendorId but no vendorName, fetch the vendor data
    if (req.user.vendorId && !req.user.vendorName) {
      try {
        const [vendor] = await db
          .select()
          .from(vendors)
          .where(eq(vendors.id, req.user.vendorId))
          .limit(1);
          
        if (vendor) {
          // Add vendor name to user object
          (req.user as any).vendorName = vendor.name;
        }
      } catch (error) {
        console.error("Error fetching vendor data:", error);
      }
    }
    
    res.json(req.user);
  });
}
