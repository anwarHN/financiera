import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentSession, onAuthStateChange, signIn, signOut, signUp } from "../services/authService";
import { listUserAccounts } from "../services/accountService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
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
        await loadAccountsAndSelection(activeSession.user.id, isMounted);
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
        await loadAccountsAndSelection(nextSession.user.id, true);
      } else {
        setAccount(null);
        setAccounts([]);
        localStorage.removeItem("activeAccountId");
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

  async function loadAccountsAndSelection(userId, isMounted = true) {
    const userAccounts = await listUserAccounts(userId);
    if (!isMounted) return;
    setAccounts(userAccounts);

    const preferredAccountIdRaw = localStorage.getItem("activeAccountId");
    const preferredAccountId = preferredAccountIdRaw ? Number(preferredAccountIdRaw) : null;
    const selected =
      userAccounts.find((item) => item.accountId === preferredAccountId) ??
      userAccounts[0] ??
      null;

    setAccount(selected);
    if (selected?.accountId) {
      localStorage.setItem("activeAccountId", String(selected.accountId));
    } else {
      localStorage.removeItem("activeAccountId");
    }
  }

  const switchAccount = (nextAccountId) => {
    const accountId = Number(nextAccountId);
    const nextAccount = accounts.find((item) => item.accountId === accountId) ?? null;
    if (!nextAccount) return;
    setAccount(nextAccount);
    localStorage.setItem("activeAccountId", String(nextAccount.accountId));
  };

  const refreshAccounts = async () => {
    if (!session?.user?.id) return;
    await loadAccountsAndSelection(session.user.id, true);
  };

  const value = useMemo(() => {
    return {
      session,
      user: session?.user ?? null,
      account,
      accounts,
      isLoading,
      switchAccount,
      refreshAccounts,
      login: signIn,
      register: signUp,
      logout: signOut
    };
  }, [session, account, accounts, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
