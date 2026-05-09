import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { STALE_TIMES } from './services/queryConfig';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.PORTFOLIO, // 60 seconds — most common case (M-3)
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ConfigProvider
            theme={{
              algorithm: theme.darkAlgorithm,
              token: {
                colorPrimary: '#818cf8',
                colorBgContainer: '#121214',
                colorBgElevated: '#18181b',
                colorBgLayout: '#09090b',
                colorBorder: '#27272a',
                colorText: '#f4f4f5',
                colorTextSecondary: '#a1a1aa',
                borderRadius: 8,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              },
              components: {
                Table: {
                  headerBg: '#18181b',
                  rowHoverBg: 'rgba(255,255,255,0.03)',
                },
                Card: {
                  colorBgContainer: '#121214',
                },
                Menu: {
                  darkItemBg: '#121214',
                  darkSubMenuItemBg: '#121214',
                },
              },
            }}
          >
            <App />
          </ConfigProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
