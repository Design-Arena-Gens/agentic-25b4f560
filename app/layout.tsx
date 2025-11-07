import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Restaurar Fotos Antigas',
  description: 'Restaure e melhore fotos antigas diretamente no navegador',
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
  icons: [{ rel: 'icon', url: '/favicon.ico' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body>
        <div className="min-h-screen">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-black/30 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-cyan-300/20 ring-1 ring-cyan-300/40" />
                <span className="text-sm font-semibold tracking-wide text-cyan-200">Restaurar Fotos</span>
              </div>
              <a className="btn btn-secondary text-sm" href="https://agentic-25b4f560.vercel.app" target="_blank" rel="noreferrer">Abrir em produ??o</a>
            </div>
          </header>
          <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-white/50">
            Processamento local com OpenCV.js. Suas fotos n?o saem do navegador.
          </footer>
        </div>
      </body>
    </html>
  );
}
