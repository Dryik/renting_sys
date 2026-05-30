import { createContext } from "react";
import type { AuthState, CurrentUser, Permission } from "@/shared/auth";
import type { LicenseStatus } from "@/shared/license";

export type AuthContextValue = {
  authState: AuthState;
  currentUser: CurrentUser | null;
  can: (permission: Permission) => boolean;
  canWrite: boolean;
  licenseStatus: LicenseStatus;
  refreshAuth: () => Promise<void>;
  setAuthState: (state: AuthState) => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
