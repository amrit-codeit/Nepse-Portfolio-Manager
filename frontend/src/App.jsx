import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Component, lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Button, Layout, Menu, Spin, message } from 'antd';
import {
  DashboardOutlined,
  FundOutlined,
  SwapOutlined,
  UploadOutlined,
  SettingOutlined,
  BankOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
  StockOutlined,
  CalculatorOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import NotificationBell from './components/NotificationBell';

const { Sider, Content } = Layout;

function isChunkLoadError(error) {
  const messageText = `${error?.message || ''} ${error?.name || ''}`;
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(messageText);
}

function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (isChunkLoadError(error)) {
        const reloadKey = 'route-chunk-reload-at';
        const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
        const now = Date.now();

        if (now - lastReload > 5000) {
          sessionStorage.setItem(reloadKey, String(now));
          window.location.reload();
        }
      }

      throw error;
    }
  });
}

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Route Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          type="error"
          showIcon
          message="Page failed to load"
          description={this.state.error?.message || 'The page could not be rendered. Reloading usually clears stale route assets after a restart.'}
          action={<Button onClick={() => window.location.reload()}>Reload</Button>}
        />
      );
    }

    return this.props.children;
  }
}

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Holdings = lazyWithRetry(() => import('./pages/Holdings'));
const Transactions = lazyWithRetry(() => import('./pages/Transactions'));
const Upload = lazyWithRetry(() => import('./pages/Upload'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const Prices = lazyWithRetry(() => import('./pages/Prices'));
const ApplyIPO = lazyWithRetry(() => import('./pages/ApplyIPO'));
const Insights = lazyWithRetry(() => import('./pages/Insights'));
const TradingDesk = lazyWithRetry(() => import('./pages/TradingDesk'));
const Economy = lazyWithRetry(() => import('./pages/Economy'));
const About = lazyWithRetry(() => import('./pages/About'));
const Members = lazyWithRetry(() => import('./pages/Members'));
const ScripDetail = lazyWithRetry(() => import('./pages/ScripDetail'));

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/holdings', icon: <FundOutlined />, label: 'Holdings' },
  { key: '/transactions', icon: <SwapOutlined />, label: 'Transactions' },
  { key: '/prices', icon: <BankOutlined />, label: 'Prices' },
  { key: '/insights', icon: <StockOutlined />, label: 'Stock Explorer' },
  { key: '/trading', icon: <ThunderboltOutlined />, label: 'Trading Desk' },
  { key: '/economy', icon: <GlobalOutlined />, label: 'Economy' },
  { key: '/apply-ipo', icon: <ThunderboltOutlined />, label: 'Apply IPO' },
  { key: '/upload', icon: <UploadOutlined />, label: 'Sync & Credentials' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
  { key: '/about', icon: <InfoCircleOutlined />, label: 'About' },
];

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [siderCollapsed, setSiderCollapsed] = useState(false);

  // MED-09 Fix: Implement inactivity timeout for Master Password
  useEffect(() => {
    let timeoutId;
    
    const lockSession = () => {
      if (sessionStorage.getItem('masterAuth')) {
        logout().catch(()=>{}).finally(()=>{sessionStorage.removeItem('masterAuth'); window.location.reload();});
        message.info('Admin session locked due to inactivity.');
      }
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(lockSession, 15 * 60 * 1000); // 15 minutes
    };

    const events = ['mousemove', 'keydown', 'scroll', 'click'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <Layout className="app-layout" style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        theme="dark"
        breakpoint="lg"
        collapsedWidth="60"
        onCollapse={setSiderCollapsed}
        className={siderCollapsed ? 'app-sider app-sider-collapsed' : 'app-sider'}
      >
        {/* Logo */}
        <div className="logo-container">
          <div className="logo-icon">
            <BankOutlined />
          </div>
          <div className="logo-copy">
            <div className="logo-text">Portfolio Manager</div>
            <div className="logo-subtitle">Nepal Stock Market</div>
          </div>
        </div>

        {/* Navigation Menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 'none', marginTop: 12 }}
        />

        {/* About Section */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>NEPSE Portfolio Manager</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
            v1.2.0 • Personal Use Only<br />
            Built for the Nepali Stock Market
          </div>
        </div>
      </Sider>

      <Layout>
        {/* Simple Header for Notifications */}
        <div style={{ height: 48, background: 'var(--bg-tertiary)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 24 }}>
            <NotificationBell />
        </div>
        <Content className="animate-in" style={{ padding: 16 }}>
          <RouteErrorBoundary key={location.pathname}>
            <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/holdings" element={<Holdings />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/prices" element={<Prices />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/trading" element={<TradingDesk />} />
                <Route path="/economy" element={<Economy />} />
                <Route path="/apply-ipo" element={<ApplyIPO />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/about" element={<About />} />
                <Route path="/members" element={<Members />} />
                <Route path="/scrip/:symbol" element={<ScripDetail />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;

