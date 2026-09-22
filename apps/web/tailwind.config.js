/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#f5f5f5',
          soft: '#fafafa',
          deep: '#0c0a09',
        },
        ink: {
          DEFAULT: '#0c0a09',
          primary: '#292524',
          active: '#0c0a09',
        },
        body: {
          DEFAULT: '#4e4e4e',
          strong: '#292524',
        },
        muted: {
          DEFAULT: '#777169',
          soft: '#a8a29e',
        },
        hairline: {
          DEFAULT: '#e7e5e4',
          soft: '#f0efed',
          strong: '#d6d3d1',
        },
        surface: {
          card: '#ffffff',
          strong: '#f0efed',
          dark: '#0c0a09',
          'dark-elevated': '#1c1917',
        },
        orb: {
          mint: '#a7e5d3',
          peach: '#f4c5a8',
          lavender: '#c8b8e0',
          sky: '#a8c8e8',
          rose: '#e8b8c4',
        },
      },
      fontFamily: {
        display: ['"Instrument Sans"', '"Google Sans Flex"', 'Inter', 'sans-serif'],
        sans: ['"Instrument Sans"', '"Google Sans Flex"', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        'pill': '9999px',
        'xxl': '24px',
      },
      letterSpacing: {
        'mega': '-1.92px',
        'xl': '-0.96px',
        'lg': '-0.36px',
        'md': '-0.32px',
        'body': '0.16px',
        'caption': '0.96px',
      },
      boxShadow: {
        'soft-drop': '0 4px 16px rgba(0, 0, 0, 0.04)',
        'soft-hover': '0 8px 24px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
