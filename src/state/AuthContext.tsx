import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type {
  AccountType,
  AuthResponse,
  ChangePasswordPayload,
  LoginPayload,
  UserProfile,
} from '../services/auth/authTypes';
import {
  changePasswordUser,
  clearSession,
  fetchCurrentUser,
  getStoredToken,
  getStoredUser,
  loginUser,
} from '../services/auth/authService';

export type AuthModalMode = 'login' | 'reset' | 'set_new_password' | 'profile';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  authModalMode: AuthModalMode;
  activeTab: AccountType;
  openLogin: (tab?: AccountType) => void;
  openReset: () => void;
  openProfile: () => void;
  openSetNewPassword: () => void;
  closeAuthModal: () => void;
  setActiveTab: (tab: AccountType) => void;
  login: (payload: LoginPayload) => Promise<AuthResponse>;
  changePassword: (payload: ChangePasswordPayload) => Promise<AuthResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [activeTab, setActiveTab] = useState<AccountType>('student');

  // Verify and refresh session on mount
  useEffect(() => {
    let isMounted = true;
    async function initSession() {
      const storedToken = getStoredToken();
      if (!storedToken) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const profile = await fetchCurrentUser(storedToken);
        if (isMounted && profile) {
          setUser(profile);
          setToken(storedToken);
          // If required to change password, open modal in set_new_password mode
          if (profile.must_change_password) {
            setAuthModalMode('set_new_password');
            setIsAuthModalOpen(true);
          }
        }
      } catch {
        // If session expired or invalid, keep storedUser if offline or reset
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const openLogin = useCallback((tab?: AccountType) => {
    if (tab) setActiveTab(tab);
    setAuthModalMode('login');
    setIsAuthModalOpen(true);
  }, []);

  const openReset = useCallback(() => {
    setAuthModalMode('reset');
    setIsAuthModalOpen(true);
  }, []);

  const openProfile = useCallback(() => {
    setAuthModalMode('profile');
    setIsAuthModalOpen(true);
  }, []);

  const openSetNewPassword = useCallback(() => {
    setAuthModalMode('set_new_password');
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    // Prevent closing if user must change password
    if (user?.must_change_password && authModalMode === 'set_new_password') {
      return;
    }
    setIsAuthModalOpen(false);
  }, [user?.must_change_password, authModalMode]);

  const login = useCallback(async (payload: LoginPayload): Promise<AuthResponse> => {
    const res = await loginUser(payload);
    setToken(res.access_token);
    const profile: UserProfile = {
      user_id: res.user_id,
      account_type: res.account_type,
      is_admin: res.is_admin,
      email: res.email,
      student_id: res.student_id,
      display_name: res.display_name,
      first_name: res.first_name,
      last_name: res.last_name,
      fathers_name: res.fathers_name,
      department: res.department,
      group_no: res.group_no,
      must_change_password: res.must_change_password,
      roles: res.roles,
      effective_roles: res.effective_roles,
    };
    setUser(profile);

    if (res.must_change_password) {
      setAuthModalMode('set_new_password');
      setIsAuthModalOpen(true);
    } else {
      setIsAuthModalOpen(false);
    }

    return res;
  }, []);

  const changePassword = useCallback(async (payload: ChangePasswordPayload): Promise<AuthResponse> => {
    const res = await changePasswordUser(payload, token);
    setToken(res.access_token);
    const updatedProfile: UserProfile = {
      user_id: res.user_id,
      account_type: res.account_type,
      is_admin: res.is_admin,
      email: res.email,
      student_id: res.student_id,
      display_name: res.display_name,
      first_name: res.first_name,
      last_name: res.last_name,
      fathers_name: res.fathers_name,
      department: res.department,
      group_no: res.group_no,
      must_change_password: false,
      roles: res.roles,
      effective_roles: res.effective_roles,
    };
    setUser(updatedProfile);
    setIsAuthModalOpen(false);
    return res;
  }, [token]);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
    setIsAuthModalOpen(false);
    setAuthModalMode('login');
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isLoading,
      isAuthModalOpen,
      authModalMode,
      activeTab,
      openLogin,
      openReset,
      openProfile,
      openSetNewPassword,
      closeAuthModal,
      setActiveTab,
      login,
      changePassword,
      logout,
    }),
    [
      user,
      token,
      isLoading,
      isAuthModalOpen,
      authModalMode,
      activeTab,
      openLogin,
      openReset,
      openProfile,
      openSetNewPassword,
      closeAuthModal,
      login,
      changePassword,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
