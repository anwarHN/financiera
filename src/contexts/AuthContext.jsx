import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentSession, onAuthStateChange, signIn, signOut, signUp } from "../services/authService";
import { getCurrentAccount } from "../services/accountService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const activeSession = await getCurrentSession();
      if (!isMounted) {
        return;
      }

      setSession(activeSession);
      if (activeSession?.user?.id) {
        const userAccount = await getCurrentAccount(activeSession.user.id);
        if (isMounted) {
          setAccount(userAccount);
        }
      }
      setIsLoading(false);
    }

    loadSession().catch(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    });

    let subscription;

    onAuthStateChange(async (nextSession) => {
      setSession(nextSession);
      if (nextSession?.user?.id) {
        const userAccount = await getCurrentAccount(nextSession.user.id);
        setAccount(userAccount);
      } else {
        setAccount(null);
      }
      setIsLoading(false);
    }).then((sub) => {
      subscription = sub;
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    return {
      session,
      user: session?.user ?? null,
      account,
      isLoading,
      login: signIn,
      register: signUp,
      logout: signOut
    };
  }, [session, account, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
