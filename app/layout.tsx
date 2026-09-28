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
      <body style={{ backgroundColor: '#020617', color: '#ffffff', margin: 0, fontFamily: 'sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
