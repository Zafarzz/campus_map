import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSession,
  getStoredToken,
  getStoredUser,
  loginUser,
  storeSession,
  validatePasswordStrength,
} from '../services/auth/authService';
import type { UserProfile } from '../services/auth/authTypes';

describe('Authentication Service & Password Security', () => {
  beforeEach(() => {
    clearSession();
  });

  describe('validatePasswordStrength', () => {
    it('rejects passwords shorter than 6 characters', () => {
      const res = validatePasswordStrength('Ab1!', '202590207', 'Ab1!');
      expect(res.minLength).toBe(false);
      expect(res.isValid).toBe(false);
    });

    it('validates uppercase, lowercase, digits, and special characters', () => {
      const weak = validatePasswordStrength('password', '202590207', 'password');
      expect(weak.hasUppercase).toBe(false);
      expect(weak.hasDigit).toBe(false);
      expect(weak.hasSpecialChar).toBe(false);
      expect(weak.isValid).toBe(false);

      const strong = validatePasswordStrength('Campus#2026', '202590207', 'Campus#2026');
      expect(strong.minLength).toBe(true);
      expect(strong.hasUppercase).toBe(true);
      expect(strong.hasLowercase).toBe(true);
      expect(strong.hasDigit).toBe(true);
      expect(strong.hasSpecialChar).toBe(true);
      expect(strong.notIdentifier).toBe(true);
      expect(strong.passwordsMatch).toBe(true);
      expect(strong.isValid).toBe(true);
    });

    it('rejects passwords identical to the student ID or email', () => {
      const same = validatePasswordStrength('202590207', '202590207', '202590207');
      expect(same.notIdentifier).toBe(false);
      expect(same.isValid).toBe(false);
    });

    it('detects mismatched password confirmation', () => {
      const mismatch = validatePasswordStrength('Campus#2026', '202590207', 'Different#2026');
      expect(mismatch.passwordsMatch).toBe(false);
      expect(mismatch.isValid).toBe(false);
    });
  });

  describe('Session Storage', () => {
    it('stores, retrieves, and clears user session', () => {
      expect(getStoredToken()).toBeNull();
      expect(getStoredUser()).toBeNull();

      const profile: UserProfile = {
        user_id: 'std-202590207',
        account_type: 'student',
        is_admin: false,
        student_id: '202590207',
        display_name: 'ROBIYAXON MUZAFFAROVA',
        first_name: 'ROBIYAXON',
        last_name: 'MUZAFFAROVA',
        fathers_name: 'JAHONGIR QIZI',
        department: 'IT-Business',
        group_no: 'I25D',
        must_change_password: false,
        roles: ['student'],
        effective_roles: ['student'],
      };

      storeSession('test-token-123', profile);

      expect(getStoredToken()).toBe('test-token-123');
      const stored = getStoredUser();
      expect(stored).not.toBeNull();
      expect(stored?.student_id).toBe('202590207');
      expect(stored?.group_no).toBe('I25D');

      clearSession();
      expect(getStoredToken()).toBeNull();
      expect(getStoredUser()).toBeNull();
    });
  });

  describe('Offline Fallback Demo Login', () => {
    it('authenticates known student 202590207 offline and sets must_change_password if initial', async () => {
      const res = await loginUser({
        account_type: 'student',
        student_id: '202590207',
        password: '202590207',
      });

      expect(res.student_id).toBe('202590207');
      expect(res.group_no).toBe('I25D');
      expect(res.must_change_password).toBe(true);
      expect(getStoredToken()).toBeTruthy();
    });

    it('authenticates admin@ajou.uz offline', async () => {
      const res = await loginUser({
        account_type: 'staff',
        email: 'admin@ajou.uz',
        password: 'devpassword',
      });

      expect(res.email).toBe('admin@ajou.uz');
      expect(res.is_admin).toBe(true);
      expect(res.roles).toContain('admin');
    });
  });
});
