import { createContext, useContext, useMemo, useState } from "react";
import { translations } from "../i18n/translations";

const I18nContext = createContext(null);

function getTranslation(language, key) {
  return key.split(".").reduce((acc, part) => acc?.[part], translations[language]);
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState("es");

  const value = useMemo(() => {
    const t = (key) => getTranslation(language, key) ?? key;
    return { t, language, setLanguage };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
