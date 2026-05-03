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
export const updateTargetWeight = (holdingId, targetWeight) => api.put(`/portfolio/holdings/${holdingId}/target-weight`, { target_weight: targetWeight });
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
export const getScraperRuns = (limit = 50) => api.get('/scraper/runs', { params: { limit } });
export const scrapeCompanies = () => api.post('/scraper/companies');
export const scrapeNav = () => api.post('/scraper/nav');
export const scrapePrices = () => api.post('/scraper/prices');
export const scrapeIssues = () => api.post('/scraper/issues');
export const syncMeroshare = (memberIds) => api.post('/scraper/meroshare/sync', memberIds ? { member_ids: memberIds } : null);
export const syncHistory = () => api.post('/scraper/history');
export const scrapeIndex = () => api.post('/scraper/all-indices');
export const syncDividends = () => api.post('/scraper/dividends');
export const scrapeFundamentals = (symbol) => api.post(`/scraper/fundamentals/${symbol}`);
export const scrapeInsights = (symbol) => api.post(`/scraper/insights/${symbol}`);
export const scrapeTechnicals = (symbol) => api.post(`/scraper/technicals/${symbol}`);
export const scrapeCorporateActions = (symbol) => api.post(`/market/scrape-corporate-actions/${symbol}`);

// --- Backtesting ---
export const runBacktest = (symbol, params = {}) => api.get(`/market/backtest/${symbol}`, { params });

// --- Dividends ---
export const getDividends = (params) => api.get('/dividends', { params });
export const getDividendSummary = (params) => api.get('/dividends/summary', { params });
export const getUpcomingDividends = (params) => api.get('/dividends/upcoming', { params });

// --- Health ---
export const healthCheck = () => api.get('/health');

// --- Notifications ---
export const getUnreadNotifications = () => api.get('/notifications/unread');
export const markNotificationRead = (id) => api.post(`/notifications/read/${id}`);
export const markAllNotificationsRead = () => api.post('/notifications/read-all');

// --- Member Groups ---
export const getGroups = () => api.get('/groups');
export const createGroup = (data) => api.post('/groups', data);
export const updateGroup = (id, data) => api.put(`/groups/${id}`, data);
export const deleteGroup = (id) => api.delete(`/groups/${id}`);


// --- Executive Summary ---
export const getAIModels = () => api.get('/analysis/models');
export const getExecutiveSummary = (symbol, memberId) => api.get(`/analysis/summary/${symbol}`, { params: { member_id: memberId || undefined } });
export const getAIVerdict = (symbol, model, memberId) => api.post(`/analysis/summary/${symbol}/ai-verdict`, null, { params: { model, member_id: memberId || undefined } });
export const getAITradingVerdict = (symbol, model, memberId) => api.post(`/analysis/summary/${symbol}/ai-trading-verdict`, null, { params: { model, member_id: memberId || undefined } });

// --- Cloud AI (Groq & Nvidia) ---
export const getAIVerdictCloud = (symbol, provider = 'groq', memberId) => api.post(`/analysis/summary/${symbol}/ai-verdict-cloud`, null, { params: { provider, member_id: memberId || undefined } });
export const getAITradingVerdictCloud = (symbol, provider = 'groq', memberId) => api.post(`/analysis/summary/${symbol}/ai-trading-verdict-cloud`, null, { params: { provider, member_id: memberId || undefined } });

// --- Frontier Prompt (Copy/Paste) ---
export const getFrontierPrompt = (symbol, mode, memberId) => api.get(`/analysis/summary/${symbol}/frontier-prompt`, { params: { mode, member_id: memberId || undefined } });

// --- Trade Intel ---
export const getTradeIntelEpochs = (symbol, memberId) => api.get(`/portfolio/trade-intel/${symbol}`, { params: { member_id: memberId } });
export const getTradeIntelAILocal = (symbol, memberId, model) => api.post(`/portfolio/trade-intel/${symbol}/ai-review-local`, null, { params: { member_id: memberId, model } });
export const getTradeIntelAICloud = (symbol, memberId, provider = 'groq') => api.post(`/portfolio/trade-intel/${symbol}/ai-review-cloud`, null, { params: { member_id: memberId, provider } });
export const getTradeIntelFrontierPrompt = (symbol, memberId) => api.get(`/portfolio/trade-intel/${symbol}/frontier-prompt`, { params: { member_id: memberId } });

// --- Portfolio AI Analyst ---
export const analyzePortfolioLocal = (params) => api.post('/portfolio/analyze-local', null, { params });
export const analyzePortfolioCloud = (params) => api.post('/portfolio/analyze-cloud', null, { params });
export const getPortfolioFrontierPrompt = (params) => api.get('/portfolio/analyze-frontier-prompt', { params });

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
export const simulateHypotheticalSell = (data) => api.post('/calculator/sell-hypothetical', data);
export const calculateTradePlan = (data) => api.post('/calculator/trade-plan', data);

// --- Screener ---
export const getScreenerData = () => api.get('/screener');
export const getFundamentalScreener = (params) => api.get('/screener/fundamental', { params });
export const getTechnicalScreener = (params) => api.get('/screener/technical', { params });

// --- Market Context (Conjunction Trading) ---
export const getMarketContext = () => api.get('/market/context');
export const getSectorContext = (sector) => api.get(`/market/context/${encodeURIComponent(sector)}`);
export const getExtendedTechnicals = (symbol) => api.get(`/market/stock-technicals/${symbol}`);

// --- Scraper Triggers ---
export const scrapeSectorIndices = () => api.post('/scraper/sector-indices');
export const scrapeAllIndices = () => api.post('/scraper/all-indices');

// --- Trading Desk ---
export const getTradeSetups = (status) => api.get('/trading/setups', { params: status ? { status } : {} });
export const createTradeSetup = (data) => api.post('/trading/setups', data);
export const updateTradeSetup = (id, data) => api.put(`/trading/setups/${id}`, data);
export const closeTradeSetup = (id, data) => api.post(`/trading/setups/${id}/close`, data);
export const deleteTradeSetup = (id) => api.delete(`/trading/setups/${id}`);
export const getTradeSignals = () => api.get('/trading/setups/signals');
export const getTradeJournal = () => api.get('/trading/journal');
export const createTradeJournalEntry = (data) => api.post('/trading/journal', data);
export const getTradeJournalStats = () => api.get('/trading/journal/stats');
// --- Economy & Alternatives ---
export const getEconomyMacro = () => api.get('/economy/macro');
export const triggerEconomyScrape = () => api.post('/economy/macro/scrape');
export const getEconomyAlternatives = (principal, startDate) =>
  api.get('/economy/alternatives', { params: { principal, start_date: startDate } });

// --- System Import/Export ---
export const exportMarketData = () => api.get('/system/export-market-data', { responseType: 'blob' });
export const importMarketData = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/system/import-market-data', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export default api;
