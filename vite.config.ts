/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// BASE_PATH wird beim Deployment auf GitHub Pages gesetzt (z. B. "/Habit-Tracker/").
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  build: {
    rolldownOptions: {
      output: {
        // Bibliotheken in eigene, selten wechselnde Pakete: Ein App-Update lädt dann nur den App-Code neu.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            {
              name: 'vendor',
              test: /node_modules[\\/](dexie|dexie-react-hooks|motion|motion-dom|motion-utils|framer-motion|lucide-react)[\\/]/,
            },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Neue Versionen übernehmen sich selbst (skipWaiting + Neuladen). Registriert wird in src/main.tsx
      // über `virtual:pwa-register` – inkl. Update-Prüfung beim Zurückkehren in die App.
      registerType: 'autoUpdate',
      // Zusätzlich zu globPatterns vorhalten (favicon.svg ist dort schon über *.svg enthalten).
      includeAssets: ['apple-touch-icon.png'],
      // Die großen Installations-Icons braucht nur die Installation selbst (aus dist), nicht der Offline-Cache.
      includeManifestIcons: false,
      manifest: {
        // Feste App-Identität (= bisherige, aus start_url abgeleitete), auch falls sich start_url ändert.
        id: base,
        name: 'Questlog – Dein Abenteuer',
        short_name: 'Questlog',
        description: 'Gamifizierter Habit-Tracker im RPG-Stil: Quests erfüllen, leveln, Kampagnen meistern.',
        lang: 'de',
        theme_color: '#0e0b08',
        background_color: '#0e0b08',
        display: 'standalone',
        // Keine feste Ausrichtung: Die Oberfläche hat Quer- und Tablet-Layouts.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Nur woff2 (können alle unterstützten Browser) statt zusätzlich der .woff-Fallbacks; PNGs nur über
        // includeAssets (apple-touch-icon), die Manifest-Icons nicht.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Inter-Zeichensätze für Kyrillisch/Griechisch/Vietnamesisch lädt der Browser nur bei Bedarf.
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
      },
    }),
  ],
  test: {
    // Großzügig für ausgelastete CI-Runner (Standard: 5 s); findBy…-Wartezeit siehe src/test/setup.ts.
    testTimeout: 15_000,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
