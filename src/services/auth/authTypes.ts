export type AccountType = 'student' | 'staff';

export interface UserProfile {
  user_id: string;
  account_type: AccountType;
  is_admin: boolean;
  email?: string | null;
  student_id?: string | null;
  display_name: string;
  first_name: string;
  last_name: string;
  fathers_name: string;
  department: string;
  group_no: string;
  must_change_password: boolean;
  roles: string[];
  effective_roles: string[];
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  account_type: AccountType;
  is_admin: boolean;
  roles: string[];
  effective_roles: string[];
  user_id: string;
  email?: string | null;
  student_id?: string | null;
  display_name: string;
  first_name: string;
  last_name: string;
  fathers_name: string;
  department: string;
  group_no: string;
  must_change_password: boolean;
  message?: string | null;
}

export interface LoginPayload {
  account_type?: AccountType;
  student_id?: string;
  email?: string;
  login?: string;
  password: string;
}

export interface ChangePasswordPayload {
  student_id?: string;
  email?: string;
  login?: string;
  current_password?: string;
  examination_no?: string;
  new_password: string;
  confirm_password?: string;
}

export interface PasswordPolicyCheck {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasDigit: boolean;
  hasSpecialChar: boolean;
  notIdentifier: boolean;
  passwordsMatch: boolean;
  isValid: boolean;
}

export interface LoginTabConfig {
  id: AccountType;
  title: string;
  default_selected: boolean;
  input_label: string;
  input_placeholder: string;
  helper_text: string;
}

export interface LoginConfigResponse {
  min_length: number;
  requirements: string[];
  total_registered_students: number;
  total_staff_roles: number;
  tabs: LoginTabConfig[];
}
