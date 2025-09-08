import { GameSettings, DEFAULT_SETTINGS } from "@/lib/gameConfig";

interface GameSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onSettingsChange: (settings: GameSettings) => void;
}

export function GameSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: GameSettingsProps) {
  if (!isOpen) return null;

  const updateSetting = <K extends keyof GameSettings>(
    key: K,
    value: GameSettings[K],
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Game Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Ball Speed */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Ball Speed
            </h3>
            <div className="flex gap-2">
              {(["slow", "normal", "fast"] as const).map((speed) => (
                <button
                  key={speed}
                  onClick={() => updateSetting("ballSpeed", speed)}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                    settings.ballSpeed === speed
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {speed.charAt(0).toUpperCase() + speed.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas Shape */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Canvas Shape
            </h3>
            <div className="flex gap-2">
              {(
                [
                  { key: "rectangle", label: "Rectangle" },
                  { key: "square", label: "Square" },
                  { key: "wide", label: "Wide" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => updateSetting("canvasShape", key)}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                    settings.canvasShape === key
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Score to Win */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Score to Win
            </h3>
            <div className="flex gap-2">
              {([3, 5, 7] as const).map((score) => (
                <button
                  key={score}
                  onClick={() => updateSetting("scoreToWin", score)}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                    settings.scoreToWin === score
                      ? "bg-purple-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {score} Points
                </button>
              ))}
            </div>
          </div>

          {/* Reset to Default */}
          <div className="pt-4 border-t">
            <button
              onClick={() => onSettingsChange(DEFAULT_SETTINGS)}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-all"
            >
              Reset to Default
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
