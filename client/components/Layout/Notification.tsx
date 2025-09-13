import { X } from "lucide-react";

interface NotificationProps {
  setToggle: (value: boolean) => void;
  isToggle: boolean;
}

export const Notification = ({ setToggle, isToggle }: NotificationProps) => {
  return (
    <div className="relative flex min-h-0 z-40 justify-end">
      <div className="absolute flex flex-col bg-gray_1 rounded-xl w-[400px] h-[400px] top-8 -right-20">
        <div className="flex justify-between items-center p-4 border-b border-gray-300">
          <h3 className="text-lg font-semibold text-white">Notifications</h3>
          <button
            onClick={() => setToggle(false)}
            className="text-gray-400 hover:text-white"
          >
            <X strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-gray-300">No new notifications.</p>
        </div>
      </div>
    </div>
  );
};
