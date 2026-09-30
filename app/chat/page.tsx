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
  type?: 'text' | 'audio'
  media_url?: string
  created_at?: string
}

type AttendanceRecord = {
  id: string
  user_name: string
  joined_at: string
}

export default function WalkieTalkiePage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [userName, setUserName] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [isOnline, setIsOnline] = useState(true)

  const [isRecording, setIsRecording] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenShareRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    function handleOnline() { setIsOnline(true); }
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

    const chatChannel = supabase
      .channel(`room-stream:${currentRoom.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoom.id}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new as Message]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(chatChannel)
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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !currentRoom || !userName.trim()) return

    const messagePayload = {
      room_id: currentRoom.id,
      user_name: userName,
      content: newMessage,
      type: 'text',
    }

    const { error } = await supabase.from('messages').insert([messagePayload])
    if (!error) {
      setNewMessage('')
    }
  }

  // Fungsi PTT (Push-to-Talk) Rekam Suara
  async function startRecording() {
    audioChunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const fileName = `voice_${Date.now()}.webm`
        
        // Unggah ke Supabase Storage Bucket 'chat-media'
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(fileName, audioBlob)

        if (uploadError) {
          alert('Gagal mengunggah pesan suara. Pastikan Storage Bucket "chat-media" sudah disetel publik.')
          return
        }

        const { data: publicUrlData } = supabase.storage
          .from('chat-media')
          .getPublicUrl(fileName)

        // Kirim referensi file audio ke tabel pesan
        await supabase.from('messages').insert([{
          room_id: currentRoom?.id,
          user_name: userName,
          content: '🎤 [Pesan Suara]',
          type: 'audio',
          media_url: publicUrlData.publicUrl
        }])

        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      alert('Gagal mengakses mikrofon perangkat.')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  async function toggleScreenShare() {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      setIsScreenSharing(false)
    } else {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert('Fitur berbagi layar tidak didukung di perangkat seluler ini.')
          return
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
        screenStreamRef.current = stream
        if (screenShareRef.current) screenShareRef.current.srcObject = stream
        setIsScreenSharing(true)
        stream.getVideoTracks()[0].onended = () => setIsScreenSharing(false)
      } catch (err) {
        alert('Berbagi layar dibatalkan.')
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
          <h1 className="text-xl font-bold text-center text-emerald-400">ICP2E JAWA TIMUR</h1>
          <p className="text-xs text-slate-400 text-center">Masukkan nama Anda untuk bergabung ke ruang diskusi.</p>
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
          ⚠️ Koneksi Terputus (Offline).
        </div>
      )}

      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-800 font-bold text-sm text-emerald-400">ICP2E JAWA TIMUR</div>
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
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-sm text-emerald-400"># {currentRoom?.name || 'Diskusi Komunitas'}</span>
            <span className="text-[11px] text-slate-400">Akun: <strong className="text-white">{userName}</strong></span>
          </div>
          
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              onClick={toggleScreenShare}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                isScreenSharing ? 'bg-amber-600 text-white' : 'bg-slate-800 border border-slate-700 text-white'
              }`}
            >
              {isScreenSharing ? '🖥️ Stop Layar' : '📺 Share Layar'}
            </button>

            <button
              onClick={downloadAttendanceCSV}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] px-2.5 py-1 rounded transition"
            >
              📥 Absen ({attendance.length})
            </button>
          </div>
        </div>

        {isScreenSharing && (
          <div className="bg-black p-2 border-b border-slate-800 flex justify-center items-center h-40 relative">
            <video ref={screenShareRef} autoPlay playsInline className="h-full rounded object-contain" />
            <span className="absolute bottom-2 left-2 bg-slate-900/80 text-emerald-400 text-[10px] px-2 py-0.5 rounded">
              Berbagi Layar Aktif
            </span>
          </div>
        )}

        {/* Daftar Pesan */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
          {messages.map((msg, index) => {
            const isMe = msg.user_name === userName
            return (
              <div key={msg.id || index} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-slate-400 px-1">{msg.user_name}</span>
                <div className={`max-w-[85%] p-2.5 rounded-xl text-sm ${isMe ? 'bg-emerald-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-200'}`}>
                  {msg.type === 'audio' && msg.media_url ? (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold block">🎤 Pesan Suara</span>
                      <audio controls src={msg.media_url} className="w-full h-8 mt-1" />
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Panel Kontrol Bawah (Tombol PTT & Input Teks) */}
        <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`px-3 py-2 rounded-full text-xs font-semibold transition select-none ${
              isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
            title="Tekan dan tahan untuk merekam suara"
          >
            {isRecording ? '🎙️ Lepas untuk Kirim' : '🎙️ Tahan Bicara'}
          </button>

          <form onSubmit={sendMessage} className="flex-1 flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Ketik pesan..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-full px-3.5 py-2 text-xs focus:outline-none focus:border-emerald-500 text-white"
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-full text-xs font-semibold transition"
            >
              Kirim
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
