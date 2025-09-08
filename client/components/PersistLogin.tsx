import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import useRefreshToken from "../hooks/useRefreshToken";
import { Outlet, useLocation, Navigate } from "react-router-dom";

const PersistLogin = () => {
  const [loading, setLoading] = useState(true);
  const {
    state: { user },
    persist,
  } = useAuth(); // peresit:true -> mean user still login
  const refresh = useRefreshToken();

  const location = useLocation();

  useEffect(() => {
    var isMounted: boolean = true;

    const refreshToken = async () => {
      try {
        await refresh();
      } catch (err) {
        console.log(err);
      } finally {
        isMounted && setLoading(false);
      }
    };
    console.log(user?.accessToken);
    console.log(persist);
    !user?.accessToken && persist ? refreshToken() : setLoading(false);

    return () => {
      isMounted = false;
    };
  }, []);

  return loading ? (
    <div>...loading</div>
  ) : persist == true && user?.accessToken ? (
    <Outlet />
  ) : (
    <Navigate to="/login" state={{ from: location }} replace />
  );
};

export default PersistLogin;
