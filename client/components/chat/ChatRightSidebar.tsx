import React from "react";
import { Link } from "react-router-dom";

export const ChatRightSidebar = () => {
  return (
    <div className="flex h-full  md:flex-col mt-4 md:mt-0 gap-4 w-full md:w-1/5">
      <div className="flex flex-col items-center md:h-1/4 p-4 bg-gray_3/80 rounded-2xl w-1/3 md:w-full ">
        <div className=" mb-6 self-start">
          <h3 className="text-white text-lg font-medium">Chat Info</h3>
        </div>

        <div className="text-center mb-6">
          <p className="text-white text-xs">21/07/2025 15:13</p>
        </div>

        <div className="w-1/2">
          <Link to="/profile">
            <button className=" bg-yellow_3 hover:bg-yellow_3/80 py-3 px-4 rounded-full font-medium text-base">
              Profile
            </button>
          </Link>
        </div>
      </div>
      <div className="min-h-0 p-4 bg-gray_3/80 rounded-2xl w-full md:w-full flex flex-col">
        <div className="mb-6 flex-shrink-0">
          <h3 className="text-white text-lg font-medium">
            <span className="text-yellow_1">23</span> online friends
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hidden min-h-0">
          <div className="space-y-2">
            {Array.from({ length: 12 }, (_, index) => (
              <div
                key={index}
                className="flex items-center space-x-4 p-2 rounded-lg hover:bg-gray_1 transition-colors cursor-pointer"
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 bg-avatar_color rounded-full"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-base font-medium truncate">
                    Name
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
