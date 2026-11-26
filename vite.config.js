import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],server:{port:5173,strictPort:true,watch:{usePolling:true,interval:1000},proxy:{'/api':process.env.STUDIO_API_URL || 'http://127.0.0.1:4310'}}});
