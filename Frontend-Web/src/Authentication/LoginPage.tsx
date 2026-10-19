import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import {
  loginOfficial,
  getStoredToken,
  getMe,
  getAdminCoachQueue,
  warmOfficialAppCache,
} from '../api/client';
import { styles } from './styles/LoginPage';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [savePass, setSavePass] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState<boolean>(() => Boolean(getStoredToken()));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (getStoredToken()) {
      setIsAutoLoggingIn(true);
      const minDelay = new Promise((resolve) => setTimeout(resolve, 500));
      Promise.all([
        getMe().catch(() => null),
        warmOfficialAppCache().catch(() => {}),
        minDelay,
      ]).then(([user]) => {
        if (!user && !getStoredToken()) {
          setIsAutoLoggingIn(false);
          return;
        }
        if (user?.role === 'SystemAdmin' || user?.role === 'System Admin' || user?.role === 'Admin') {
          getAdminCoachQueue(true).catch(() => {});
          navigate('/admin/dashboard');
        } else {
          navigate('/dashboard');
        }
      }).catch(() => {
        setIsAutoLoggingIn(false);
      });
    }
  }, [navigate]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email || !password) return setErr('Please enter both email and password.');

    try {
      setLoading(true);
      const res = await loginOfficial({ email, password, savePassword: savePass });

      const role = res?.user?.role;
      if (role === 'SystemAdmin' || role === 'System Admin' || role === 'Admin') {
        navigate('/admin/dashboard');
        return;
      }

      await warmOfficialAppCache().catch(() => {});
      navigate('/dashboard');
    } catch (e: any) {
      const msg = e.message || '';
      if (
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('user-not-found')
      ) {
        setErr('Account does not exist.');
      } else {
        setErr(msg || 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };


  if (isAutoLoggingIn) {
    return (
      <div style={styles.container}>
        <header className="resp-header" style={styles.header}>
          <Link to="/" style={styles.logo}>
            ATLETA<sup style={styles.logoSup}>WEB</sup>
          </Link>
        </header>

        <main style={{ ...styles.main, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="resp-card"
            style={{
              ...styles.card,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
              padding: '48px 32px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#F0F9FF',
                border: '2px solid #0B132B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Loader2 style={{ width: 32, height: 32, color: '#0B132B', animation: 'spin 1s linear infinite' }} />
            </div>

            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0B132B', margin: '0 0 6px 0', letterSpacing: '0.05em' }}>
                LOGGING YOU IN...
              </h2>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                Resuming authenticated session and loading your dashboard workspace...
              </p>
            </div>

            <div
              style={{
                width: '100%',
                height: '4px',
                backgroundColor: '#E2E8F0',
                borderRadius: '2px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div className="progress-bar-indeterminate" />
            </div>
          </div>
        </main>

        <footer className="resp-footer" style={styles.footer}>
          <div className="resp-foot-wrap" style={styles.footWrap}>
            <div style={styles.footLogo}>ATLETA</div>
            <div style={styles.copy}>© 2026 ATLETA. ALL RIGHTS RESERVED.</div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header className="resp-header" style={styles.header}>
        <Link to="/" style={styles.logo}>
          ATLETA<sup style={styles.logoSup}>WEB</sup>
        </Link>
        <nav style={styles.nav}>
          <Link to="/login" className="nav-link" style={styles.loginLink}>LOGIN</Link>
          <Link to="/register" className="nav-btn" style={styles.regBtn}>REGISTER</Link>
        </nav>
      </header>

      <main style={styles.main}>
        <h1 style={styles.title}>LOG IN YOUR ACCOUNT</h1>

        <div className="resp-card" style={styles.card}>
          {err && (
            <div style={styles.error}>
              <div>{err}</div>
            </div>
          )}

          <form onSubmit={onLogin} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>EMAIL ADDRESS</label>
              <div style={styles.inputWrap}>
                <Mail style={styles.icon} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="officials@gmail.com"
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.field}>
              <div style={styles.passLabelRow}>
                <label style={styles.label}>PASSWORD</label>
                <Link to="/forgot-password" className="text-link" style={styles.forgotLink}>FORGOT PASSWORD?</Link>
              </div>
              <div style={styles.inputWrap}>
                <Lock style={styles.icon} />
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={styles.passInput}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={styles.eyeBtn}
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                </button>
              </div>
            </div>

            <div style={styles.checkRow}>
              <input
                id="savePass"
                type="checkbox"
                checked={savePass}
                onChange={(e) => setSavePass(e.target.checked)}
                style={styles.check}
              />
              <label htmlFor="savePass" style={styles.checkLabel}>SAVE PASSWORD</label>
            </div>

            <button type="submit" disabled={loading} className="btn-primary" style={styles.submitBtn}>
              {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : 'LOGIN →'}
            </button>
          </form>

          <div style={styles.securityBox}>
            <div style={styles.secHeader}>
              <span style={styles.secDot} />
              <span style={styles.secTitle}>ENCRYPTED CONNECTION</span>
            </div>
            <p style={styles.secText}>
              Unauthorized access attempt is a violation of the digital security protocol. All activity is logged and monitored.
            </p>
          </div>
        </div>
      </main>

      <footer className="resp-footer" style={styles.footer}>
        <div className="resp-foot-wrap" style={styles.footWrap}>
          <div style={styles.footLogo}>ATLETA</div>
          <div style={styles.copy}>© 2026 ATLETA. ALL RIGHTS RESERVED.</div>
          <div style={styles.footLinks}>
            <span className="footer-link" style={styles.footLink}>PRIVACY</span>
            <span className="footer-link" style={styles.footLink}>TERMS</span>
            <span className="footer-link" style={styles.footLink}>SUPPORT</span>
          </div>
        </div>
      </footer>

    </div>
  );
};
