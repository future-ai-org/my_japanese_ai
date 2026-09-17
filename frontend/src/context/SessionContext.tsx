import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSession, logout, type User } from "../services/auth";

interface SessionContextValue {
  user: User | null;
  isSessionLoading: boolean;
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  useEffect(() => {
    void getSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsSessionLoading(false));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      isSessionLoading,
      setUser,
      signOut: async () => {
        try {
          await logout();
        } finally {
          setUser(null);
        }
      },
    }),
    [isSessionLoading, user],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within SessionProvider.");
  }
  return value;
}
