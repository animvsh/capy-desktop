# Capy Desktop App

A modern Electron desktop application built with React, Vite, TypeScript, and Tailwind CSS.

## Tech Stack

- **Electron** - Cross-platform desktop app framework
- **React 18** - UI library
- **Vite** - Fast build tool with HMR
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS (dark mode by default)
- **Zustand** - Lightweight state management
- **Supabase** - Backend as a Service
- **Lucide React** - Beautiful icons
- **Electron Store** - Persistent local storage

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server with Electron
npm run dev
```

### Build for Production

```bash
# Build and package the app
npm run build
```

Built packages will be in the `release/` directory.

## Project Structure

```
capydesktopapp/
├── electron/
│   ├── main.ts          # Electron main process
│   └── preload.ts       # Preload script with IPC
├── src/
│   ├── components/      # React components
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Libraries (supabase, etc.)
│   ├── store/           # Zustand stores
│   ├── types/           # TypeScript types
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # React entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── electron-builder.yml # Packaging config
├── vite.config.ts       # Vite config
├── tailwind.config.js   # Tailwind config
└── tsconfig.json        # TypeScript config
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Features

- 🌙 Dark theme by default
- 🔒 Context isolation enabled
- 💾 Persistent local storage via electron-store
- 🔌 Supabase integration ready
- 📦 Cross-platform packaging (macOS, Windows, Linux)
- ⚡ Fast HMR in development

## License

MIT
