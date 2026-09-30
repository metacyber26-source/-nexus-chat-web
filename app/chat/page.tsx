'use client'

import { useEffect, useRef, useState } from 'react'
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
  pending?: boolean
}

type AttendanceRecord = {
  id: string
  user_name: string
  joined_at: string
}

export default function CommunityCallPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [userName, setUserName] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [isOnline, setIsOnline] = useState(true)

  // State untuk Audio & Screen Share
  const [isAudioActive, setIsAudioActive] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const localAudioRef = useRef<HTMLAudioElement | null>(null)
  const screenShareRef = useRef<HTMLVideoElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

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

  useEffect(() => {
    fetchRooms()
  }, [])

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

  // --- FITUR AUDIO DENGAN PEREDAM BISING & GEMA ---
  async function toggleAudioChat() {
    if (isAudioActive) {
      // Matikan Audio
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      setIsAudioActive(false)
    } else {
      try {
        // Meminta izin mikrofon dengan optimasi peredam bising (noise suppression) & gema (echo cancellation)
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        })

        localStreamRef.current = stream
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = stream
        }
        setIsAudioActive(true)
      } catch (err) {
        alert('Gagal mengakses mikrofon. Pastikan izin browser diberikan.')
      }
    }
  }

  // --- FITUR BERBAGI LAYAR (SCREEN SHARING) UNTUK EDUKASI ---
  async function toggleScreenShare() {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      setIsScreenSharing(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 15 }, // Dibatasi 15 fps agar tetap ringan dan lancar di sinyal jelek
          audio: false,
        })

        screenStreamRef.current = stream
        if (screenShareRef.current) {
          screenShareRef.current.srcObject = stream
        }
        setIsScreenSharing(true)

        // Otomatis matikan share screen jika pengguna menekan tombol "Stop sharing" dari browser
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false)
        }
      } catch (err) {
        // Pengguna membatalkan share screen
      }
    }
  }

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
          <h1 className="text-xl font-bold text-center">Gabung Sesi Komunitas</h1>
          <p className="text-xs text-slate-400 text-center">Masukkan nama Anda untuk masuk ke ruang kolaborasi.</p>
          <input
            type="text"
            placeholder="Nama Anda..."
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => { if (userName.trim()) setIsJoined(true) }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-lg text-sm font-semibold transition"
          >
            Masuk Ruangan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-amber-600 text-black text-center text-xs py-1 font-bold z-50">
          ⚠️ Sinyal Lemah / Offline. Pesan disimpan dan disinkronkan otomatis.
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

      {/* Area Utama */}
      <div className="flex-1 flex flex-col h-full">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
          <div>
            <span className="font-bold text-sm"># {currentRoom?.name || 'Pilih Ruangan'}</span>
            <span className="block text-[10px] text-slate-400">Pengguna: <strong className="text-emerald-400">{userName}</strong></span>
          </div>

          {/* Panel Kontrol Audio & Screen Share */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAudioChat}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                isAudioActive ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isAudioActive ? '🔴 Matikan Mikrofon' : '🎙️ Aktifkan Suara'}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                isScreenSharing ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white'
              }`}
            >
              {isScreenSharing ? '🖥️ Hentikan Layar' : '📺 Bagikan Layar'}
            </button>

            <button
              onClick={downloadAttendanceCSV}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs px-3 py-1.5 rounded-lg transition font-medium"
            >
              📥 Absen ({attendance.length})
            </button>
          </div>
        </div>

        {/* Tampilan Screen Sharing (Jika aktif) */}
        {isScreenSharing && (
          <div className="bg-black p-2 border-b border-slate-800 flex justify-center items-center h-48 md:h-64 relative">
            <video ref={screenShareRef} autoPlay playsInline className="h-full rounded-lg object-contain" />
            <span className="absolute bottom-3 left-3 bg-slate-900/80 text-emerald-400 text-[10px] px-2 py-1 rounded">
              Layar Anda Sedang Dibagikan
            </span>
          </div>
        )}

        <audio ref={localAudioRef} autoPlay playsInline muted />

        {/* Area Pesan Chat */}
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

        {/* Form Kirim Pesan */}
        <form onSubmit={sendMessage} className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Ketik pesan atau diskusi..."
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
