'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

type Status = 'loading' | 'setup' | 'success' | 'error';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  company: string;
  title: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
}

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    company: '',
    title: '',
  });

  const attemptRef = useRef(0);
  const maxAttempts = 5;
  const retryDelay = 2000;

  useEffect(() => {
    if (!sessionId) {
      router.replace('/dashboard');
      return;
    }

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-checkout-session', {
          body: { session_id: sessionId },
        });

        if (error || data?.error) {
          attemptRef.current += 1;
          if (attemptRef.current < maxAttempts) {
            setTimeout(verify, retryDelay);
          } else {
            setErrorMsg(data?.error || 'Something went wrong verifying your session.');
            setStatus('error');
          }
          return;
        }

        const fullName = (data?.name || '').trim();
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        setForm(prev => ({
          ...prev,
          firstName,
          lastName,
          email: data?.email || '',
          phone: data?.phone || '',
        }));

        setStatus('setup');
      } catch {
        attemptRef.current += 1;
        if (attemptRef.current < maxAttempts) {
          setTimeout(verify, retryDelay);
        } else {
          setStatus('error');
          setErrorMsg('Could not verify your checkout session.');
        }
      }
    };

    verify();
  }, [sessionId, router]);

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errors: FormErrors = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required';
    if (!form.phone.trim()) errors.phone = 'Phone number is required';
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('set-initial-password', {
        body: {
          session_id: sessionId,
          email: form.email,
          password: form.password,
          first_name: form.firstName,
          last_name: form.lastName,
          phone: form.phone,
          company: form.company,
          title: form.title,
        },
      });

      if (error || data?.error) {
        const msg = data?.error || error?.message || 'Failed to set up account.';
        if (msg === 'already_setup') {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
          });
          if (signInErr) {
            setFormErrors({ password: 'This account is already set up. Try signing in.' });
            setSubmitting(false);
            return;
          }
          setStatus('success');
          setTimeout(() => router.push('/dashboard?welcome=1'), 2000);
          return;
        }
        setFormErrors({ password: msg });
        setSubmitting(false);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });

      if (signInErr) {
        setFormErrors({ password: 'Account created but sign-in failed. Please sign in manually.' });
        setSubmitting(false);
        return;
      }

      setStatus('success');
      setTimeout(() => router.push('/dashboard?welcome=1'), 2000);
    } catch {
      setFormErrors({ password: 'Something went wrong. Please try again.' });
      setSubmitting(false);
    }
  };

  const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#FFFFFF',
    fontSize: '16px' as const,
    minHeight: '48px',
  };

  const errorInputStyle = {
    ...inputStyle,
    border: '1px solid #ef4444',
  };

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px', backgroundColor: '#0d0d0d', minHeight: '100dvh' }}>
        <MarketingPageRoot>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          margin: '0 auto',
          padding: 'clamp(32px, 6vw, 56px) clamp(16px, 5vw, 24px)',
        }}>

          {/* Loading */}
          {status === 'loading' && (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <Loader2 style={{ width: '48px', height: '48px', color: '#C6A664', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                Confirming your membership...
              </h1>
              <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)' }}>
                This only takes a moment.
              </p>
            </div>
          )}

          {/* Setup Form */}
          {status === 'setup' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  backgroundColor: 'rgba(198,166,100,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: '1.5rem',
                }}>
                  🎉
                </div>
                <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 1.875rem)', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                  Welcome to 704 Collective!
                </h1>
                <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Your membership is confirmed. Finish setting up your account below.
                </p>
              </div>

              <div style={{
                backgroundColor: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: 'clamp(24px, 5vw, 32px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}>

                {/* Name row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <Label htmlFor="firstName" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                      First Name <span style={{ color: '#ef4444' }}>*</span>
                    </Label>
                    <Input
                      id="firstName"
                      type="text"
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={e => updateField('firstName', e.target.value)}
                      style={formErrors.firstName ? errorInputStyle : inputStyle}
                    />
                    {formErrors.firstName && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.firstName}</p>}
                  </div>
                  <div>
                    <Label htmlFor="lastName" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                      Last Name <span style={{ color: '#ef4444' }}>*</span>
                    </Label>
                    <Input
                      id="lastName"
                      type="text"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={e => updateField('lastName', e.target.value)}
                      style={formErrors.lastName ? errorInputStyle : inputStyle}
                    />
                    {formErrors.lastName && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.lastName}</p>}
                  </div>
                </div>

                {/* Email read-only */}
                <div>
                  <Label htmlFor="email" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    disabled
                    style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}
                  />
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '4px' }}>
                    From your Stripe checkout
                  </p>
                </div>

                {/* Phone */}
                <div>
                  <Label htmlFor="phone" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Phone <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="xxx-xxx-xxxx"
                    value={form.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    style={formErrors.phone ? errorInputStyle : inputStyle}
                  />
                  {formErrors.phone && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.phone}</p>}
                </div>

                {/* Password */}
                <div>
                  <Label htmlFor="password" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Create Password <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Min. 8 characters"
                      value={form.password}
                      onChange={e => updateField('password', e.target.value)}
                      style={{ ...(formErrors.password ? errorInputStyle : inputStyle), paddingRight: '48px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {formErrors.password && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.password}</p>}
                </div>

                {/* Confirm Password */}
                <div>
                  <Label htmlFor="confirmPassword" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Confirm Password <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={form.confirmPassword}
                      onChange={e => updateField('confirmPassword', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                      style={{ ...(formErrors.confirmPassword ? errorInputStyle : inputStyle), paddingRight: '48px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {formErrors.confirmPassword && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.confirmPassword}</p>}
                </div>

                {/* Optional divider */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4px' }}>
                  <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                    Optional
                  </p>
                </div>

                {/* Company */}
                <div>
                  <Label htmlFor="company" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Company
                  </Label>
                  <Input
                    id="company"
                    type="text"
                    autoComplete="organization"
                    placeholder="Where do you work?"
                    value={form.company}
                    onChange={e => updateField('company', e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Title */}
                <div>
                  <Label htmlFor="title" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Title
                  </Label>
                  <Input
                    id="title"
                    type="text"
                    autoComplete="organization-title"
                    placeholder="What's your role?"
                    value={form.title}
                    onChange={e => updateField('title', e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    minHeight: '52px',
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    marginTop: '4px',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 200ms ease',
                  }}
                >
                  {submitting ? (
                    <><Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />Setting up your account...</>
                  ) : (
                    'Complete Setup & Go to Dashboard →'
                  )}
                </button>

                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>
                  You can add a profile photo from your dashboard
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <CheckCircle style={{ width: '56px', height: '56px', color: '#22c55e', margin: '0 auto 20px' }} />
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                You&apos;re all set, {form.firstName}!
              </h1>
              <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>
                Taking you to your dashboard now...
              </p>
              <div style={{ height: '2px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '1px', overflow: 'hidden' }}>
                <div style={{ height: '100%', backgroundColor: '#C6A664', animation: 'progress 2s linear forwards' }} />
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <XCircle style={{ width: '48px', height: '48px', color: '#ef4444', margin: '0 auto 20px' }} />
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                Something went wrong
              </h1>
              <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)', marginBottom: '24px', lineHeight: 1.6 }}>
                {errorMsg || "We couldn't verify your session. Your payment may still have gone through."}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={() => router.push('/dashboard')}
                  style={{ width: '100%', minHeight: '48px', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9375rem' }}
                >
                  Try Dashboard
                </button>
                <a
                  href="mailto:hello@704collective.com"
                  style={{ display: 'block', textAlign: 'center', fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', padding: '12px' }}
                >
                  Contact Support
                </a>
              </div>
            </div>
          )}
        </div>
        </MarketingPageRoot>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes progress { from { width: 0% } to { width: 100% } }
      `}</style>
    </>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', backgroundColor: '#0d0d0d' }} />}>
      <WelcomeContent />
    </Suspense>
  );
}