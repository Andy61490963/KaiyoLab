import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Orbit,
  ShieldCheck,
} from 'lucide-react';
import { api, errorMessage, json } from './api';

export default function AuthForm({ mode }: { mode: 'login' | 'setup' }) {
  const setup = mode === 'setup';
  const [setupComplete, setSetupComplete] = useState(false);
  useEffect(() => {
    setSetupComplete(new URLSearchParams(window.location.search).get('setup') === 'complete');
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [siteName, setSiteName] = useState('KaiyoLab');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (setup) {
        await api(
          '/api/setup',
          json('POST', { token: token.trim(), email, password, name, siteName }),
        );
        window.location.href = '/login?setup=complete';
      } else {
        await api('/api/auth/sign-in/email', json('POST', { email, password }));
        window.location.href = '/admin';
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <div className="admin-auth admin-app">
      <div className="admin-auth-visual">
        <a className="admin-brand" href="/">
          <span className="admin-brand-symbol">
            <Orbit size={24} />
          </span>
          <span>
            KaiyoLab<small>個人網站內容管理</small>
          </span>
        </a>
        <div className="admin-auth-copy">
          <div className="admin-eyebrow">KAIYOLAB CMS</div>
          <h1>內容管理後台</h1>
          <p>
            文章、作品與網站設定
            <br />
            登入後即可編輯與發布
          </p>
        </div>
        <div className="admin-auth-visual-footer">
          <span>管理文章、作品與網站資訊</span>
          <span>KAIYOLAB / ADMIN</span>
        </div>
      </div>
      <main className="admin-auth-main">
        <a className="admin-auth-back" href="/">
          <ArrowLeft size={15} /> 返回網站
        </a>
        <div className="admin-auth-form-wrapper">
          <span className="admin-auth-form-icon">
            {setup ? <Orbit size={25} /> : <LockKeyhole size={25} />}
          </span>
          <div className="admin-eyebrow">{setup ? '首次設定' : '管理後台'}</div>
          <h2>{setup ? '建立管理帳號' : '登入 KaiyoLab'}</h2>
          <p className="admin-auth-description">
            {setup ? '設定網站名稱與站長帳號，完成後即可開始使用' : '使用站長帳號登入'}
          </p>
          {!setup && setupComplete && (
            <div className="admin-alert success" role="status">
              <Check size={17} />
              設定完成，請使用剛建立的帳號登入
            </div>
          )}
          {error && (
            <div className="admin-alert" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={submit}>
            {setup && (
              <>
                <label>
                  一次性初始化碼
                  <div className="admin-input-icon">
                    <KeyRound size={17} />
                    <input
                      aria-label="一次性初始化碼"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      autoComplete="off"
                      placeholder="貼上容器日誌中的初始化碼"
                    />
                  </div>
                  <small>
                    在終端機執行 <code>docker compose logs app</code> 取得
                  </small>
                </label>
                <div className="admin-auth-row">
                  <label>
                    顯示名稱
                    <input
                      required
                      value={name}
                      maxLength={80}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="怎麼稱呼你？"
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    網站名稱
                    <input
                      required
                      value={siteName}
                      maxLength={80}
                      onChange={(e) => setSiteName(e.target.value)}
                    />
                  </label>
                </div>
              </>
            )}
            <label>
              電子郵件
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              {setup ? '設定密碼' : '密碼'}
              <div className="admin-password-input">
                <input
                  aria-label={setup ? '設定密碼' : '密碼'}
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={setup ? 'new-password' : 'current-password'}
                  minLength={setup ? 12 : undefined}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={setup ? '至少 12 個字元' : '輸入你的密碼'}
                />
                <button
                  type="button"
                  className="admin-icon-button"
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {setup && <small>建議使用多個單字組成的密碼，至少 12 個字元</small>}
            </label>
            <button
              className="admin-button primary admin-auth-submit"
              disabled={busy}
              type="submit"
            >
              {busy ? '處理中…' : setup ? '建立網站與管理帳號' : '登入後台'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="admin-auth-security">
            <ShieldCheck size={17} />
            <p>
              {setup
                ? '完成設定後，初始化入口會自動關閉'
                : '僅供站長登入；忘記密碼時，請依 README 的帳號復原步驟操作'}
            </p>
          </div>
        </div>
        <footer className="admin-auth-footer">KaiyoLab · 內容管理系統</footer>
      </main>
    </div>
  );
}
