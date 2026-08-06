import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchCurrentUser, loginUser, registerUser } from "@/api/client";
import type { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem("scanverse_user");
    return cached ? (JSON.parse(cached) as User) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("scanverse_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    fetchCurrentUser()
      .then((freshUser) => {
        setUser(freshUser);
        localStorage.setItem("scanverse_user", JSON.stringify(freshUser));
      })
      .catch(() => {
        localStorage.removeItem("scanverse_token");
        localStorage.removeItem("scanverse_user");
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  function persist(token: string, freshUser: User) {
    localStorage.setItem("scanverse_token", token);
    localStorage.setItem("scanverse_user", JSON.stringify(freshUser));
    setUser(freshUser);
  }

  async function login(email: string, password: string) {
    const data = await loginUser(email, password);
    persist(data.access_token, data.user);
  }

  async function register(email: string, password: string, fullName?: string) {
    const data = await registerUser({ email, password, full_name: fullName });
    persist(data.access_token, data.user);
  }

  function logout() {
    localStorage.removeItem("scanverse_token");
    localStorage.removeItem("scanverse_user");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
