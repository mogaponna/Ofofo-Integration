import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (email: string, token: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if electron API is available
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.electron) {
      console.error('[Login] Electron API not available');
      setError('Application not properly initialized. Please restart the app.');
    }
  }, []);

  const handleSendOTP = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('[Login] Checking electron API...');
      if (!window.electron?.db?.sendOTP) {
        throw new Error('Database connection not available');
      }
      console.log('[Login] Electron API available, calling sendOTP...');

      const result = await window.electron.db.sendOTP({ email: email.toLowerCase().trim() });
      console.log('[Login] sendOTP result:', result);

      if (result.success) {
        setStep('otp');
      } else {
        setError(result.error || 'Failed to send OTP. Please try again.');
      }
    } catch (err: any) {
      console.error('[Login] OTP send error caught in renderer:');
      console.error('[Login] Error message:', err.message);
      console.error('[Login] Error stack:', err.stack);
      console.error('[Login] Full error object:', err);
      
      // Check if it's a searchParams error
      const errorMessage = err.message || 'Network error. Please check your connection and try again.';
      if (errorMessage.includes('searchParams')) {
        console.error('[Login] ========================================');
        console.error('[Login] SEARCHPARAMS ERROR IN RENDERER!');
        console.error('[Login] This error is being displayed to the user');
        console.error('[Login] ========================================');
        setError('Application error: ' + errorMessage + '. Please check the console for details.');
      } else if (errorMessage.includes('Bad request') || errorMessage.includes('400')) {
        setError('Invalid request. Please check your email address and try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!window.electron?.db?.verifyOTP) {
        throw new Error('Database connection not available');
      }

      const result = await window.electron.db.verifyOTP({ 
        email: email.toLowerCase().trim(), 
        otp: otp.trim() 
      });

      if (result.success && result.user) {
        onLoginSuccess(result.user.email, result.user.token);
      } else {
        setError(result.error || 'Invalid OTP. Please try again.');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Network error. Please check your connection and try again.';
      if (errorMessage.includes('Bad request') || errorMessage.includes('400')) {
        setError('Invalid request. Please check your OTP and try again.');
      } else {
        setError(errorMessage);
      }
      console.error('OTP verify error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
            <img src="./assets/logo.png" alt="Ofofo" className="w-16 h-16 object-contain" onError={(e) => {
              console.error('Logo failed to load:', e);
              // Fallback: try absolute path
              (e.target as HTMLImageElement).src = '/assets/logo.png';
            }} />
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-black">
          {step === 'email' ? (
            <>
              <h1 className="text-2xl font-semibold text-white mb-8 text-center">
                Sign in to your account
              </h1>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && !loading && handleSendOTP()}
                    placeholder="user@acme.com"
                    className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    autoFocus
                    disabled={loading}
                  />
                </div>

                <button
                  onClick={handleSendOTP}
                  disabled={loading || !email}
                  className="w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send OTP'
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-white mb-2 text-center">
                Verify your email
              </h1>
              <p className="text-sm text-gray-400 text-center mb-8">
                We sent a 6-digit code to <span className="text-white font-medium">{email}</span>
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Enter Verification Code
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtp(value);
                      setError('');
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && !loading && handleVerifyOTP()}
                    placeholder="000000"
                    className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-center text-xl tracking-widest font-mono"
                    autoFocus
                    maxLength={6}
                    disabled={loading}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setStep('email');
                      setOtp('');
                      setError('');
                    }}
                    className="flex-1 py-3 px-4 rounded-lg bg-[#1a1a1a] border border-[#333333] hover:border-[#444444] text-white font-medium transition-all"
                    disabled={loading}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleVerifyOTP}
                    disabled={loading || otp.length !== 6}
                    className="flex-1 py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify'
                    )}
                  </button>
                </div>

                <button
                  onClick={handleSendOTP}
                  disabled={loading}
                  className="w-full text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  Resend Code
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
