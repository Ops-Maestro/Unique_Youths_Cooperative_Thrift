import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",  // Add this line
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "lucide": ["lucide-react"],
          "page-profit": ["./src/pages/ProfitMatrix.tsx"],
          "page-members": ["./src/pages/Members.tsx"],
          "page-contributions": ["./src/pages/ContributionsTracker.tsx"],
          "page-draw": ["./src/pages/AjoRecipientDraw.tsx"],
          "page-slots": ["./src/pages/MemberSlotGrid.tsx"],
          "page-disbursals": ["./src/pages/MonthlyDisbursals.tsx"],
          "page-guarantors": ["./src/pages/GuarantorPortal.tsx"],
          "page-broadcast": ["./src/pages/BroadcastEngine.tsx"],
          "page-activity": ["./src/pages/ActivityLog.tsx"],
          "page-settings": ["./src/pages/Settings.tsx"],
          "page-claims": ["./src/pages/PaymentClaims.tsx"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    cssMinify: true,
  },
  server: {
    hmr: {
      overlay: false,
    },
  },
});