import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import it from "../locales/it.json";
import fr from "../locales/fr.json";


i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      it: { translation: it },
      fr: { translation: fr },
    },
    lng: JSON.parse(localStorage.getItem('lang')) || "en", // default language
    interpolation: {
      escapeValue: false, // react already escapes
    },
  });

export default i18n;