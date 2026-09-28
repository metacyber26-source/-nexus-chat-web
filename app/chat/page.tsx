'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../utils/supabase'

type Message = {
  id: string
  content: string
  sender_id: string
  created_at: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [userId, setUserId] = useState<string>('')

  useEffect(() => {
    async function getSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUserId(session.user.id)
      } else {
        const { data } = await supabase.auth.signInAnonymously()
        if (data.user) setUserId(data.user.id)
      }
    }
    getSession()
    fetchMessages()

    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
    
    if (data) setMessages(data)
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !userId) return

    const { error } = await supabase.from('messages').insert([
      {
        content: newMessage,
        sender_id: userId,
        room_id: 'global'
      }
    ])

    if (!error) {
      setNewMessage('')
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-900 text-white">
      <div className="p-4 bg-slate-800 border-b border-slate-700 font-bold text-center">
        Secure Next-Gen Chat
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.map((msg) => {
          const isMe = msg.sender_id === userId
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                  isMe ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {msg.content}
              </div>
              <span className="text-[10px] text-slate-500 mt-1">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )
        })}
      </div>

      <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-slate-700 flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Ketik pesan rahasia..."
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
  )
}
