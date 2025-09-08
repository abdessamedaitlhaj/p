import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Languages, ChevronDown } from 'lucide-react';

export const LanguageSelector: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { setLang, lang } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
  ];

  const currentLanguage = languages.find(l => l.code === lang) || languages[0];

  const adjustLang = (lan: string) => {
    i18n.changeLanguage(lan);
    setLang(lan);
    localStorage.setItem('lang', JSON.stringify(lan));
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg hover:border-yellow-400 hover:bg-[#2a2a2a] transition-all duration-200 group"
      >
        <Languages size={16} className="text-gray-400 group-hover:text-yellow-400 transition-colors duration-200" />
        <span className="text-gray-300 group-hover:text-white text-sm font-medium">
          {currentLanguage.code.toUpperCase()}
        </span>
        <ChevronDown size={14} className={`text-gray-500 group-hover:text-yellow-400 transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-44 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-2xl z-50 overflow-hidden">
            {languages.map((language) => (
              <button
                key={language.code}
                onClick={() => adjustLang(language.code)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#2a2a2a] hover:border-l-2 hover:border-l-yellow-400 transition-all duration-200 group
                  ${language.code === lang ? 'bg-[#2a2a2a] border-l-2 border-l-yellow-400' : ''}`}
              >
                <div className="flex flex-col">
                  <span className="text-white group-hover:text-yellow-400 font-medium text-sm">
                    {language.name}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {language.code.toUpperCase()}
                  </span>
                </div>
                {language.code === lang && (
                  <div className="ml-auto w-2 h-2 bg-yellow-400 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageSelector;
