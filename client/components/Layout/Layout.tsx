import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  Trophy,
  Home,
  Bell,
  Gamepad,
  Settings,
  MessageCircleMore,
  User,
  Search,
  Menu,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { Notification } from "@/components/Layout/Notification";

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const { user } = useStore();

  const [isToggle, setToggle] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isToggle &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setToggle(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isToggle]);

  return (
    <div className="min-h-screen bg-black/90 text-white">
      <nav className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center justify-center size-16 border-2 border-yellow_1 rounded-full">
              <span className="text-whitefont-bold text-lg">NTX</span>
            </div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
          </div>

          <div className="flex-1 max-w-md mx-8">
            <div className="hidden sm:block relative">
              <Search
                strokeWidth={2}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5"
              />
              <input
                type="text"
                placeholder="search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="w-full bg-gray_1 text-white pl-10 pr-4 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-yellow_1"
              />
              <div className="absolute bg-gray_1/50 right-3 top-1/2 transform -translate-y-1/2 bg-gray-700 px-2 py-1 rounded text-xs text-white border border-yellow_1 rounded-lg">
                ⌘ K
              </div>
            </div>
          </div>

          <div className="relative flex items-center space-x-4">
            <span>{user?.username}</span>
            <button
              onClick={() => setToggle(!isToggle)}
              className="hidden sm:flex justify-center items-center p-2 hover:bg-gray_1/70 rounded-full transition-colors border border-yellow_1 size-12 cursor-pointer"
            >
              <Bell strokeWidth={2} className="size-6" />
            </button>
            <Link to="/profile">
              <button className="hidden sm:flex justify-center items-center rounded-full border border-yellow_1 size-12 cursor-pointer">
                <img src={user?.avatarurl} className="rounded-full" />
              </button>
            </Link>
            <button className="sm:hidden flex p-2 justify-center items-center hover:bg-gray_1/70 rounded-full transition-colors border border-yellow_1 size-12 cursor-pointer">
              <Menu strokeWidth={2} className="size-6" />
            </button>
            <div ref={menuRef} className="absolute">
              {isToggle && (
                <Notification setToggle={setToggle} isToggle={isToggle} />
              )}
            </div>
          </div>
        </div>
      </nav>

      <aside className="fixed flex justify-center left-0 top-0 bottom-0 w-20 z-40 pt-24">
        <div className="flex items-center">
          <div className="hidden sm:flex flex-col items-center justify-center h-[450px] px-4 rounded-tr-full rounded-br-full space-y-6 py-8 border-y-2 border-r-2 border-l-none border-t-yellow_2 border-r-yellow_2 border-b-yellow_2">
            <Link to="/">
              <button className="p-3 rounded-lg transition-all duration-300 ease-in-out group">
                <Home
                  strokeWidth={2}
                  className="size-6 group-hover:scale-125 transition-all duration-300 ease-in-out transform"
                />
              </button>
            </Link>
            <button className="p-3 rounded-lg transition-all duration-300 ease-in-out group">
              <Trophy
                strokeWidth={2}
                className="size-6 group-hover:scale-125 transition-all duration-300 ease-in-out transform"
              />
            </button>
            <Link to="/chat">
              <button className="p-3 rounded-lg transition-all duration-300 ease-in-out group">
                <MessageCircleMore
                  strokeWidth={2}
                  className="size-6 group-hover:scale-125 transition-all duration-300 ease-in-out transform"
                />
              </button>
            </Link>
            <Link to="/events">
              <button className="p-3 rounded-lg transition-all duration-300 ease-in-out group">
                <Gamepad
                  strokeWidth={2}
                  className="size-6 group-hover:scale-125 transition-all duration-300 ease-in-out transform"
                />
              </button>
            </Link>
            <button className="p-3 rounded-lg transition-all duration-300 ease-in-out group">
              <Settings
                strokeWidth={2}
                className="size-6 group-hover:scale-125 transition-all duration-300 ease-in-out transform"
              />
            </button>
          </div>
        </div>
      </aside>

      <main className=" sm:ml-20 p-6 flex items-center justify-center">
        {children}
      </main>
    </div>
  );
};
