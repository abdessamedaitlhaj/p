import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./**/*.{js,ts,jsx,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        japanese: ["Sawarabi Mincho", "serif"],
        moroccan: ["Cormorant Garamond", "serif"],
        arcade: ["Orbitron", "monospace"],
        space: ["Orbitron", "sans-serif"],
      },
      colors: {
        // Original theme colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Pong theme colors
        japanese: {
          background: "#faf8f3",
          paddle: "#dc2626",
          ball: "#1f2937",
          accent: "#dc2626",
          text: "#1f2937",
        },
        moroccan: {
          background: "#1e3a8a",
          paddle: "#f59e0b",
          ball: "#ea580c",
          accent: "#16a34a",
          text: "#f8fafc",
        },
        arcade: {
          background: "#1e293b",
          paddle: "#dc2626",
          paddleAccent: "#ffffff",
          ball: "#3b82f6",
          accent: "#ef4444",
          text: "#f1f5f9",
        },
        space: {
          background: "#0f0f23",
          paddle: "#06b6d4",
          ball: "#10b981",
          accent: "#f97316",
          text: "#f8fafc",
        },
        gray_1: "#252525",
        gray_2: "#292929",
        gray_3: "#474747",
        yellow_1: "#FFEA00",
        yellow_2: "#FFF70B",
        yellow_3: "#A9911A",
        text_dark: "#232222",
        input_color: "#6D6D6D",
        avatar_color: "#D9D9D9",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        glow: {
          "0%, 100%": {
            filter: "drop-shadow(0 0 5px currentColor)",
          },
          "50%": {
            filter: "drop-shadow(0 0 15px currentColor)",
          },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
      },
      backgroundImage: {
        "japanese-pattern":
          "radial-gradient(circle at 20% 20%, rgba(220, 38, 38, 0.1) 0%, transparent 50%)",
        "moroccan-pattern":
          "repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.1) 10px, transparent 10px, transparent 20px)",
        "space-stars":
          "radial-gradient(2px 2px at 20px 30px, #eee, transparent), radial-gradient(2px 2px at 40px 70px, #fff, transparent), radial-gradient(1px 1px at 90px 40px, #fff, transparent)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
