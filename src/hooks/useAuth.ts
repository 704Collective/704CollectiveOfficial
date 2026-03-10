'use client';

// useAuth is now a thin wrapper around AuthContext.
// All auth state is initialized ONCE at app startup in AuthProvider (Providers.tsx).
// This means navigating between dashboard pages no longer re-runs getSession(),
// so pages no longer show a loading skeleton on every navigation.
export { useAuthContext as useAuth } from '@/contexts/AuthContext';