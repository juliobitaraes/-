/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./diagnostico.html",
    "./test-email.html",
    "./manual-sistema.html",
    "./js/**/*.js",
    "./web/**/*.{html,js}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  darkMode: 'class',
  safelist: [
    // Dynamic classes that might be generated in JS
    { pattern: /bg-[a-z]+-\d+/, variants: ['dark', 'hover'] },
    { pattern: /text-[a-z]+-\d+/, variants: ['dark', 'hover'] },
    { pattern: /border-[a-z]+-\d+/, variants: ['dark', 'hover'] },
    { pattern: /from-[a-z]+-\d+/, variants: ['dark'] },
    { pattern: /to-[a-z]+-\d+/, variants: ['dark'] },
    { pattern: /ring-[a-z]+-\d+/, variants: ['dark'] },
    { pattern: /shadow-[a-z]+-\d+/, variants: ['dark'] },
    'bg-gradient-to-br',
    'bg-gradient-to-r',
    'bg-gradient-to-b',
  ]
}

