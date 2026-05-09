import React, { Component } from 'react';
import { Button, Result, Typography, Space } from 'antd';
import { ReloadOutlined, CopyOutlined, BugOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

/**
 * Global application-level ErrorBoundary.
 *
 * Catches any render-time error that bubbles up from child components and
 * displays a user-friendly fallback UI instead of a blank white screen.
 *
 * Place this inside <StrictMode> but outside the router and providers so that
 * routing/query failures are also caught.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const details = [
      `Error: ${error?.message || 'Unknown error'}`,
      `Stack: ${error?.stack || 'N/A'}`,
      `Component Stack: ${errorInfo?.componentStack || 'N/A'}`,
      `Time: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      `UserAgent: ${navigator.userAgent}`,
    ].join('\n\n');

    navigator.clipboard.writeText(details).then(() => {
      // Ant Design message is unavailable here (outside providers), use native alert
      alert('Error details copied to clipboard.');
    });
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          padding: 24,
        }}>
          <Result
            icon={<BugOutlined style={{ color: '#ef4444' }} />}
            title={
              <span style={{ color: '#f4f4f5' }}>Something went wrong</span>
            }
            subTitle={
              <span style={{ color: '#a1a1aa' }}>
                The application encountered an unexpected error. Your data is safe — 
                try reloading or copy the error details for troubleshooting.
              </span>
            }
            extra={
              <Space>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={this.handleReload}
                  style={{ background: '#818cf8', borderColor: '#818cf8' }}
                >
                  Reload App
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  onClick={this.handleCopyError}
                  style={{ color: '#a1a1aa', borderColor: '#3f3f46' }}
                >
                  Copy Error Details
                </Button>
              </Space>
            }
          >
            {isDev && this.state.error && (
              <div style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: 8,
                padding: 16,
                maxHeight: 300,
                overflow: 'auto',
                textAlign: 'left',
              }}>
                <Paragraph>
                  <Text strong style={{ color: '#ef4444', fontSize: 13 }}>
                    {this.state.error.message}
                  </Text>
                </Paragraph>
                <Paragraph>
                  <Text
                    code
                    style={{ color: '#a1a1aa', fontSize: 11, whiteSpace: 'pre-wrap' }}
                  >
                    {this.state.error.stack}
                  </Text>
                </Paragraph>
              </div>
            )}
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
