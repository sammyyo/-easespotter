import { registerMobileLinks } from "./mobile-links";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "@db";
import { sql } from "drizzle-orm";
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllowedOrigins, isAllowedOrigin } from "./config";
import { getUploadRoot } from "./image-storage";
// Import our specialized invitation router
import invitationRouter from "./invitation-routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.status(200).send('OK');
});

// Basic middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add CORS headers middleware
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const allowAnyOrigin = allowedOrigins.length === 0;

  if (requestOrigin && (allowAnyOrigin || isAllowedOrigin(requestOrigin))) {
    res.header('Access-Control-Allow-Origin', requestOrigin);
  }

  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const loggedPath = req.path.startsWith('/share/') ? '/share/[invite]' : req.path;
  log(`${req.method} ${loggedPath} requested`);
  next();
});

// Public mobile routes must precede authentication, APIs and SPA fallback.
registerMobileLinks(app);

let dbInitialized = false;

// Initialize database connection
async function initializeDatabase() {
  try {
    log('Attempting database connection...');
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT`);
    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.invitations') IS NOT NULL THEN
          ALTER TABLE invitations ADD COLUMN IF NOT EXISTS permission_profile_id INTEGER;
        END IF;
      END $$;
    `);
    // Try a simple query to test the connection
    await db.query.products.findMany();
    dbInitialized = true;
    log('Database connection successful');
  } catch (error) {
    log('Database connection failed:', error instanceof Error ? error.message : String(error));
    // Don't throw error, just log it and continue
  }
}

// API routes registration
async function startServer() {
  try {
    // Try to initialize database but don't block server start
    initializeDatabase().catch(console.error);

    // *** IMPORTANT API ORDER CHANGE ***
    // Health check endpoint - place before other middleware
    app.get('/api/health', (_req, res) => {
      res.send('OK');
    });

    // Database status endpoint
    app.get('/api/status/database', (_req, res) => {
      res.json({ connected: dbInitialized });
    });
    
    // Register specialized invitation routes first (high priority)
    // This ensures invitation validation endpoints aren't caught by Vite middleware
    app.use('/api/invitations', invitationRouter);
    log('Invitation routes registered successfully');

    // Serve uploaded product/store assets outside the bundled client build.
    app.use('/uploads', express.static(getUploadRoot()));
    app.use('/uploads', express.static(path.resolve(__dirname, 'public', 'uploads')));

    // Serve static files from public directory
    app.use(express.static(path.resolve(__dirname, '..', 'public')));
    
    // Register all other API routes
    const server = registerRoutes(app);
    log('Routes registered successfully');

    // Custom API 404 handler for API routes that must come BEFORE Vite middleware
    app.use('/api/*', (req, res) => {
      log(`Unmatched API route: ${req.method} ${req.path}`);
      res.status(404).json({ message: "API Not Found" });
    });

    // Error handling middleware must be registered after routes but before Vite
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      log(`Error: ${message}`);
      res.status(status).json({ message });
    });

    // Static file handling based on environment 
    // *** THIS SECTION COMES AFTER ALL API ROUTES ***
    if (process.env.NODE_ENV === "production") {
      app.use((req, res, next) => {
        if (req.path.startsWith('/api')) {
          log(`API request: ${req.method} ${req.path}`);
          next();
        } else {
          const staticMiddleware = express.static(path.resolve(__dirname, "public"));
          staticMiddleware(req, res, (err) => {
            if (err) return next(err);
            
            // Check if this is a client-side route (not a static file)
            if (!req.path.includes('.')) {
              log(`Forwarding to SPA: ${req.method} ${req.path}`);
              res.sendFile(path.resolve(__dirname, "public", "index.html"));
            } else {
              next();
            }
          });
        }
      });
    } else {
      await setupVite(app, server);
    }
    
    // Catch-all handler for client-side routes in development mode
    // This will forward all non-API routes to the SPA for client-side routing
    if (process.env.NODE_ENV !== "production") {
      app.use('*', (req, res, next) => {
        // Skip API routes, Vite HMR routes, and static files
        if (req.path.startsWith('/api') || req.path.startsWith('/@') || req.path.includes('.')) {
          return next();
        }
        
        // Forward all other routes to the SPA for client-side routing
        log(`Forwarding to SPA: ${req.method} ${req.originalUrl || req.path}`);
        res.sendFile(path.resolve(__dirname, '..', 'client', 'index.html'));
      });
    }

    const PORT = parseInt(process.env.PORT || '5000');
    server.listen({
      port: PORT,
      host: "0.0.0.0"
    }, () => {
      log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      log(`API should be accessible at http://0.0.0.0:${PORT}/api/external/products`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    log('Failed to start server:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

startServer();
