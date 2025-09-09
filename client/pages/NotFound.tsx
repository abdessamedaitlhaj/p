import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="h-[800px] flex items-center justify-center bg-transparent">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-white/50">404</h1>
        <p className="text-xl text-white/50 mb-4">Oops! Page not found</p>
        <Link to="/">
          <span className="text-yellow_3 hover:text-yellow_1">
            Return to Home
          </span>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
