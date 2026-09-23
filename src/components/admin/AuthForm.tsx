import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { api, errorMessage, json } from './api';
import ThemeButton from './ThemeButton';

export default function AuthForm({ mode }: { mode: 'login' | 'setup' }) {
  const setup = mode === 'setup';
  const [setupComplete, setSetupComplete] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [siteName, setSiteName] = useState('KaiyoLab');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => { setSetupComplete(new URLSearchParams(window.location.search).get('setup') === 'complete'); }, []);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error]);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current) return;
    submitted.current = true; setBusy(true); setError('');
    try {
      if (setup) {
        await api('/api/setup', json('POST', { token: token.trim(), email, password, name, siteName }));
        window.location.href = '/login?setup=complete';
      } else {
        await api('/api/auth/sign-in/email', json('POST', { email, password }));
        window.location.href = '/admin';
      }
    } catch (cause) { setError(errorMessage(cause)); submitted.current = false; setBusy(false); }
  }
  return <div className="admin-auth admin-app">
    <aside className="admin-auth-visual" aria-label="About this workspace"><a className="admin-brand" href="/"><span>KaiyoLab<span className="admin-brand-dot">.</span><small>Your personal publishing space</small></span></a><div className="admin-auth-copy"><div className="admin-eyebrow">WRITE. BUILD. SHARE.</div><h2>A place for your ideas.</h2><p>Development notes, side projects, and things worth documenting. Make this corner of the web your own.</p></div><div className="admin-auth-visual-footer">Your content. Your website.</div></aside>
    <main className="admin-auth-main">
      <div className="admin-auth-tools"><a className="admin-auth-back" href="/"><ArrowLeft size={16} />Back to website</a><ThemeButton /></div>
      <div className="admin-auth-form-wrapper"><div className="admin-eyebrow">{setup ? 'FIRST-TIME SETUP' : 'KAIYOLAB ADMIN'}</div><h1>{setup ? 'Set up your workspace' : 'Welcome back'}</h1><p className="admin-auth-description">{setup ? 'Create your site and owner account to start publishing.' : 'Sign in to manage your writing and projects.'}</p>
        {!setup && setupComplete && <div className="admin-alert success" role="status"><Check size={17} />Setup complete. Sign in with your new owner account.</div>}
        {error && <div ref={errorSummary} className="admin-alert" role="alert" tabIndex={-1}>{error}</div>}
        <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}><legend className="sr-only">{setup ? 'Owner account details' : 'Sign-in details'}</legend>
          {setup && <><label>One-time setup token<div className="admin-input-icon"><KeyRound size={17} /><input aria-label="One-time setup token" required value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" maxLength={200} spellCheck={false} placeholder="Paste the token from your container logs" /></div><small>In your terminal, run <code>docker compose logs app</code> to find it.</small></label><div className="admin-auth-row"><label>Display name<input required value={name} maxLength={80} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="What should we call you?" /></label><label>Site name<input required value={siteName} maxLength={80} onChange={(event) => setSiteName(event.target.value)} /></label></div></>}
          <label>Email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoCapitalize="none" spellCheck={false} /></label>
          <label>{setup ? 'Set password' : 'Password'}<div className="admin-password-input"><input aria-label={setup ? 'Set password' : 'Password'} required type={showPassword ? 'text' : 'password'} autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 12 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={setup ? 'At least 12 characters' : 'Enter your password'} /><button type="button" className="admin-icon-button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{setup && <small>Use a memorable passphrase with at least 12 characters.</small>}</label>
          <button className="admin-button primary admin-auth-submit" disabled={busy} type="submit">{busy ? 'Working…' : setup ? 'Create site and account' : 'Sign in'}<ArrowRight size={17} /></button>
        </fieldset></form>
        <div className="admin-auth-security"><ShieldCheck size={17} /><p>{setup ? 'The setup page is disabled once your owner account is created.' : 'Owner access only. For a lost password, follow the account recovery steps in the README.'}</p></div>
      </div>
      <footer className="admin-auth-footer">KaiyoLab · A private space to publish.</footer>
    </main>
  </div>;
}
