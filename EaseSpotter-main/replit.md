# EaseSpotter - Dynamic E-commerce Pricing Platform

## Overview

EaseSpotter is a comprehensive e-commerce pricing and competitive intelligence platform designed for vendors to manage products, pricing, analytics, and store operations. The system provides dynamic pricing capabilities, QR code functionality for customer engagement, team management, supplier coordination, and multi-channel sales support.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom theming support
- **State Management**: React Query (TanStack Query) for server state, custom hooks for local state
- **Forms**: React Hook Form with Zod validation
- **Build Tool**: Vite with TypeScript support

### Backend Architecture
- **Runtime**: Node.js 20 with Express.js
- **Language**: TypeScript with ES modules
- **Authentication**: Passport.js with local strategy and session-based auth
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple
- **API Design**: RESTful APIs with structured error handling

### Data Storage Solutions
- **Primary Database**: PostgreSQL 16
- **ORM**: Drizzle ORM with schema-first approach
- **Connection Pooling**: Built-in postgres client with connection pooling
- **Session Management**: Database-backed sessions for authentication

## Key Components

### Authentication & Authorization
- Multi-tenant vendor system with role-based access control
- Session-based authentication with secure password hashing (scrypt)
- Team management with invitation system
- User activity logging and permission profiles

### Product Management
- Comprehensive product catalog with SKU management
- Multi-category organization with location tracking (aisle/shelf)
- Pricing history and rule-based pricing engine
- Product performance analytics and forecasting

### QR Code System
- Store QR codes for customer engagement
- Product-specific QR codes for detailed information
- User interaction tracking (store visits, product bookmarks)
- Public API endpoints for external scanning applications

### Competitive Intelligence
- Competitor product tracking and price monitoring
- Market trend analysis and positioning
- Automated competitive data collection

### Marketing & Promotions
- Campaign management with Brevo email integration
- Customer segmentation with RFM analysis
- Enhanced promotion system with multiple promotion types
- Store integration for cross-platform marketing

### Supplier Management
- Supplier performance tracking and cost analysis
- Negotiation recommendations with AI assistance
- Supply chain optimization tools

### Channel Management
- Multi-channel sales support (web, mobile, store, marketplace)
- Channel-specific pricing strategies
- Performance metrics per sales channel

### Analytics & Forecasting
- Time-series forecasting with multiple algorithms
- Product performance metrics and KPI tracking
- Advanced analytics with AI-powered insights
- Customer behavior analysis and segmentation

## Data Flow

### User Authentication Flow
1. User provides credentials via login form
2. Passport.js validates against database
3. Session created and stored in PostgreSQL
4. Subsequent requests authenticated via session middleware

### Product Management Flow
1. Vendor creates/updates products through admin interface
2. Pricing rules engine evaluates and applies dynamic pricing
3. Changes logged to price history table
4. Real-time updates pushed to connected clients via WebSocket

### QR Code Interaction Flow
1. QR code generated with unique URL pointing to store/product
2. User scans QR code and accesses public endpoint
3. System tracks interaction (store visit or product bookmark)
4. Data aggregated for analytics and vendor insights

### Analytics Pipeline
1. Raw data collected from user interactions and sales
2. Data processed through analytics engine
3. Forecasting models applied for predictive insights
4. Results stored and made available through API endpoints

## External Dependencies

### Email Services
- **Brevo API**: Primary email service for transactional emails and marketing
- **SendGrid**: Backup email service (if Brevo unavailable)
- **Nodemailer**: Fallback for development/testing

### AI/ML Services
- **Anthropic Claude 3.7 Sonnet**: Primary AI service for pricing recommendations
- **OpenAI GPT-4o**: Alternative AI service for chat completions and analysis

### Third-party Integrations
- **Shopify**: E-commerce platform integration
- **WooCommerce**: WordPress e-commerce integration
- **Magento**: Enterprise e-commerce platform support

### Development Tools
- **Stripe**: Payment processing (referenced but not fully implemented)
- **WebSocket**: Real-time communication support
- **3D/AR Components**: React Three Fiber for virtual fitting experiences

## Deployment Strategy

### Platform
- **Primary**: Replit with Cloud Run deployment target
- **Build Process**: Vite for frontend, esbuild for backend bundling
- **Database**: PostgreSQL 16 with connection pooling

### Environment Configuration
- Database URL via environment variables
- API keys for external services (Brevo, Anthropic, etc.)
- Session secrets for authentication security

### Development Workflow
- Hot reload development server on port 5000
- TypeScript compilation with strict mode
- Database migrations via Drizzle Kit

### Production Deployment
- Containerized deployment via Cloud Run
- Static asset serving through Vite build
- Database connection optimization for production

## Changelog
- June 26, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.