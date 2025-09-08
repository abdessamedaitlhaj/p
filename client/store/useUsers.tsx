import api from "@/utils/Axios";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
interface User {
  id: string;
  username: string;
  email: string;
  avatarurl?: string;
  status: string;
  last_seen?: string | null;
  createdAt: string;
  alias?: string | null;
}

export const useUsers = () => {
  const { state : {user} } = useAuth();
  const fetchUsers = () =>
    api
      .get<{ users: User[] }>("/users",
        {
          headers: {
            'Authorization': `Bearer ${user?.accessToken}`
          }
        }
      )
      .then((response) => response.data.users);

  return useQuery<User[], Error>({
    queryKey: ["users"],
    queryFn: fetchUsers,
    staleTime: 1000 * 10 * 1000,
  });
};
