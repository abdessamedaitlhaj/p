// Configuration for API endpoints
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || "http://localhost:3000",
};

export const API_ENDPOINTS = {
  AUTH: {
    SIGNIN: `${API_CONFIG.BASE_URL}/api/auth/signin`,
    LOGOUT: `${API_CONFIG.BASE_URL}/api/auth/logout`,
  },
  TOKEN: {
    REFRESH: `${API_CONFIG.BASE_URL}/api/token/new`,
  },
};
