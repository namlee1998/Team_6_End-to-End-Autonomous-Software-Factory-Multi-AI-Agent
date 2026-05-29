import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthActions } from '@/hooks/useAuthActions';
import { PASSWORD_RECOVERY_FLOW_KEY, useAuthStore } from '@/store/useAuthStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, Eye, EyeOff, Github } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type AuthMode =
  | 'signin'
  | 'signup'
  | 'success'
  | 'forgot-password'
  | 'reset-sent'
  | 'update-password';

const getFriendlyAuthError = (err: any, fallback: string) => {
  const raw = err?.response?.data?.message || err?.message || fallback;
  const normalized = String(raw).toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.';
  }
  if (normalized.includes('email not confirmed') || normalized.includes('confirm')) {
    return 'Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư và xác thực trước khi đăng nhập.';
  }
  if (normalized.includes('network') || normalized.includes('failed to fetch')) {
    return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  }
  if (normalized.includes('expired') || normalized.includes('invalid token')) {
    return 'Liên kết đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu lại.';
  }
  if (normalized.includes('password should be')) {
    return 'Mật khẩu chưa đáp ứng chính sách bảo mật. Vui lòng thử mật khẩu mạnh hơn.';
  }

  return raw;
};

export function AuthPage() {
  const navigate = useNavigate();
  const authActions = useAuthActions();
  const { session, setSession, signOut } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const isRecoveryFlow = sessionStorage.getItem(PASSWORD_RECOVERY_FLOW_KEY) === '1';
    if (!session) return;

    if (isRecoveryFlow) {
      setMode('update-password');
      setNotice('Bạn đang ở chế độ khôi phục mật khẩu. Hãy đặt mật khẩu mới để tiếp tục.');
      return;
    }

    navigate('/sdlc');
  }, [session, navigate]);

  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[^A-Za-z0-9]/.test(password)) strength += 25;
    setPasswordStrength(strength);
  }, [password]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === 'signup') {
        const result = await authActions.signUpWithEmail({
          email,
          password,
          company_name: companyName || undefined,
          company_email: companyEmail || undefined,
          job_title: jobTitle || undefined,
          redirect_to: `${window.location.origin}/auth`,
        });
        if (result.session) {
          setSession(result.session);
          navigate('/sdlc');
        } else {
          setMode('success');
        }
      } else {
        const result = await authActions.signInWithEmail({ email, password });
        if (!result.session) throw new Error('No active session returned');
        setSession(result.session);
        navigate('/sdlc');
      }
    } catch (err: any) {
      setError(getFriendlyAuthError(err, 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'github') => {
    try {
      setLoading(true);
      setError(null);
      const { url } = await authActions.getOAuthUrl({
        provider,
        redirect_to: `${window.location.origin}/auth`,
      });
      if (!url) throw new Error('OAuth URL is not available');
      window.location.href = url;
    } catch (err: any) {
      setError(getFriendlyAuthError(err, `Failed to authenticate with ${provider}`));
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await authActions.requestPasswordReset({
        email,
        redirect_to: `${window.location.origin}/auth`,
      });
      setMode('reset-sent');
    } catch (err: any) {
      setError(getFriendlyAuthError(err, 'Không thể gửi email khôi phục mật khẩu'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (!newPassword || newPassword.length < 8) {
      setError('Mật khẩu mới cần ít nhất 8 ký tự.');
      setLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      setLoading(false);
      return;
    }

    try {
      await authActions.updatePassword({ password: newPassword });
      await signOut();
      sessionStorage.removeItem(PASSWORD_RECOVERY_FLOW_KEY);
      setMode('signin');
      setNotice('Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.');
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');
    } catch (err: any) {
      setError(getFriendlyAuthError(err, 'Không thể cập nhật mật khẩu'));
    } finally {
      setLoading(false);
    }
  };

  const resetToSignIn = async () => {
    sessionStorage.removeItem(PASSWORD_RECOVERY_FLOW_KEY);
    if (session) {
      await signOut();
    }
    setMode('signin');
    setError(null);
  };

  if (mode === 'success' || mode === 'reset-sent') {
    const isResetSent = mode === 'reset-sent';
    return (
      <div className="min-h-screen bg-[#0A0B10] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#11131A] rounded-2xl shadow-xl border border-white/10 p-8 text-center space-y-6"
        >
          <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white">
            {isResetSent ? 'Check your inbox' : 'Registration Successful'}
          </h2>
          <p className="text-slate-400">
            {isResetSent
              ? 'We sent a password recovery link. Please open your email and follow the instructions.'
              : 'Please check your email to verify your account before signing in.'}
          </p>
          <Button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white border-none" onClick={() => setMode('signin')}>
            Back to Sign In
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0B10] flex overflow-hidden font-sans">
      {/* Left Column */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:w-[480px] xl:w-[540px] bg-[#0A0B10] z-10 relative border-r border-white/5">
        <div className="mx-auto w-full max-w-sm py-12 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Logo area matching screenshot */}
            <div className="flex justify-between items-center mb-16">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#8B5CF6] flex items-center justify-center text-white font-bold text-lg shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                  AI
                </div>
                <span className="text-xl font-bold text-white tracking-wide">AIDLC Platform</span>
              </div>
              <div className="px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-bold tracking-wider uppercase">
                Demo
              </div>
            </div>

            <h2 className="text-[32px] font-bold tracking-tight text-white mb-2 leading-tight">
              {mode === 'signin' && 'Welcome back'}
              {mode === 'signup' && 'Create an account'}
              {mode === 'forgot-password' && 'Reset password'}
              {mode === 'update-password' && 'Set new password'}
            </h2>

            {(mode === 'signin' || mode === 'signup') && (
              <p className="text-sm text-slate-400 mb-8">
                {mode === 'signin' ? 'Sign in to access the Autonomous Software Factory' : 'Sign up to access the Autonomous Software Factory'}
              </p>
            )}

            {mode === 'forgot-password' && (
              <p className="text-sm text-slate-400 mb-8">
                Enter your account email and we will send you a recovery link.
              </p>
            )}
          </motion.div>

          <div className="mt-8">
            {(mode === 'signin' || mode === 'signup') && (
              <form onSubmit={handleEmailAuth} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@aidlc.ai"
                    autoComplete="email"
                    className="w-full h-11 px-4 bg-[#13151D] border border-slate-800 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="relative group">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-slate-300">Password</label>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    className="w-full h-11 px-4 bg-[#13151D] border border-slate-800 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 bottom-3 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {notice && (
                  <div className="p-3 text-sm text-indigo-300 bg-indigo-900/20 rounded-lg border border-indigo-800/50">
                    {notice}
                  </div>
                )}
                {error && (
                  <div className="p-3 text-sm text-red-400 bg-red-900/20 rounded-lg border border-red-800/50">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 text-[15px] font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white border-none rounded-lg shadow-[0_4px_14px_0_rgba(139,92,246,0.39)] hover:shadow-[0_6px_20px_rgba(139,92,246,0.23)] transition duration-200"
                  disabled={loading}
                >
                  {loading ? 'Processing...' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
              </form>
            )}

            {mode === 'forgot-password' && (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Account Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@aidlc.ai"
                    autoComplete="email"
                    className="w-full h-11 px-4 bg-[#13151D] border border-slate-800 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
                {error && (
                  <div className="p-3 text-sm text-red-400 bg-red-900/20 rounded-lg border border-red-800/50">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full h-12 text-[15px] font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white border-none rounded-lg shadow-[0_4px_14px_0_rgba(139,92,246,0.39)] transition duration-200"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-slate-400 hover:text-white transition-colors mt-4"
                  onClick={() => setMode('signin')}
                >
                  Back to sign in
                </button>
              </form>
            )}

            {mode === 'update-password' && (
              <form onSubmit={handleUpdatePassword} className="space-y-5">
                 <div className="relative group">
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">New Password</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full h-11 px-4 bg-[#13151D] border border-slate-800 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 bottom-3 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm New Password</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full h-11 px-4 bg-[#13151D] border border-slate-800 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
                {error && (
                  <div className="p-3 text-sm text-red-400 bg-red-900/20 rounded-lg border border-red-800/50">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full h-12 text-[15px] font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white border-none rounded-lg shadow-[0_4px_14px_0_rgba(139,92,246,0.39)] transition duration-200"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update password'}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-slate-400 hover:text-white transition-colors mt-4"
                  onClick={resetToSignIn}
                >
                  Cancel and return to sign in
                </button>
              </form>
            )}

            {/* Demo Account Autofill Card */}
            {(mode === 'signin') && (
              <div 
                className="mt-8 p-4 rounded-xl border border-indigo-500/20 bg-gradient-to-br from-[#13151D] to-[#0A0B10] hover:border-indigo-500/40 cursor-pointer transition-all group"
                onClick={() => {
                  setEmail('dev@aidlc.ai');
                  setPassword('dev123');
                }}
              >
                <p className="text-[10px] font-bold text-slate-400 tracking-wider mb-3 uppercase">Demo Account - Click to Autofill</p>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">DEVELOPER</span>
                  <span className="text-sm font-mono text-slate-400 group-hover:text-white transition-colors">dev@aidlc.ai - dev123</span>
                </div>
              </div>
            )}
            
            {(mode === 'signin' || mode === 'signup') && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => {
                    setMode(mode === 'signin' ? 'signup' : 'signin');
                    setError(null);
                    setNotice(null);
                  }}
                  className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
                >
                  {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>

                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot-password');
                      setError(null);
                      setNotice(null);
                    }}
                    className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="hidden lg:flex relative flex-1 bg-[#0A0B10] overflow-hidden items-center justify-center">
        {/* Glow Effects */}
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-blue-900/10 blur-[100px] pointer-events-none" />
        
        <div className="relative z-20 w-full max-w-[600px] px-12 xl:px-16">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <h1 className="text-[44px] xl:text-[56px] font-black text-white tracking-tight leading-[1.1] mb-6 font-['Outfit',sans-serif]">
              End-to-End<br />
              <span className="bg-gradient-to-r from-[#8B5CF6] to-[#C084FC] bg-clip-text text-transparent">Autonomous</span><br />
              <span className="bg-gradient-to-r from-[#8B5CF6] to-[#38BDF8] bg-clip-text text-transparent">Software Factory</span>
            </h1>
            
            <p className="text-[15px] xl:text-base text-slate-400 leading-relaxed mb-10 max-w-lg">
              Supervisor-worker workflow: one supervisor fans out PO, UX, DEV, and QA workers in parallel, then fans in for HITL review.<br/>
              Full Human-in-the-Loop control with audit-ready artifacts.
            </p>

            <div className="space-y-3">
              {/* Feature Cards */}
              <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-default">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center font-bold text-white text-sm">AI</div>
                <p className="text-sm text-slate-300">Supervisor-worker branching with parallel execution</p>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-default">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center font-bold text-white text-[11px]">HITL</div>
                <p className="text-sm text-slate-300">HITL gates with approve / reject / rework</p>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-default">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center font-bold text-white text-xs">LOG</div>
                <p className="text-sm text-slate-300">Immutable audit trail - export JSON / CSV</p>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-default">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center font-bold text-white text-[10px]">RISK</div>
                <p className="text-sm text-slate-300">Risk-based HITL review for HIGH risk changes</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
