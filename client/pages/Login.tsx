import React, { useState, useEffect } from "react";
import { useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useStore } from "../store/useStore";
import api from "@/utils/Axios";
const Login = () => {
  type userData = {
    msg: string;
    username: string;
    accessToken: string;
  };
  const { state, dispatch, setPersist, persist } = useAuth();
  const navigate = useNavigate();

  const location = useLocation();

  // if (persist) {
  // 	// Redirect to where they came from or default to "/"
  // 	const from = location.state?.from?.pathname || '/';
  // 	return <Navigate to={from} replace />;
  // }

  const [email, setEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [userdata, setUserData] = useState<userData | null>(null);
  const [error, setError] = useState<string>("");

  const setUser = useStore((state) => state.setUser);

  useEffect(() => {

  }, []);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: "Start_Login" });
    setError("");

    // setTimeout(() => {
    //   console.log("Waited 3 seconds!");
    // }, 3000);

    try {
      const res = await api.post("auth/signin", {
        email,
        username,
        password,
      });
      localStorage.setItem("persist", JSON.stringify(true));
      setPersist(true); //persist login
      dispatch({ type: "Success_Login", payload: res.data });


      setUserData(res.data);
      setUser(res.data.user);
      navigate("/profile");
    } catch (err: any) {
      dispatch({ type: "Failed_Login", payload: err.response?.data?.message });
      console.error(err);
      setError(err.response?.data?.message || "Login failed");
    }
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="max-w-sm mx-auto p-6 bg-white rounded-xl shadow-md space-y-4"
      >
        <input
          type="text"
          aria-label="username"
          placeholder="Username"
          value={username}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setUsername(e.target.value)
          }
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <input
          type="email"
          aria-label="email"
          placeholder="Email"
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setEmail(e.target.value)
          }
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <input
          type="password"
          aria-label="password"
          placeholder="Password"
          value={password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setPassword(e.target.value)
          }
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />

        <button
          type="submit"
          disabled={state.loading}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors duration-200"
        >
          {state.loading ? "Logging in..." : "Login"}
        </button>
      </form>

      {error && <p className="text-red-500 text-center mt-4">{error}</p>}

      {userdata && (
        <div className="text-center mt-4">
          <p className="text-green-600">Welcome, {userdata.username}!</p>
          <p className="text-sm text-gray-600">{userdata.msg}</p>
        </div>
      )}
    </>
  );
};

export default Login;
