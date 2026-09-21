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
  Sparkles,
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
            KaiyoLab<small>你的靈感，有了自己的座標</small>
          </span>
        </a>
        <div className="admin-auth-art" aria-hidden="true">
          <div className="auth-orbit orbit-a" />
          <div className="auth-orbit orbit-b" />
          <div className="auth-orbit orbit-c" />
          <div className="auth-planet">
            <Orbit size={100} strokeWidth={0.75} />
          </div>
          <span className="auth-star star-a" />
          <span className="auth-star star-b" />
          <span className="auth-star star-c" />
          <span className="auth-coordinate">25°03′ N / 121°33′ E</span>
          <span className="auth-cross cross-a">+</span>
          <span className="auth-cross cross-b">+</span>
        </div>
        <div className="admin-auth-copy">
          <div className="admin-eyebrow">
            <Sparkles size={14} /> 自由探索，自在創作
          </div>
          <h1>
            記錄此刻的想法，
            <br />
            抵達更遠的地方。
          </h1>
          <p>
            一個屬於你的內容基地。
            <br />
            讓每次探索，成為下一段旅程的起點。
          </p>
        </div>
        <div className="admin-auth-visual-footer">
          <span>獨立創作 · 自由掌握</span>
          <span>KAIYOLAB / 創作工作室</span>
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
          <div className="admin-eyebrow">{setup ? '開啟你的創作旅程' : '歡迎回來'}</div>
          <h2>{setup ? '建立你的創作基地' : '登入工作空間'}</h2>
          <p className="admin-auth-description">
            {setup ? '完成一次設定，開始管理你的文章與作品。' : '今天的新想法，值得好好記錄。'}
          </p>
          {!setup && setupComplete && (
            <div className="admin-alert success" role="status">
              <Check size={17} />
              設定完成，請使用剛建立的帳號登入。
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
                    在終端機執行 <code>docker compose logs app</code> 取得。
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
              {setup && <small>建議使用多個單字組成的密碼，至少 12 個字元。</small>}
            </label>
            <button
              className="admin-button primary admin-auth-submit"
              disabled={busy}
              type="submit"
            >
              {busy ? '處理中…' : setup ? '建立網站與管理帳號' : '進入工作空間'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="admin-auth-security">
            <ShieldCheck size={17} />
            <p>
              {setup
                ? '這是私人管理空間。完成設定後，初始化入口會自動關閉。'
                : '僅供網站管理者登入。忘記密碼時，可依 README 使用容器帳號復原指令。'}
            </p>
          </div>
        </div>
        <footer className="admin-auth-footer">KaiyoLab · 讓每個值得記錄的想法，都有歸屬。</footer>
      </main>
    </div>
  );
}
