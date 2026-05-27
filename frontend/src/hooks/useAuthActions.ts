import { useMemo } from 'react';
import {
  getOAuthUrl,
  requestPasswordReset,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
} from '@/services/api';

export function useAuthActions() {
  return useMemo(
    () => ({
      getOAuthUrl,
      requestPasswordReset,
      signInWithEmail,
      signUpWithEmail,
      updatePassword,
    }),
    [],
  );
}
