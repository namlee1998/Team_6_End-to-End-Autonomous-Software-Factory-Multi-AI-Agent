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

const MatrixRain = () => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.offsetWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.offsetHeight || window.innerHeight);

    const columns = Math.floor(width / 20);
    const drops: number[] = [];
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100;
    }

    const chars = '0101010101010101'.split('');
    let animationFrameId: number;

    const draw = () => {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.15)';
      ctx.fillRect(0, 0, width, height);
      ctx.font = '14px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillText(text, i * 20, drops[i] * 20);

        if (drops[i] * 20 > height && Math.random() > 0.99) {
          drops[i] = 0;
        }
        drops[i] += 0.15;
      }
      animationFrameId = requestAnimationFrame(draw);
    };

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.offsetWidth;
      height = canvas.height = canvas.parentElement.offsetHeight;
    };

    window.addEventListener('resize', handleResize);
    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full pointer-events-none opacity-80"
    />
  );
};

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

  const HERO_MESSAGES = [
    {
      title: (
        <>
          Elevate your <br />{' '}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            quality assurance
          </span>
        </>
      ),
      desc: 'Join the platform that helps enterprise teams build robust automation flows and ensure unparalleled software quality.',
    },
    {
      title: (
        <>
          Accelerate your <br />{' '}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            AI innovation
          </span>
        </>
      ),
      desc: 'Join the ecosystem designed for engineers to deploy high-performance models and scale intelligent workflows with ease.',
    },
    {
      title: (
        <>
          Master your <br />{' '}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            automation architecture
          </span>
        </>
      ),
      desc: 'Empower your team with tools that transform complex backend logic into seamless, production-ready automation flows.',
    },
  ];
  const [heroIndex, setHeroIndex] = useState(0);

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

  useEffect(() => {
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % HERO_MESSAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [HERO_MESSAGES.length]);

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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-6"
        >
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isResetSent ? 'Check your inbox' : 'Registration Successful'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            {isResetSent
              ? 'We sent a password recovery link. Please open your email and follow the instructions.'
              : 'Please check your email to verify your account before signing in.'}
          </p>
          <Button className="w-full" onClick={() => setMode('signin')}>
            Back to Sign In
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex overflow-hidden">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:w-1/2 xl:w-5/12 bg-slate-950 z-10 shadow-2xl relative border-r border-white/5">
        <MatrixRain />
        <div className="mx-auto w-full max-w-sm lg:w-96 py-12 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-8">
              <img src="/favicon.svg" alt="logo" className="w-8 h-8" />
              <span className="text-xl font-bold text-white">Mobile Auto</span>
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-white">
              {mode === 'signin' && 'Welcome back'}
              {mode === 'signup' && 'Create an account'}
              {mode === 'forgot-password' && 'Reset your password'}
              {mode === 'update-password' && 'Set a new password'}
            </h2>

            {(mode === 'signin' || mode === 'signup') && (
              <p className="mt-2 text-sm text-slate-400">
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => {
                    setMode(mode === 'signin' ? 'signup' : 'signin');
                    setError(null);
                    setNotice(null);
                  }}
                  className="font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {mode === 'signin' ? 'Start for free' : 'Sign in instead'}
                </button>
              </p>
            )}

            {mode === 'forgot-password' && (
              <p className="mt-2 text-sm text-slate-400">
                Enter your account email and we will send you a recovery link.
              </p>
            )}

            {mode === 'update-password' && (
              <p className="mt-2 text-sm text-slate-400">
                Choose a strong new password for your account.
              </p>
            )}
          </motion.div>

          <div className="mt-8">
            {(mode === 'signin' || mode === 'signup') && (
              <form onSubmit={handleEmailAuth} className="space-y-5">
                <Input
                  label="Email address"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />

                <div className="relative group">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>

                  {mode === 'signup' && password.length > 0 && (
                    <div className="mt-2 space-y-1.5 animate-in fade-in duration-300">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span>Security Strength</span>
                        <span
                          className={
                            passwordStrength <= 25
                              ? 'text-red-500'
                              : passwordStrength <= 50
                                ? 'text-orange-500'
                                : passwordStrength <= 75
                                  ? 'text-yellow-500'
                                  : 'text-green-500'
                          }
                        >
                          {passwordStrength <= 25
                            ? 'Weak'
                            : passwordStrength <= 50
                              ? 'Fair'
                              : passwordStrength <= 75
                                ? 'Good'
                                : 'Very Strong'}
                        </span>
                      </div>
                      <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${passwordStrength}%` }}
                          className={`h-full transition-colors duration-500 ${
                            passwordStrength <= 25
                              ? 'bg-red-500'
                              : passwordStrength <= 50
                                ? 'bg-orange-500'
                                : passwordStrength <= 75
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                          }`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {mode === 'signup' && (
                    <motion.div
                      key="signup-fields"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-5 overflow-hidden"
                    >
                      <div className="relative pt-2">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                          <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                        </div>
                        <div className="relative flex justify-center text-sm font-medium leading-6">
                          <span className="bg-white dark:bg-slate-900 px-6 text-slate-500">
                            Company details (optional)
                          </span>
                        </div>
                      </div>

                      <Input
                        label="Company Name"
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Acme Corp"
                      />
                      <Input
                        label="Company Email"
                        type="email"
                        value={companyEmail}
                        onChange={(e) => setCompanyEmail(e.target.value)}
                        placeholder="billing@acme.com"
                      />
                      <Input
                        label="Job Title"
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="QA Engineer"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot-password');
                      setError(null);
                      setNotice(null);
                    }}
                    className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}

                {notice && (
                  <div className="p-3 text-sm text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-800">
                    {notice}
                  </div>
                )}
                {error && (
                  <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-base font-medium"
                  disabled={loading}
                >
                  {loading ? 'Processing...' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
              </form>
            )}

            {mode === 'forgot-password' && (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <Input
                  label="Account Email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
                {error && (
                  <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full h-11 text-base font-medium"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  onClick={() => setMode('signin')}
                >
                  Back to sign in
                </Button>
              </form>
            )}

            {mode === 'update-password' && (
              <form onSubmit={handleUpdatePassword} className="space-y-5">
                {notice && (
                  <div className="p-3 text-sm text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-800">
                    {notice}
                  </div>
                )}
                <div className="relative group">
                  <Input
                    label="New Password"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <Input
                  label="Confirm New Password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Retype your password"
                  autoComplete="new-password"
                />
                {error && (
                  <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full h-11 text-base font-medium"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update password'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  onClick={resetToSignIn}
                >
                  Cancel and return to sign in
                </Button>
              </form>
            )}

            {(mode === 'signin' || mode === 'signup') && (
              <motion.div layout className="mt-8">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-sm font-medium leading-6">
                    <span className="bg-slate-950 px-6 text-slate-400">Or continue with</span>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={() => handleSocialAuth('google')}
                    disabled={loading}
                  >
                    <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Google
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={() => handleSocialAuth('github')}
                    disabled={loading}
                  >
                    <Github className="h-5 w-5 mr-2" />
                    GitHub
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <div className="hidden lg:block relative flex-1 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 z-10 mix-blend-overlay" />
        <motion.img
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.5 }}
          transition={{ duration: 1.5 }}
          className="absolute inset-0 h-full w-full object-cover"
          src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop"
          alt="Premium workspace"
        />
        <div className="absolute inset-0 z-20 flex flex-col justify-center items-start p-16 sm:p-24 lg:p-32">
          <AnimatePresence mode="wait">
            <motion.div
              key={heroIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-6 leading-tight">
                {HERO_MESSAGES[heroIndex].title}
              </h1>
              <p className="mt-4 text-xl text-slate-300 max-w-lg leading-relaxed">
                {HERO_MESSAGES[heroIndex].desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
