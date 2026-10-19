#!/bin/bash

# Update routes to add authentication middleware
# This script assumes that "isAuthenticated" middleware is already defined in the file

# Find all route handlers in the file and add the middleware
sed -i 's/app.get("\/api\/\([^"]\+\)", async/app.get("\/api\/\1", isAuthenticated, async/g' server/routes.ts
sed -i 's/app.post("\/api\/\([^"]\+\)", async/app.post("\/api\/\1", isAuthenticated, async/g' server/routes.ts
sed -i 's/app.patch("\/api\/\([^"]\+\)", async/app.patch("\/api\/\1", isAuthenticated, async/g' server/routes.ts
sed -i 's/app.delete("\/api\/\([^"]\+\)", async/app.delete("\/api\/\1", isAuthenticated, async/g' server/routes.ts

# Exclude routes that don't need authentication
# - Public API for external apps
sed -i 's/isAuthenticated, async (req, res) => {.*\/api\/external\/products.*/async (req, res) => {/' server/routes.ts

# - Authentication routes
sed -i 's/isAuthenticated, async (req, res) => {.*\/api\/user.*/async (req, res) => {/' server/routes.ts
sed -i 's/isAuthenticated, async (req, res) => {.*\/api\/login.*/async (req, res) => {/' server/routes.ts
sed -i 's/isAuthenticated, async (req, res) => {.*\/api\/register.*/async (req, res) => {/' server/routes.ts
sed -i 's/isAuthenticated, async (req, res) => {.*\/api\/logout.*/async (req, res) => {/' server/routes.ts

echo "Routes updated with authentication middleware"
