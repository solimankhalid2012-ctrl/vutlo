import React from 'react';
export default function Toast({msg}){if(!msg)return null;return <div className='fixed bottom-6 start-1/2 -translate-x-1/2 rounded-2xl bg-emerald px-5 py-3 font-bold text-void shadow-glow'>{msg}</div>;}
