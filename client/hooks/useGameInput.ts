import { useEffect } from "react";
import { Socket } from "socket.io-client";

export function useGameInput(socket: Socket | null) {
  useEffect(() => {
    if (!socket) return;

    const pressedKeys = new Set<string>();

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      
      // Only handle game keys
      if (!['w', 's', 'ArrowUp', 'ArrowDown'].includes(key)) return;
      
      // Prevent default behavior for arrow keys
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        event.preventDefault();
      }
      
      // Only emit if key wasn't already pressed
      if (!pressedKeys.has(key)) {
        pressedKeys.add(key);
        console.log(`Key down: ${key}`);
        socket.emit("game_input", key, true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key;
      
      // Only handle game keys
      if (!['w', 's', 'ArrowUp', 'ArrowDown'].includes(key)) return;
      
      // Prevent default behavior for arrow keys
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        event.preventDefault();
      }
      
      if (pressedKeys.has(key)) {
        pressedKeys.delete(key);
        console.log(`Key up: ${key}`);
        socket.emit("game_input", key, false);
      }
    };

    // Add event listeners
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Cleanup function
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      pressedKeys.clear();
    };
  }, [socket]);
}