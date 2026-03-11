import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import {
  DashboardOutlined,
  FundOutlined,
  SwapOutlined,
  UploadOutlined,
  TeamOutlined,
  SettingOutlined,
  BankOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import Holdings from './pages/Holdings';
import Transactions from './pages/Transactions';
import Upload from './pages/Upload';
import Settings from './pages/Settings';
import Prices from './pages/Prices';
import ApplyIPO from './pages/ApplyIPO';

const { Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/holdings', icon: <FundOutlined />, label: 'Holdings' },
  { key: '/transactions', icon: <SwapOutlined />, label: 'Transactions' },
  { key: '/prices', icon: <BankOutlined />, label: 'Prices' },
  { key: '/apply-ipo', icon: <ThunderboltOutlined />, label: 'Apply IPO' },
  { key: '/upload', icon: <UploadOutlined />, label: 'Sync & Credentials' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout className="app-layout" style={{ minHeight: '100vh' }}>
      <Sider width={240} theme="dark" breakpoint="lg" collapsedWidth="60">
        {/* Logo */}
        <div className="logo-container">
          <div className="logo-icon">
            <BankOutlined />
          </div>
          <div>
            <div className="logo-text">PortfolioNP</div>
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
      </Sider>

      <Layout>
        <Content className="animate-in">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/holdings" element={<Holdings />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/prices" element={<Prices />} />
            <Route path="/apply-ipo" element={<ApplyIPO />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
