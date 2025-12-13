import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  base: './', // 使用相对路径，确保打包后可以在任何位置打开
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 将所有资源内联到单个 HTML 文件中
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // 确保资源文件使用相对路径
        assetFileNames: 'assets/[name].[hash].[ext]',
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js',
        // 内联所有资源
        inlineDynamicImports: true
      }
    }
  }
})
