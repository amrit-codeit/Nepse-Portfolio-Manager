import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import App from './App.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfigProvider
          theme={{
            algorithm: theme.darkAlgorithm,
            token: {
              colorPrimary: '#6C5CE7',
              colorBgContainer: '#1a1a2e',
              colorBgElevated: '#16213e',
              colorBgLayout: '#0f0f23',
              colorBorder: '#2a2a4a',
              colorText: '#e0e0ff',
              colorTextSecondary: '#8888aa',
              borderRadius: 10,
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            },
            components: {
              Table: {
                headerBg: '#16213e',
                rowHoverBg: '#1a1a3e',
              },
              Card: {
                colorBgContainer: '#1a1a2e',
              },
              Menu: {
                darkItemBg: '#0f0f23',
                darkSubMenuItemBg: '#0f0f23',
              },
            },
          }}
        >
          <App />
        </ConfigProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
