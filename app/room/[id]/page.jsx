'use client';

import { useState } from 'react';

export default function AudioRoomPage({ params }) {
  const roomId = params.id;
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Simulasi daftar peserta di dalam ruangan
  const participants = [
    { id: 1, name: 'Dev', role: 'Host', speaking: false },
    { id: 2, name: 'Ahmad', role: 'Speaker', speaking: true },
    { id: 3, name: 'Siti', role: 'Listener', speaking: false },
  ];

  // ==========================================
  // 1. TEMPATKAN KODE LOGIKA MIKROFON DI SINI
  // ==========================================
  const startAudioStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log("Akses mikrofon berhasil diberikan:", stream);
      
      setIsMuted(false);
      setIsSpeaking(true);
    } catch (error) {
      console.error("Gagal mengakses mikrofon:", error);
      alert("Izin mikrofon ditolak atau perangkat tidak mendukung.");
    }
  };

  const stopAudioStream = () => {
    setIsMuted(true);
    setIsSpeaking(false);
  };

  const toggleMicrophone = () => {
    if (isMuted) {
      startAudioStream();
    } else {
      stopAudioStream();
    }
  };
  // ==========================================

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white p-4">
      {/* Header Ruangan */}
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-lg font-bold">Ruangan Diskusi Komunitas</h1>
          <p className="text-xs text-slate-400">ID Ruangan: {roomId}</p>
        </div>
        <button className="bg-red-600 hover:bg-red-700 text-xs px-3 py-1.5 rounded-full font-medium transition">
          Keluar
        </button>
      </div>

      {/* Grid Peserta / Panggung Audio */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 content-start overflow-y-auto">
        {participants.map((user) => (
          <div
            key={user.id}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition ${
              user.speaking
                ? 'bg-emerald-900/30 border-emerald-500 shadow-lg shadow-emerald-500/20 animate-pulse'
                : 'bg-slate-800/50 border-slate-700'
            }`}
          >
            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-xl font-bold mb-2 border-2 border-slate-600">
              {user.name.charAt(0)}
            </div>
            <span className="text-sm font-semibold truncate max-w-[100px]">{user.name}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{user.role}</span>
          </div>
        ))}
      </div>

      {/* Kontrol Audio di Bagian Bawah */}
      <div className="flex justify-center items-center gap-4 py-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur">
        {/* Hubungkan tombol dengan fungsi toggleMicrophone */}
        <button
          onClick={toggleMicrophone}
          className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm transition ${
            isMuted
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
          }`}
        >
          <span>{isMuted ? 'Mic Mati (Mute)' : 'Mic Menyala'}</span>
        </button>
      </div>
    </div>
  );
}
