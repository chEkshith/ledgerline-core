/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0f1d',
        surface: '#131b2e',
        card: '#1c2640',
        cardHover: '#222f4f',
        border: '#2e3d60',
        primary: {
          DEFAULT: '#0d9488',
          hover: '#0f766e',
          light: '#2dd4bf',
        },
        accent: '#06b6d4',
      },
    },
  },
  plugins: [],
};
