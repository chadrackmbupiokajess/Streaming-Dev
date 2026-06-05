import axios from 'axios';

export const AUTH_TOKEN_STORAGE_KEY = 'kollectif_live_token';
export const AUTH_USER_STORAGE_KEY = 'kollectif_live_user';

const apiClient = axios.create();

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

export default apiClient;
