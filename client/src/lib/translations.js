export const translations = {
  en: {
    homeCta: "Explore Elections",
    dashboard: "Dashboard",
    elections: "Elections",
    admin: "Admin",
    signIn: "Sign In",
    signOut: "Sign Out",
    connectWallet: "Connect Wallet",
  },
  hi: {
    homeCta: "चुनाव देखें",
    dashboard: "डैशबोर्ड",
    elections: "चुनाव",
    admin: "एडमिन",
    signIn: "लॉग इन",
    signOut: "लॉग आउट",
    connectWallet: "वॉलेट कनेक्ट करें",
  },
};

export function getCopy(language) {
  return translations[language] || translations.en;
}
