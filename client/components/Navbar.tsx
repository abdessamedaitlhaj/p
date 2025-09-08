import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useStore } from "@/store/useStore";
import api from "@/utils/Axios"
import { useTranslation } from 'react-i18next';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { IoIosArrowDown } from "react-icons/io";




export const Navbar = () => {
  const { state, setPersist } = useAuth();
  const navigate = useNavigate();
  const { socket } = useStore();

  const {t, i18n} = useTranslation();
  const Logout = async () => {
    try {
      await api.get("auth/logout", {
        withCredentials: true,
      });
      setPersist(false);
      if (socket) {
        socket.emit("user_offline", state.user.user.id);
      }
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };


  const {setLang, lang} = useAuth()

  const adjustLang = (lan: string) => {
    if (lan === 'en') {
      i18n.changeLanguage('en')
      setLang('en');
      localStorage.setItem('lang', JSON.stringify('en'));
    }
    else if (lan === 'it') {
      i18n.changeLanguage('it')
      setLang('it');
      localStorage.setItem('lang', JSON.stringify('it'));
    }
    else if (lan === 'fr') {
      i18n.changeLanguage('fr')
      setLang('fr');
      localStorage.setItem('lang', JSON.stringify('fr'));
    }
  }

  //   useEffect(() => {
  //     console.log("******************************-----");
  //     console.log(state.user);
  //     console.log("******************************-----");
  //   }, []);

  return (
    <div className="flex items-center justify-between w-full h-10 bg-gray-200 p-4">
      <div className="flex items-center gap-4">
        <img
          className="size-8 rounded-full"
          src={state.user?.user.avatarurl || "https://via.placeholder.com/150"}
          alt="pic"
        />
        <p className="text-xs font-bold italic text-gray-500">
          {state.user?.user.username}
        </p>
      </div>
      <div className="flex items-center gap-8">
        <button
          onClick={Logout}
          className="cursor-pointer text-mdp-1 rounded-lg text-gray-500"
        >
          Logout
        </button>
        <Link to="/">
          <button className="cursor-pointer text-md text-gray-500">Home</button>
        </Link>
        <Link to="/chat">
          <button className="cursor-pointer text-md text-gray-500">Chat</button>
        </Link>
        <Link to="/profile">
          <button className="cursor-pointer text-md text-gray-500">
            Profile
          </button>
        </Link>
        <Link to="/matchmaking">
          <button className="cursor-pointer text-md text-gray-500" title="Find a random opponent">
            Matchmaking
          </button>
        </Link>
        <Link to="/events">
          <button className="cursor-pointer text-md text-gray-500" title="View tournaments">
            Events
          </button>
        </Link>
        <Link to="/tournament">
          <button className="cursor-pointer text-md text-gray-500" title="Tournament overview & history">
            Tournament
          </button>
        </Link>
        <Link to="/remotesettings">
          <button className="cursor-pointer text-md text-gray-500" title="Remote game appearance">
            Remote Settings
          </button>
        </Link>
        <Link to="/playerstats">
          <button className="cursor-pointer text-md text-gray-500">Player Stats</button>
        </Link>
        <Link to="/matchstats">
          <button className="cursor-pointer text-md text-gray-500">Match Stats</button>
        </Link>
        <Link to="/authcli">
          <button className="cursor-pointer text-md text-gray-500" title="Authorize CLI">CLI</button>
        </Link>
        <Link to="/tournament">
          <button className="cursor-pointer text-md text-gray-500">Tournaments</button>
        </Link>

        {/* Lang */}
        <Menu as="div" className="relative inline-block">
      

      <MenuButton className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300 hover:bg-gray-50">
        {t("navbar.language")}
    		<IoIosArrowDown />
      </MenuButton>

      <MenuItems
        transition
        className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
      >
        <div className="py-1">

          <MenuItem>
            <p onClick={() => adjustLang('en')} 
            className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden cursor-pointer">English</p>
          </MenuItem>
    
          <MenuItem>
          <p onClick={() => adjustLang('it')}
            className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden cursor-pointer">Italiano</p>
          </MenuItem>
          <MenuItem>
          <p onClick={() => adjustLang('fr')}
            className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden cursor-pointer">Français</p>
          </MenuItem>

		
        </div>
      </MenuItems>
    </Menu>
      </div>
    </div>
  );
};
