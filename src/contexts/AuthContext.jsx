import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentSession, onAuthStateChange, signIn, signOut, signUp } from "../services/authService";
import { listUserAccounts } from "../services/accountService";
import { listCurrencies } from "../services/currenciesService";
import { getCurrentUserProfile } from "../services/profilesService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
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
        setCurrentProfile(null);
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
      try {
        const currencies = await listCurrencies(selected.accountId);
        const localCurrency = currencies.find((item) => item.isLocal) ?? currencies[0] ?? null;
        if (localCurrency?.symbol) {
          localStorage.setItem("activeCurrencySymbol", localCurrency.symbol);
        }
      } catch {
        localStorage.removeItem("activeCurrencySymbol");
      }
      try {
        const profile = await getCurrentUserProfile(selected.accountId, userId);
        if (isMounted) setCurrentProfile(profile);
      } catch {
        if (isMounted) setCurrentProfile(null);
      }
    } else {
      localStorage.removeItem("activeAccountId");
      localStorage.removeItem("activeCurrencySymbol");
      setCurrentProfile(null);
    }
  }

  const switchAccount = (nextAccountId) => {
    const accountId = Number(nextAccountId);
    const nextAccount = accounts.find((item) => item.accountId === accountId) ?? null;
    if (!nextAccount) return;
    setAccount(nextAccount);
    localStorage.setItem("activeAccountId", String(nextAccount.accountId));
    listCurrencies(nextAccount.accountId)
      .then((currencies) => {
        const localCurrency = currencies.find((item) => item.isLocal) ?? currencies[0] ?? null;
        if (localCurrency?.symbol) {
          localStorage.setItem("activeCurrencySymbol", localCurrency.symbol);
          return;
        }
        localStorage.removeItem("activeCurrencySymbol");
      })
      .catch(() => {
        localStorage.removeItem("activeCurrencySymbol");
      });
    if (session?.user?.id) {
      getCurrentUserProfile(nextAccount.accountId, session.user.id)
        .then((profile) => setCurrentProfile(profile))
        .catch(() => setCurrentProfile(null));
    }
  };

  const refreshAccounts = async () => {
    if (!session?.user?.id) return;
    await loadAccountsAndSelection(session.user.id, true);
  };

  const value = useMemo(() => {
    const profileData = currentProfile?.account_profiles ?? null;
    const isSystemAdmin = Boolean(profileData?.isSystemAdmin);
    const permissions = profileData?.permissions ?? {};
    const reportAccess = permissions?.reportAccess ?? {};
    const hasModulePermission = (moduleKey, action = "read") => {
      if (isSystemAdmin) return true;
      return Boolean(permissions?.[moduleKey]?.[action]);
    };
    const hasDashboardAccess = () => {
      if (isSystemAdmin) return true;
      return Boolean(permissions?.dashboard?.read);
    };
    const hasReportPermission = (reportId) => {
      if (isSystemAdmin) return true;
      return Boolean(reportAccess?.[reportId]);
    };

    return {
      session,
      user: session?.user ?? null,
      account,
      accounts,
      currentProfile,
      isSystemAdmin,
      canVoidTransactions: Boolean(isSystemAdmin || profileData?.canVoidTransactions),
      canCreateUsers: Boolean(isSystemAdmin || profileData?.canCreateUsers),
      canCreateProfiles: Boolean(isSystemAdmin || profileData?.canCreateProfiles),
      hasModulePermission,
      hasDashboardAccess,
      hasReportPermission,
      isLoading,
      switchAccount,
      refreshAccounts,
      login: signIn,
      register: signUp,
      logout: signOut
    };
  }, [session, account, accounts, currentProfile, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
