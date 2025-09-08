import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import api from "@/utils/Axios"
import { queryClient } from "@/App";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useStore } from "@/store/useStore";
import { LogOut, BarChart3, TrendingUp } from "lucide-react";

type invits = {
  id: string,
  requester_id: string,
  receiver_id: string,
  status: string,
  username: string,
  avatarurl: string
}

type searchUser = {
  id: string,
  username: string,
  requester_id: string,
  receiver_id: string,
  avatarurl: string,
  alias: string,
  status: string,
  friendship_status: string
}

const Profile = () => {
  // const socket = useStore((state) => state.socket);

  const { state, dispatch, setPersist } = useAuth();
  const navigate = useNavigate();
  const [alias, setAlias] = useState<string>("");
  const { t } = useTranslation();
  const [invitations, setInvitations] = useState<invits[]>([]);
  const [searchResult, setSearchResult] = useState<searchUser[]>([]);
  const [st, setSt] = useState<string>("");
  const { socket } = useStore();

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
      toast.error("Logout failed. Please try again.");
    }
  };

  const InviteFriend = async (Id: string) => {
    try {
        const {data} = await api.post(`/users/user/freindRequests/?id=${state.user?.user.id}`,
        {recvId: Id},
        {
          headers:{'Authorization': `Bearer ${state.user?.accessToken}`}
        })

        console.log("InviteFriend: ", data);
    } catch (e: any)
    {
      console.error("InviteFriend error:", e.message);
      if (e.response?.data?.message) {
        toast.error(e.response.data.message);
      } else {
        toast.error("Failed to send friend request. Please try again.");
      }
    }
  }

  const searchByUsername = async (username: string) => {
    try {
      const {data} = await api.get(`/users/user/search?srch=${username}`,{
        headers: {
          'Authorization': `Bearer ${state.user?.accessToken}`
        }
      })
      
      setSearchResult(data.users);
    } catch(err:any) {
      setSearchResult([]);
      console.error("searchByUsername error:", err.message);
    }
  }
  
  const requestedFriends  = async ()=> {
    try{
      const {data} = await api.get(`/users/user/freindRequests/?id=${state.user?.user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${state.user?.accessToken}`
          }
        }
      )
      console.log("requestedFriends:", data.friends);
      setInvitations(data.friends);
    } catch(err:any)
    {
      console.error("requestedFriends error:", err.message);
    }
  }

  useEffect(() => {
    requestedFriends()
    console.log(state.user);
  },[state])


    const declineInvitation = async (requesterId: string)=> {
      try {
          const {data}  =  await api.delete(`/users/user/freindRequests/${state.user?.user.id}`,{
            data : {requesterId},
            
            headers: {
              'Authorization': `Bearer ${state.user?.accessToken}`
            }
          },
        )

        console.log("declineInvitation: ", data);
      }catch(err:any)
      {
        console.error("declineInvitation error:", err.message);
      }
    }


    const changeAlias = async () => {
    try {
      if (!alias.trim()) {
        return;
      }
      const userId = state.user?.user.id;
      const accessToken = state.user?.accessToken;
      
      if (!userId || !accessToken) {
        toast.error("User not found. Please log in again.");
        return;
      }
      
      const response = await api.post(`/users/user/Newalias/${userId}`, 
        { alias: alias.trim() },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.status === 201) { // Changed from 200 to 201 as per server response
        dispatch({
          type: "Update_User_Alias",
          payload: alias.trim(),
        });
        
        // Invalidate the users query to refresh the users data
        queryClient.invalidateQueries({ queryKey: ["users"] });
        
        toast.success("Alias updated successfully!");
        setAlias("");
      }
    } catch (error: any) {
      console.error("Error changing alias:", error);
      
      // Check if it's a duplicate alias error
      if (error.response?.status === 400 && error.response?.data?.message?.includes("UNIQUE constraint failed")) {
        toast.error("This alias is already taken. Please choose a different one.");
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Failed to update alias. Please try again.");
      }
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-6 text-gray-800">Profile</h2>

      <div className="space-y-4">
        <p className="text-gray-600">
          <span className="font-medium text-gray-900">{t("profile.id")}</span>{" "}
          {state.user?.user.id ?? "N/A"}
        </p>
        <p className="text-gray-600">
          <span className="font-medium text-gray-900">{t("profile.email")}</span>{" "}
          {state.user?.user.email ?? "N/A"}
        </p>
        <p className="text-gray-600">
          <span className="font-medium text-gray-900">{t("profile.username")}</span>{" "}
          {state.user?.user.username ?? "N/A"}
        </p>
        <p className="text-gray-600">
          <span className="font-medium text-gray-900">{t("profile.status")}</span>{" "}
          {state.user?.user.status ?? "N/A"}
        </p>
        <div className="flex flex-col justify-between h-[130px]">
          <p className="text-gray-600">
            <span className="font-medium text-gray-900">{t("profile.alias")}</span>{" "}
            {state.user?.user.alias ?? "N/A"}
          </p>

          <input type="text" className="border rounded-[10px] p-[5px]"
                  value={alias}
                  onChange={(e : React.ChangeEvent<HTMLInputElement>)=> setAlias(e.target.value)} />
          <button className="bg-[#75b7fc] text-white p-[5px] rounded-[5px]" onClick={()=> changeAlias()}>{t("profile.aliasbtn")}</button>
        </div>
        <img
          className="rounded-full w-[300px] h-[300px] mx-auto mt-5"
          src={state.user?.user.avatarurl}
          alt="pic"
        />

        <div className="friend_requests flex flex-col gap-4">
          <h3 className="text-[1.5rem] text-brown-500 underline">Invitations :</h3>
          {
          invitations.length == 0 ? <p>no Invitations</p> :
          
          invitations.map((inv)=>(
            <div className="flex items-center gap-4">
              <img className="w-12 rounded-full" src={inv.avatarurl} alt="" />
              <p>{inv.username}</p>
              <button className="bg-[#f461b5] text-white p-[5px] rounded-[5px]" onClick={()=> declineInvitation(inv.requester_id)}>decline</button>
            </div>
          ))
         }
        </div>


        <div className="invite p-4 bg-gray-100 rounded">
          <h3 className="text-[1.5rem] text-brown-500 underline">Search For User :</h3>
          <input 
            type="text" 
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Search"
            onInput={(e: any) => {
              searchByUsername(e.target.value);
            }}
          />
          <div className="search_results mt-4 max-h-48 overflow-y-auto">
            {searchResult.map((user) => (
              
              user.friendship_status !== 'blocked' ?
              <div key={user.id} className="flex gap-3  p-2 border-b border-gray-300">
                <Link to={`/users/${user.id}`} className="text-blue-500 hover:underline">
                  {user.username}
                </Link>
                {
                  user.friendship_status === 'pending' ?
                    <button className="bg-[#f461b5] text-white p-[5px] rounded-[5px]" onClick={()=> declineInvitation(user.id)}>decline</button> :
                  user.friendship_status === null ?
                  <button className="bg-[#33bf38] text-white p-[5px] rounded-[5px]" onClick={()=> InviteFriend(user.id)}>invite</button> :
                  "" 
                }
              </div> : ""
            ))}
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="border-t border-gray-200 pt-6 mt-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">{t("profile.quickactions")}</h3>
          <div className="grid grid-cols-1 gap-3">
            {/* Player Stats */}
            <button
              onClick={() => navigate('/playerstats')}
              className="flex items-center gap-3 p-4 bg-[#1a1a1a] border border-gray-700 rounded-xl hover:border-yellow-400 hover:bg-[#2a2a2a] transition-all duration-200 group"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center group-hover:bg-yellow-400 transition-all duration-200">
                <BarChart3 size={20} className="text-gray-400 group-hover:text-black transition-colors duration-200" />
              </div>
              <div className="text-left">
                <h4 className="text-white font-medium group-hover:text-yellow-400 transition-colors duration-200">{t("profile.playerstats.title")}</h4>
                <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors duration-200">{t("profile.playerstats.description")}</p>
              </div>
            </button>

            {/* Match Stats */}
            <button
              onClick={() => navigate('/matchstats')}
              className="flex items-center gap-3 p-4 bg-[#1a1a1a] border border-gray-700 rounded-xl hover:border-yellow-400 hover:bg-[#2a2a2a] transition-all duration-200 group"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center group-hover:bg-yellow-400 transition-all duration-200">
                <TrendingUp size={20} className="text-gray-400 group-hover:text-black transition-colors duration-200" />
              </div>
              <div className="text-left">
                <h4 className="text-white font-medium group-hover:text-yellow-400 transition-colors duration-200">{t("profile.matchstats.title")}</h4>
                <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors duration-200">{t("profile.matchstats.description")}</p>
              </div>
            </button>

            {/* Logout */}
            <button
              onClick={Logout}
              className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-700 rounded-xl hover:border-red-500 hover:bg-red-900/30 transition-all duration-200 group"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-red-800/50 rounded-lg flex items-center justify-center group-hover:bg-red-500 transition-all duration-200">
                <LogOut size={20} className="text-red-400 group-hover:text-white transition-colors duration-200" />
              </div>
              <div className="text-left">
                <h4 className="text-red-300 font-medium group-hover:text-white transition-colors duration-200">{t("profile.logout.title")}</h4>
                <p className="text-red-500 text-sm group-hover:text-red-300 transition-colors duration-200">{t("profile.logout.description")}</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* <button onClick={Logout}>Logout</button> */}
    </div>
  );
};

export default Profile;
