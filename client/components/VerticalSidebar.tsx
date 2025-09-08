import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Home, 
  Trophy, 
  MessageSquare, 
  Gamepad2, 
  Settings 
} from 'lucide-react';
import { useSidebar } from '@/hooks/useSidebar';
import { GameSelectionPanel } from './GameSelectionPanel';
import { TournamentSelectionPanel } from './TournamentSelectionPanel';

export const VerticalSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isVisible } = useSidebar();
  const { t } = useTranslation();
  const [showGamePanel, setShowGamePanel] = useState(false);
  const [showTournamentPanel, setShowTournamentPanel] = useState(false);

  const navigationItems = [
    {
      id: 'home',
      icon: Home,
      label: t('sidebar.home'),
      pageLabel: t('pages.home'),
      path: '/',
    },
    {
      id: 'tournaments',
      icon: Trophy,
      label: t('sidebar.tournaments'),
      pageLabel: t('pages.tournaments'),
      path: '/tournaments',
    },
    {
      id: 'chat',
      icon: MessageSquare,
      label: t('sidebar.messages'),
      pageLabel: t('pages.messages'),
      path: '/chat',
    },
    {
      id: 'games',
      icon: Gamepad2,
      label: t('sidebar.games'),
      pageLabel: t('pages.games'),
      path: '/play',
    },
    {
      id: 'settings',
      icon: Settings,
      label: t('sidebar.settings'),
      pageLabel: t('pages.settings'),
      path: '/profile', // Using profile as settings page
    },
  ];

  const handleChatNavigation = () => {
    setShowGamePanel(false);
    setShowTournamentPanel(false);
    navigate('/chat');
  };

  const handleGameSelection = (gamePath: string) => {
    navigate(gamePath);
  };

  const handleTournamentSelection = (tournamentPath: string) => {
    navigate(tournamentPath);
  };

  const handleGamesClick = () => {
    setShowTournamentPanel(false);
    setShowGamePanel(true);
  };

  const handleTournamentClick = () => {
    setShowGamePanel(false);
    setShowTournamentPanel(true);
  };

  const handleSidebarLinkClick = () => {
    setShowGamePanel(false);
    setShowTournamentPanel(false);
  };

  // Get current page name based on location
  const getCurrentPageName = () => {
    const currentItem = navigationItems.find(item => {
      if (item.path === '/' && location.pathname === '/') return true;
      if (item.path !== '/' && location.pathname.startsWith(item.path)) return true;
      return false;
    });
    return currentItem?.pageLabel || t('pages.dashboard');
  };

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Sidebar Container - Capsule shaped, centered vertically, floating above content */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 h-[50vh] w-20 bg-[#1a1a1a] border-2 border-yellow-400 rounded-full z-50 flex flex-col items-center justify-center">
        {/* Navigation Icons */}
        <nav className="flex flex-col items-center justify-center h-full space-y-6">
          {navigationItems.map((item) => {
            const IconComponent = item.icon;
            const isChat = item.id === 'chat';
            const isGames = item.id === 'games';
            const isTournaments = item.id === 'tournaments';
            
            return (
              <div key={item.id} className="group relative">
                {isChat ? (
                  <button
                    onClick={handleChatNavigation}
                    className="flex items-center justify-center w-12 h-12 text-[#b3b3b3] hover:text-white hover:text-yellow-400 transition-all duration-200 hover:scale-110 cursor-pointer"
                  >
                    <IconComponent size={24} />
                  </button>
                ) : isGames ? (
                  <button
                    onClick={handleGamesClick}
                    className="flex items-center justify-center w-12 h-12 text-[#b3b3b3] hover:text-white hover:text-yellow-400 transition-all duration-200 hover:scale-110 cursor-pointer"
                  >
                    <IconComponent size={24} />
                  </button>
                ) : isTournaments ? (
                  <button
                    onClick={handleTournamentClick}
                    className="flex items-center justify-center w-12 h-12 text-[#b3b3b3] hover:text-white hover:text-yellow-400 transition-all duration-200 hover:scale-110 cursor-pointer"
                  >
                    <IconComponent size={24} />
                  </button>
                ) : (
                  <Link
                    to={item.path}
                    onClick={handleSidebarLinkClick}
                    className="flex items-center justify-center w-12 h-12 text-[#b3b3b3] hover:text-white hover:text-yellow-400 transition-all duration-200 hover:scale-110"
                  >
                    <IconComponent size={24} />
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Game Selection Panel */}
      <GameSelectionPanel
        isVisible={showGamePanel}
        onClose={() => setShowGamePanel(false)}
        onSelect={handleGameSelection}
      />

      {/* Tournament Selection Panel */}
      <TournamentSelectionPanel
        isVisible={showTournamentPanel}
        onClose={() => setShowTournamentPanel(false)}
        onSelect={handleTournamentSelection}
      />
    </>
  );
};

export default VerticalSidebar;
