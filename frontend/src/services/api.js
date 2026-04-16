import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// CRIT-01 Fix: Automatically attach the master password header to requests if available
api.interceptors.request.use((config) => {
  const masterPassword = sessionStorage.getItem('masterAuth');
  if (masterPassword) {
    config.headers['X-Master-Password'] = masterPassword;
  }
  return config;
});

// --- Members ---
export const getMembers = () => api.get('/members');
export const createMember = (data) => api.post('/members', data);
export const updateMember = (id, data) => api.put(`/members/${id}`, data);
export const deleteMember = (id) => api.delete(`/members/${id}`);

// --- Credentials ---
export const setCredentials = (memberId, data) => api.post(`/members/${memberId}/credentials`, data);
export const getCredentials = (memberId) => api.get(`/members/${memberId}/credentials`);
export const getDecryptedCredentials = (memberId) => api.get(`/members/${memberId}/credentials/decrypted`);
export const deleteCredentials = (memberId) => api.delete(`/members/${memberId}/credentials`);

// --- Bulk Credentials ---
export const verifyMasterPassword = (password) => api.post('/members/verify-password', { password });
export const exportCredentials = () => api.get('/members/export-credentials');
export const importCredentials = (credentials) => api.post('/members/import-credentials', { credentials });


// --- Companies ---
export const getCompanies = (params) => api.get('/companies', { params });
export const getCompany = (symbol) => api.get(`/companies/${symbol}`);
export const getInsights = (symbol) => api.get(`/insights/${symbol}`);
export const getSectors = () => api.get('/companies/sectors');

// --- Transactions ---
export const getTransactions = (params) => api.get('/transactions', { params });
export const createTransaction = (data) => api.post('/transactions', data);
export const updateTransaction = (id, data) => api.put(`/transactions/${id}`, data);
export const uploadHistory = (memberId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/transactions/upload?member_id=${memberId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const uploadDpStatement = (memberId, symbol, format, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/transactions/upload-dp?member_id=${memberId}&symbol=${symbol}&dp_format=${format}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const deleteTransaction = (id) => api.delete(`/transactions/${id}`);

// --- Portfolio ---
export const getPortfolioSummary = (params) => api.get('/portfolio/summary', { params });
export const getHoldings = (params) => api.get('/portfolio/holdings', { params });
export const getPortfolioHistory = (params) => api.get('/portfolio/history', { params });
export const getComputedHistory = (params) => api.get('/portfolio/computed-history', { params });
export const getClosedPositions = (params) => api.get('/portfolio/closed-positions', { params });
export const getPortfolioDividends = (params) => api.get('/portfolio/dividends', { params });
export const takeSnapshot = () => api.post('/portfolio/snapshot');

// --- Prices ---
export const getMergedPrices = (params) => api.get('/prices', { params });
export const getHistoricalPrices = (params) => api.get('/prices/historical', { params });
export const getNepseIndex = (params) => api.get('/prices/index', { params });
export const getLatestNepseIndex = () => api.get('/prices/index/latest');
export const getIssuePrice = (symbol, issueType) => api.get('/prices/issue-price', { params: { symbol, issue_type: issueType } });
export const getAllIssues = () => api.get('/prices/all-issues');
export const refreshPrices = () => api.post('/scraper/prices');
export const refreshNav = () => api.post('/scraper/nav');

// --- Fee Config ---
export const getFeeConfig = () => api.get('/config/fees');
export const updateFeeConfig = (key, value) => api.put(`/config/fees/${key}`, { value });
export const getFeeConfigHistory = (key) => api.get(`/config/fees/history/${key}`);
export const addFeeConfigVersion = (data) => api.post('/config/fees/version', data);

// --- Scrapers ---
export const scrapeCompanies = () => api.post('/scraper/companies');
export const scrapeNav = () => api.post('/scraper/nav');
export const scrapePrices = () => api.post('/scraper/prices');
export const scrapeIssues = () => api.post('/scraper/issues');
export const syncMeroshare = (memberIds) => api.post('/scraper/meroshare/sync', memberIds ? { member_ids: memberIds } : null);
export const syncHistory = () => api.post('/scraper/history');
export const scrapeIndex = () => api.post('/scraper/index');
export const syncDividends = () => api.post('/scraper/dividends');
export const scrapeFundamentals = (symbol) => api.post(`/scraper/fundamentals/${symbol}`);
export const scrapeInsights = (symbol) => api.post(`/scraper/insights/${symbol}`);

// --- Dividends ---
export const getDividends = (params) => api.get('/dividends', { params });
export const getDividendSummary = (params) => api.get('/dividends/summary', { params });

// --- Health ---
export const healthCheck = () => api.get('/health');

// --- Member Groups ---
export const getGroups = () => api.get('/groups');
export const createGroup = (data) => api.post('/groups', data);
export const updateGroup = (id, data) => api.put(`/groups/${id}`, data);
export const deleteGroup = (id) => api.delete(`/groups/${id}`);


// --- Executive Summary ---
export const getAIModels = () => api.get('/analysis/models');
export const getExecutiveSummary = (symbol) => api.get(`/analysis/summary/${symbol}`);
export const getAIVerdict = (symbol, model) => api.post(`/analysis/summary/${symbol}/ai-verdict`, null, { params: { model } });
export const getAITradingVerdict = (symbol, model) => api.post(`/analysis/summary/${symbol}/ai-trading-verdict`, null, { params: { model } });

// --- Cloud AI (Groq) ---
export const getAIVerdictCloud = (symbol) => api.post(`/analysis/summary/${symbol}/ai-verdict-cloud`);
export const getAITradingVerdictCloud = (symbol) => api.post(`/analysis/summary/${symbol}/ai-trading-verdict-cloud`);

// --- Frontier Prompt (Copy/Paste) ---
export const getFrontierPrompt = (symbol, mode) => api.get(`/analysis/summary/${symbol}/frontier-prompt`, { params: { mode } });

// --- Stock Detail ---
export const getStockDetail = (symbol, params = {}) => api.get(`/stock-detail/${symbol}`, { params });
export const getSymbolsList = (params = {}) => api.get('/stock-detail/symbols/list', { params });

// --- IPO API ---
export const getOpenIPOs = (member_id) => api.get('/ipo/open', { params: { member_id } });
export const applyIPOs = (data) => api.post('/ipo/apply', data);
export const getIPOJobStatus = (job_id) => api.get(`/ipo/status/${job_id}`);

// --- Calculator ---
export const simulateBuy = (data) => api.post('/calculator/buy', data);
export const simulateSell = (data) => api.post('/calculator/sell', data);

export default api;
