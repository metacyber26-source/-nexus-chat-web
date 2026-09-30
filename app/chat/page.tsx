'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

type Room = {
  id: string
  name: string
}

type Message = {
  id?: string
  room_id: string
  content: string
  user_name: string
  created_at?: string
  pending?: boolean // Penanda jika pesan belum terkirim karena sinyal jelek
}

type AttendanceRecord = {
  id: string
  user_name: string
  joined_at: string
}

export default function AdvancedChatPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [userName, setUserName] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [isOnline, setIsOnline] = useState(true)

  // Deteksi status koneksi internet (Sinyal Jelek / Offline)
  useEffect(() => {
    function handleOnline() { setIsOnline(true); syncOfflineMessages(); }
    function handleOffline() { setIsOnline(false); }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Ambil daftar ruangan saat pertama kali dimuat
  useEffect(() => {
    fetchRooms()
  }, [])

  // Sinkronisasi pesan dan data kehadiran saat pindah ruangan
  useEffect(() => {
    if (!currentRoom || !isJoined) return

    fetchMessages(currentRoom.id)
    fetchAttendance(currentRoom.id)
    recordAttendance(currentRoom.id, userName)

    const channel = supabase
      .channel(`room-stream:${currentRoom.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoom.id}` },
        (payload) => {
          setMessages((prev) => {
            // Hindari duplikasi pesan lokal
            if (prev.some((m) => m.content === payload.new.content && m.user_name === payload.new.user_name)) {
              return prev
            }
            return [...prev, payload.new as Message]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentRoom, isJoined])

  async function fetchRooms() {
    const { data } = await supabase.from('rooms').select('*').order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setRooms(data)
      setCurrentRoom(data[0])
    }
  }

  async function fetchMessages(roomId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data)
  }

  async function fetchAttendance(roomId: string) {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true })
    if (data) setAttendance(data)
  }

  async function recordAttendance(roomId: string, name: string) {
    await supabase.from('attendance').insert([{ room_id: roomId, user_name: name }])
    fetchAttendance(roomId)
  }

  // Fitur Sinkronisasi Pesan Offline (Antrean saat Sinyal Jelek)
  async function syncOfflineMessages() {
    const offlineQueue = JSON.parse(localStorage.getItem('offline_messages') || '[]')
    if (offlineQueue.length === 0) return

    for (const msg of offlineQueue) {
      await supabase.from('messages').insert([msg])
    }
    localStorage.removeItem('offline_messages')
    if (currentRoom) fetchMessages(currentRoom.id)
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !currentRoom || !userName.trim()) return

    const messagePayload = {
      room_id: currentRoom.id,
      user_name: userName,
      content: newMessage,
    }

    if (!isOnline) {
      // Jika sinyal mati/jelek, simpan ke localStorage agar tidak hilang
      const offlineQueue = JSON.parse(localStorage.getItem('offline_messages') || '[]')
      offlineQueue.push(messagePayload)
      localStorage.setItem('offline_messages', JSON.stringify(offlineQueue))

      setMessages((prev) => [...prev, { ...messagePayload, pending: true }])
      setNewMessage('')
      return
    }

    const { error } = await supabase.from('messages').insert([messagePayload])
    if (!error) {
      setNewMessage('')
    }
  }

  // Fitur Download Daftar Hadir (CSV)
  function downloadAttendanceCSV() {
    let csvContent = 'data:text/csv;charset=utf-8,' + ['Nama,Waktu Bergabung', ...attendance.map(a => `${a.user_name},${a.joined_at}`)].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `daftar_hadir_${currentRoom?.name || 'room'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white p-4">
        <div className="w-full max-w-sm bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h1 className="text-xl font-bold text-center">Masuk Ruang Diskusi</h1>
          <p className="text-xs text-slate-400 text-center">Masukkan nama atau identitas Anda untuk bergabung.</p>
          <input
            type="text"
            placeholder="Nama Pengguna..."
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => { if (userName.trim()) setIsJoined(true) }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-lg text-sm font-semibold transition"
          >
            Gabung Sesi
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Indikator Sinyal / Koneksi */}
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-amber-600 text-black text-center text-xs py-1 font-bold z-50">
          ⚠️ Sinyal Lemah / Offline. Pesan akan disinkronkan otomatis saat terhubung kembali.
        </div>
      )}

      {/* Sidebar Ruangan */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-800 font-bold text-sm text-emerald-400">Daftar Ruangan</div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setCurrentRoom(room)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                currentRoom?.id === room.id ? 'bg-emerald-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              # {room.name}
            </button>
          ))}
        </div>
      </div>

      {/* Area Chat Utama */}
      <div className="flex-1 flex flex-col h-full">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
          <div>
            <span className="font-bold text-sm"># {currentRoom?.name || 'Pilih Ruangan'}</span>
            <span className="block text-[10px] text-slate-400">Identitas: <strong className="text-emerald-400">{userName}</strong></span>
          </div>
          <button
            onClick={downloadAttendanceCSV}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs px-3 py-1.5 rounded-lg transition font-medium"
          >
            📥 Download Absensi ({attendance.length})
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {messages.map((msg, index) => {
            const isMe = msg.user_name === userName
            return (
              <div key={msg.id || index} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-slate-400 mb-0.5 px-1">{msg.user_name} {msg.pending && '(Menunggu Sinyal...)'}</span>
                <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${isMe ? 'bg-emerald-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-200'}`}>
                  {msg.content}
                </div>
              </div>
            )
          })}
        </div>

        <form onSubmit={sendMessage} className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Ketik pesan..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 text-white"
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 px-5 py-2 rounded-full text-sm font-semibold transition"
          >
            Kirim
          </button>
        </form>
      </div>
    </div>
  )
}
