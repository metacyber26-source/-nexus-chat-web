'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

type Message = {
  id: string
  content: string
  sender_id: string
  created_at: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [userId, setUserId] = useState<string>('user-' + Math.random().toString(36).substring(7))

  useEffect(() => {
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
    if (!newMessage.trim()) return

    await supabase.from('messages').insert([
      {
        content: newMessage,
        sender_id: userId,
      }
    ])

    setNewMessage('')
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
          className="bg-blue-600 px-5 py-2 rounded-full text-sm font-semibold"
        >
          Kirim
        </button>
      </form>
    </div>
  )
}
