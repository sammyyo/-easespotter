# EaseSpotter QR Code System Documentation

This document outlines the QR code system implementation in EaseSpotter, including API endpoints, data models, and usage examples.

## Overview

The QR code system enables vendors to generate QR codes for their stores and products. When users scan these QR codes, they can:
- View store information
- View product details
- Bookmark products
- Track store visits

## API Endpoints

### QR Code Generation

| Endpoint | Method | Description | Authentication |
|----------|--------|-------------|----------------|
| `/api/qr/store/:vendorId` | GET | Generate a QR code for a store | Required |
| `/api/qr/product/:productId` | GET | Generate a QR code for a product | Required |

### QR Code Scanning (Direct URL Endpoints)

| Endpoint | Method | Description | Authentication |
|----------|--------|-------------|----------------|
| `/api/stores/:storeId` | GET | Get store directory | Not Required |
| `/api/products/:productId` | GET | Get product information | Not Required |

### Post-Scan Actions

| Endpoint | Method | Description | Authentication |
|----------|--------|-------------|----------------|
| `/api/user/:userId/store-session` | POST | Record a store visit | Required |
| `/api/user/:userId/product-bookmark` | POST | Bookmark a product | Required |

### Testing Endpoints (Public)

| Endpoint | Method | Description | Authentication |
|----------|--------|-------------|----------------|
| `/api/public/bookmark-product` | POST | Test product bookmarking | Not Required |
| `/api/public/record-store-visit` | POST | Test store visit recording | Not Required |

## Data Models

### User Bookmarks

The `userBookmarks` table stores information about products that users have bookmarked.

Fields:
- `id`: Unique identifier for the bookmark
- `userId`: ID of the user who created the bookmark
- `productId`: ID of the bookmarked product
- `vendorId`: ID of the vendor that owns the product
- `createdAt`: Timestamp when the bookmark was created
- `notes`: Optional notes added by the user
- `metadata`: JSON field for storing additional metadata (e.g., QR scan details)

### User Store Sessions

The `userStoreSessions` table tracks user visits to stores.

Fields:
- `id`: Unique identifier for the session
- `userId`: ID of the user
- `storeId`: ID of the store visited
- `visitDate`: Date of the first visit
- `visitCount`: Number of times the user has visited the store
- `lastVisit`: Timestamp of the most recent visit

## Usage Examples

### Generating QR Codes

```javascript
// Generate a store QR code
fetch('/api/qr/store/1', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
})
.then(response => response.blob())
.then(blob => {
  // Display or download the QR code image
});

// Generate a product QR code
fetch('/api/qr/product/5', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
})
.then(response => response.blob())
.then(blob => {
  // Display or download the QR code image
});
```

### Bookmarking a Product

```javascript
// After scanning a product QR code
fetch('/api/user/1/product-bookmark', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    productId: 5,
    notes: 'Interesting product, check later'
  })
})
.then(response => response.json())
.then(data => {
  console.log('Product bookmarked:', data);
});
```

### Recording a Store Visit

```javascript
// After scanning a store QR code
fetch('/api/user/1/store-session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    storeId: 2
  })
})
.then(response => response.json())
.then(data => {
  console.log('Store visit recorded:', data);
});
```

### Testing Without Authentication

```javascript
// Test product bookmarking
fetch('/api/public/bookmark-product', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    productId: 5,
    userId: 1,
    notes: 'Testing QR bookmark'
  })
})
.then(response => response.json())
.then(data => {
  console.log('Test bookmark result:', data);
});

// Test store visit recording
fetch('/api/public/record-store-visit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    storeId: 1,
    userId: 1
  })
})
.then(response => response.json())
.then(data => {
  console.log('Test store visit result:', data);
});
```

## Implementation Notes

1. QR codes contain simple URLs (e.g., `https://easespotter.com/api/stores/1` or `https://easespotter.com/api/products/5`).

2. When a QR code is scanned:
   - The URL is opened in a browser or in the EaseSpotter app
   - The client makes separate API calls to bookmark products or record store visits

3. The system uses hostname-based environment detection to ensure QR codes work in both development and production environments:
   - Development: `http://localhost:5000/api/...`
   - Production: `https://easespotter.com/api/...`

4. Bookmark metadata includes additional information about the QR scan:
   ```json
   {
     "source": "qr_code",
     "scanDate": "2025-05-07T16:57:28.359Z"
   }
   ```