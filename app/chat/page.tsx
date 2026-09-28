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
  id: string
  content: string
  user_name: string
  created_at: string
}

export default function ChatRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [userName, setUserName] = useState('')
  const [isJoined, setIsJoined] = useState(false)

  // Ambil daftar ruang obrolan saat pertama kali dimuat
  useEffect(() => {
    fetchRooms()
  }, [])

  // Ambil pesan real-time saat ruang obrolan dipilih
  useEffect(() => {
    if (!currentRoom) return

    fetchMessages(currentRoom.id)

    const channel = supabase
      .channel(`room:${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${currentRoom.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentRoom])

  async function fetchRooms() {
    const { data } = await supabase.from('rooms').select('*').order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setRooms(data)
      setCurrentRoom(data[0]) // Pilih ruang pertama secara default
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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !currentRoom || !userName.trim()) return

    await supabase.from('messages').insert([
      {
        room_id: currentRoom.id,
        user_name: userName,
        content: newMessage,
      }
    ])

    setNewMessage('')
  }

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white p-4">
        <div className="w-full max-w-sm bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-4">
          <h1 className="text-xl font-bold text-center">Masuk Ruang Obrolan</h1>
          <p className="text-xs text-slate-400 text-center">Masukkan nama Anda untuk mulai bergabung ke obrolan komunitas.</p>
          <input
            type="text"
            placeholder="Nama Anda..."
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => {
              if (userName.trim()) setIsJoined(true)
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg text-sm font-semibold transition"
          >
            Gabung Sekarang
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      {/* Sidebar Daftar Ruangan */}
      <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-700 font-bold text-sm">Daftar Ruangan</div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setCurrentRoom(room)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                currentRoom?.id === room.id ? 'bg-blue-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              # {room.name}
            </button>
          ))}
        </div>
      </div>

      {/* Area Chat Utama */}
      <div className="flex-1 flex flex-col h-full">
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
          <span className="font-bold text-sm"># {currentRoom?.name || 'Pilih Ruangan'}</span>
          <span className="text-xs text-slate-400">Masuk sebagai: <strong className="text-white">{userName}</strong></span>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {messages.map((msg) => {
            const isMe = msg.user_name === userName
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-slate-400 mb-0.5 px-1">{msg.user_name}</span>
                <div
                  className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                    isMe ? 'bg-blue-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-200'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            )
          })}
        </div>

        <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-slate-700 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Ketik pesan..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500 text-white"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-full text-sm font-semibold transition"
          >
            Kirim
          </button>
        </form>
      </div>
    </div>
  )
}
