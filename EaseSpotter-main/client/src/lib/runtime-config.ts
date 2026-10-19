const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const getConfiguredApiBaseUrl = () => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    return "";
  }

  return trimTrailingSlash(configuredBaseUrl);
};

export const buildApiUrl = (path: string) => {
  if (!path.startsWith("/")) {
    return path;
  }

  if (!path.startsWith("/api/")) {
    return path;
  }

  const baseUrl = getConfiguredApiBaseUrl();
  return baseUrl ? `${baseUrl}${path}` : path;
};

export const getWebSocketUrl = (path = "/ws") => {
  const configuredWsBaseUrl = import.meta.env.VITE_WS_BASE_URL?.trim();

  if (configuredWsBaseUrl) {
    const normalizedBaseUrl = trimTrailingSlash(configuredWsBaseUrl);
    return path.startsWith("/")
      ? `${normalizedBaseUrl}${path}`
      : `${normalizedBaseUrl}/${path}`;
  }

  const apiBaseUrl = getConfiguredApiBaseUrl();
  if (apiBaseUrl && isAbsoluteUrl(apiBaseUrl)) {
    const wsProtocol = apiBaseUrl.startsWith("https://") ? "wss://" : "ws://";
    const host = apiBaseUrl.replace(/^https?:\/\//i, "");
    return path.startsWith("/")
      ? `${wsProtocol}${host}${path}`
      : `${wsProtocol}${host}/${path}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
};

export const installApiFetchShim = () => {
  const originalFetch = window.fetch.bind(window);
  const withApiCredentials = (input: string, init?: RequestInit) => {
    const nextInit = input.startsWith("/api/")
      ? { ...init, credentials: init?.credentials ?? ("include" as RequestCredentials) }
      : init;

    return originalFetch(buildApiUrl(input), nextInit);
  };

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return withApiCredentials(input, init);
    }

    if (input instanceof URL) {
      return originalFetch(input, init);
    }

    if (input instanceof Request) {
      return originalFetch(input, init);
    }

    return originalFetch(input, init);
  }) as typeof window.fetch;
};
