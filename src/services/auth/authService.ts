import { apiGet, apiPost } from '../api/apiClient';
import type {
  AuthResponse,
  ChangePasswordPayload,
  LoginConfigResponse,
  LoginPayload,
  PasswordPolicyCheck,
  UserProfile,
} from './authTypes';

const TOKEN_KEY = 'campus_auth_token';
const USER_KEY = 'campus_auth_user';

export const DEFAULT_LOGIN_CONFIG: LoginConfigResponse = {
  min_length: 6,
  requirements: [
    'At least 6 characters long',
    'At least one uppercase letter (A-Z)',
    'At least one lowercase letter (a-z)',
    'At least one number (0-9)',
    'At least one special character (e.g. !@#$%^&*)',
    'Must not be the same as your Student ID or login email',
  ],
  total_registered_students: 112,
  total_staff_roles: 5,
  tabs: [
    {
      id: 'student',
      title: 'Student',
      default_selected: true,
      input_label: 'Student ID',
      input_placeholder: 'e.g. 202590123',
      helper_text: 'First time? Use your 9-digit Student ID as both login and password.',
    },
    {
      id: 'staff',
      title: 'Staff / Admin',
      default_selected: false,
      input_label: 'Staff Email or Username',
      input_placeholder: 'e.g. admin@ajou.uz',
      helper_text: 'Sign in with your university staff or administrator account.',
    },
  ],
};

// Known demo accounts for offline fallback when Docker/FastAPI backend is offline
const DEMO_FALLBACK_ACCOUNTS: Record<string, Partial<UserProfile>> = {
  '202590123': {
    student_id: '202590123',
    display_name: 'DEMO STUDENT',
    first_name: 'DEMO',
    last_name: 'STUDENT',
    fathers_name: '',
    department: 'IT-Business',
    group_no: 'I25D',
    account_type: 'student',
    is_admin: false,
    roles: ['student'],
    effective_roles: ['student'],
  },
  'admin@ajou.uz': {
    email: 'admin@ajou.uz',
    display_name: 'Campus Administrator',
    first_name: 'Campus',
    last_name: 'Administrator',
    fathers_name: '',
    department: 'Administration',
    group_no: '',
    account_type: 'staff',
    is_admin: true,
    roles: ['admin'],
    effective_roles: ['admin', 'teacher', 'facilities', 'safety_officer', 'analyst', 'staff', 'student'],
  },
  'admin@dev.local': {
    email: 'admin@dev.local',
    display_name: 'Campus Administrator',
    first_name: 'Campus',
    last_name: 'Administrator',
    fathers_name: '',
    department: 'Administration',
    group_no: '',
    account_type: 'staff',
    is_admin: true,
    roles: ['admin'],
    effective_roles: ['admin', 'teacher', 'facilities', 'safety_officer', 'analyst', 'staff', 'student'],
  },
  'teacher@ajou.uz': {
    email: 'teacher@ajou.uz',
    display_name: 'Faculty Professor',
    first_name: 'Faculty',
    last_name: 'Professor',
    fathers_name: '',
    department: 'Academic Affairs',
    group_no: '',
    account_type: 'staff',
    is_admin: false,
    roles: ['teacher'],
    effective_roles: ['teacher', 'staff', 'student'],
  },
};

export function validatePasswordStrength(
  password: string,
  identifier?: string,
  confirmPassword?: string,
): PasswordPolicyCheck {
  const minLength = password.length >= 6;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecialChar = /[^a-zA-Z0-9\s]/.test(password);
  
  const cleanIdent = identifier ? identifier.trim().toLowerCase() : '';
  const cleanPass = password.trim().toLowerCase();
  const notIdentifier = !cleanIdent || cleanPass !== cleanIdent;
  
  const passwordsMatch = confirmPassword !== undefined ? password === confirmPassword : true;

  const isValid =
    minLength &&
    hasUppercase &&
    hasLowercase &&
    hasDigit &&
    hasSpecialChar &&
    notIdentifier &&
    passwordsMatch;

  return {
    minLength,
    hasUppercase,
    hasLowercase,
    hasDigit,
    hasSpecialChar,
    notIdentifier,
    passwordsMatch,
    isValid,
  };
}

const memoryStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // fallback
  }
  return memoryStore.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // fallback
  }
  memoryStore.set(key, value);
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // fallback
  }
  memoryStore.delete(key);
}

export function getStoredToken(): string | null {
  return getStorageItem(TOKEN_KEY);
}

export function getStoredUser(): UserProfile | null {
  const raw = getStorageItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: UserProfile): void {
  setStorageItem(TOKEN_KEY, token);
  setStorageItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  removeStorageItem(TOKEN_KEY);
  removeStorageItem(USER_KEY);
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const ident = (payload.student_id || payload.email || payload.login || '').trim();
  const accType = payload.account_type || (ident.includes('@') ? 'staff' : 'student');

  try {
    // Attempt live backend first
    const res = await apiPost<AuthResponse>('/auth/login', {
      account_type: accType,
      student_id: accType === 'student' ? ident : undefined,
      email: accType === 'staff' ? ident : undefined,
      login: ident,
      password: payload.password,
    });
    
    const userProfile: UserProfile = {
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

    storeSession(res.access_token, userProfile);
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If backend returned a 401 invalid credentials or specific backend error, propagate it
    if (msg.includes('Invalid') || msg.includes('Switch to') || msg.includes('401') || msg.includes('422')) {
      throw err;
    }

    // If backend is unreachable (offline network error) and user is using demo roster student/staff
    const demo = DEMO_FALLBACK_ACCOUNTS[ident] || DEMO_FALLBACK_ACCOUNTS[ident.toLowerCase()];
    if (demo) {
      const isInitialPass = payload.password === ident || payload.password === 'devpassword';
      const mockUser: UserProfile = {
        user_id: `demo-${ident}`,
        account_type: demo.account_type || 'student',
        is_admin: Boolean(demo.is_admin),
        email: demo.email || null,
        student_id: demo.student_id || null,
        display_name: demo.display_name || ident,
        first_name: demo.first_name || '',
        last_name: demo.last_name || '',
        fathers_name: demo.fathers_name || '',
        department: demo.department || 'IT-Business',
        group_no: demo.group_no || '',
        must_change_password: isInitialPass,
        roles: demo.roles || ['student'],
        effective_roles: demo.effective_roles || ['student'],
      };

      const mockRes: AuthResponse = {
        access_token: `mock-token-${Date.now()}`,
        token_type: 'bearer',
        expires_in: 86400,
        ...mockUser,
        message: isInitialPass
          ? 'Please change your initial password for security purposes.'
          : 'Signed in successfully (Offline demo mode).',
      };

      storeSession(mockRes.access_token, mockUser);
      return mockRes;
    }

    throw err;
  }
}

export async function changePasswordUser(
  payload: ChangePasswordPayload,
  token?: string | null,
): Promise<AuthResponse> {
  const currentToken = token || getStoredToken();
  const res = await apiPost<AuthResponse>(
    '/auth/change-password',
    payload,
    undefined,
    currentToken,
  );

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

  storeSession(res.access_token, updatedProfile);
  return res;
}

export async function fetchCurrentUser(token?: string | null): Promise<UserProfile | null> {
  const currentToken = token || getStoredToken();
  if (!currentToken) return null;

  // If mock token from offline demo
  if (currentToken.startsWith('mock-token-')) {
    return getStoredUser();
  }

  try {
    const res = await apiGet<UserProfile>('/auth/me', undefined, undefined, currentToken);
    storeSession(currentToken, res);
    return res;
  } catch {
    return getStoredUser();
  }
}
