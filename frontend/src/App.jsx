import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout, Menu, message } from 'antd';
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
import Dashboard from './pages/Dashboard';
import Holdings from './pages/Holdings';
import Transactions from './pages/Transactions';
import Upload from './pages/Upload';
import Settings from './pages/Settings';
import Prices from './pages/Prices';
import ApplyIPO from './pages/ApplyIPO';
import Insights from './pages/Insights';
import TradingDesk from './pages/TradingDesk';
import Economy from './pages/Economy';
import About from './pages/About';
import Members from './pages/Members';
import ScripDetail from './pages/ScripDetail';
import NotificationBell from './components/NotificationBell';

const { Sider, Content } = Layout;

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

  // MED-09 Fix: Implement inactivity timeout for Master Password
  useEffect(() => {
    let timeoutId;
    
    const lockSession = () => {
      if (sessionStorage.getItem('masterAuth')) {
        sessionStorage.removeItem('masterAuth');
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
      <Sider width={240} theme="dark" breakpoint="lg" collapsedWidth="60">
        {/* Logo */}
        <div className="logo-container">
          <div className="logo-icon">
            <BankOutlined />
          </div>
          <div>
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
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.15)',
        }}>
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
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;

