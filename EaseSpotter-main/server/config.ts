const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const getAllowedOrigins = () => {
  const configuredOrigins = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "";

  return configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const isAllowedOrigin = (origin?: string) => {
  if (!origin) {
    return false;
  }

  return getAllowedOrigins().includes(origin);
};

export const getPublicBaseUrl = (req?: { protocol?: string; get?: (name: string) => string | undefined }) => {
  const configuredBaseUrl =
    process.env.BASE_URL || process.env.SERVER_PUBLIC_URL || process.env.PUBLIC_API_URL;

  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl);
  }

  if (req?.protocol && req.get) {
    const host = req.get("host");
    if (host) {
      return `${req.protocol}://${host}`;
    }
  }

  return `http://localhost:${process.env.PORT || "5000"}`;
};

export const getSessionCookieSameSite = () => {
  const defaultValue = process.env.NODE_ENV === "production" ? "none" : "lax";
  const value = (process.env.SESSION_COOKIE_SAME_SITE || defaultValue).toLowerCase();
  if (value === "none" || value === "strict" || value === "lax") {
    return value;
  }

  return defaultValue;
};
