import './globals.css'

export const metadata = {
  title: 'Secure Next-Gen Chat',
  description: 'Aplikasi chat aman berteknologi tinggi',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body className="bg-slate-950 text-white">
        {children}
      </body>
    </html>
  )
}
