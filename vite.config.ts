import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { generateApiPlugin } from './server/generateApiPlugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), generateApiPlugin()],
})
