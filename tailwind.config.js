module.exports = {
  content: [
    './index.html',
    './app/**/*.{ts,tsx,js,jsx}',
    './pages/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        info: 'var(--info)',
        gray: {
          50: 'var(--gray-50)',
          100: 'var(--gray-100)',
          500: 'var(--gray-500)',
          900: 'var(--gray-900)',
        },
      },
      backgroundImage: {
        'gradient-primary': 'var(--primary-gradient)',
        'gradient-secondary': 'var(--secondary-gradient)',
        'gradient-accent': 'var(--accent-gradient)',
      },
    },
  },
  plugins: [],
};
