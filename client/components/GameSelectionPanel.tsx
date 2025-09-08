import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, Globe, Users, ChevronRight } from 'lucide-react';

interface GameSelectionPanelProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (gameType: string) => void;
}

export const GameSelectionPanel: React.FC<GameSelectionPanelProps> = ({
  isVisible,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation();

  // Handle Escape key press
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isVisible) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const gameOptions = [
    {
      id: 'local',
      icon: Users,
      title: t('gameselection.modes.local.title'),
      description: t('gameselection.modes.local.description'),
      path: '/play',
    },
    {
      id: 'online',
      icon: Globe,
      title: t('gameselection.modes.online.title'),
      description: t('gameselection.modes.online.description'),
      path: '/matchmaking',
    },
    {
      id: 'cli',
      icon: Terminal,
      title: t('gameselection.modes.cli.title'),
      description: t('gameselection.modes.cli.description'),
      path: '/authcli',
    },
  ];

  const handleCardClick = (option: any) => {
    onSelect(option.path);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-40 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-30" />
      
      {/* Main Panel */}
      <div className="relative bg-[#1A1A1A] rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4">
        {/* Panel Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-2">{t('gameselection.title')}</h2>
          <p className="text-gray-400 text-sm">{t('gameselection.subtitle')}</p>
        </div>

        {/* Game Options */}
        <div className="flex flex-col gap-4">
          {gameOptions.map((option) => {
            const IconComponent = option.icon;
            
            return (
              <div
                key={option.id}
                onClick={() => handleCardClick(option)}
                className="bg-[#1A1A1A] border border-gray-700 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:bg-[#2A2A2A] hover:border-yellow-400 hover:scale-105 group"
              >
                <div className="flex items-center justify-between">
                  {/* Left side: Icon and text */}
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0 w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center group-hover:bg-yellow-400 transition-all duration-200">
                      <IconComponent 
                        size={24} 
                        className="text-gray-400 group-hover:text-black transition-colors duration-200" 
                      />
                    </div>
                    
                    {/* Text Content */}
                    <div>
                      <h3 className="text-white font-bold text-lg group-hover:text-yellow-400 transition-colors duration-200">{option.title}</h3>
                      <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors duration-200">{option.description}</p>
                    </div>
                  </div>
                  
                  {/* Right arrow */}
                  <ChevronRight 
                    size={20} 
                    className="text-gray-500 group-hover:text-yellow-400 group-hover:scale-110 transition-all duration-200" 
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors duration-200"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default GameSelectionPanel;
