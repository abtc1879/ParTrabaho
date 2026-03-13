import { useAuth } from "../features/auth/AuthContext";

export function useAuthUser() {
  return useAuth();
}
