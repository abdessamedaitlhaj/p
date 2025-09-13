import React from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "./LanguageSelector";

export const Header: React.FC = () => {
  const location = useLocation();
  const { t } = useTranslation();

  const navigationItems = [
    {
      id: "home",
      pageLabel: t("pages.home"),
      path: "/",
    },
    {
      id: "tournaments",
      pageLabel: t("pages.tournaments"),
      path: "/tournaments",
    },
    {
      id: "chat",
      pageLabel: t("pages.messages"),
      path: "/chat",
    },
    {
      id: "games",
      pageLabel: t("pages.games"),
      path: "/play",
    },
    {
      id: "settings",
      pageLabel: t("pages.settings"),
      path: "/profile",
    },
  ];

  // Get current page name based on location
  const getCurrentPageName = () => {
    const currentItem = navigationItems.find((item) => {
      if (item.path === "/" && location.pathname === "/") return true;
      if (item.path !== "/" && location.pathname.startsWith(item.path))
        return true;
      return false;
    });
    return currentItem?.pageLabel || t("pages.dashboard");
  };

  return (
    <div className="h-14 bg-[#1a1a1a] border-b-2 border-yellow-400 flex items-center justify-between px-6 w-full">
      <div className="flex items-center">
        {/* Logo */}
        <div className="flex-shrink-0 w-10 h-10 bg-black rounded-full border-2 border-yellow-400 flex items-center justify-center">
          <span className="text-white text-sm font-bold">NTX</span>
        </div>

        {/* Page Name */}
        <span className="ml-4 text-white font-semibold text-lg">
          {getCurrentPageName()}
        </span>
      </div>

      {/* Language Selector */}
      <LanguageSelector />
    </div>
  );
};

export default Header;
