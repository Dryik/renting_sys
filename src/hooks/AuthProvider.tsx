import { useMemo, type ReactNode } from "react";
import { hasPermission, isWritePermission, type AuthState } from "@/shared/auth";
import type { LicenseStatus } from "@/shared/license";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({
  authState,
  children,
  licenseStatus,
  refreshAuth,
  setAuthState,
}: {
  authState: AuthState;
  children: ReactNode;
  licenseStatus: LicenseStatus;
  refreshAuth: () => Promise<void>;
  setAuthState: (state: AuthState) => void;
}) {
  const value = useMemo<AuthContextValue>(
    () => ({
      authState,
      currentUser: authState.currentUser,
      can: (permission) => {
        if (
          !licenseStatus.canWrite &&
          isWritePermission(permission)
        ) {
          return false;
        }

        return (
          !authState.currentUser?.mustChangePassword &&
          hasPermission(authState.currentUser, permission)
        );
      },
      canWrite: licenseStatus.canWrite,
      licenseStatus,
      refreshAuth,
      setAuthState,
    }),
    [authState, licenseStatus, refreshAuth, setAuthState],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
