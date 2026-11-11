import { defineConfig } from 'vite';
export default defineConfig({ server:{ proxy:{ '/api':'http://localhost:10000', '/socket.io':{ target:'http://localhost:10000', ws:true } } } });
