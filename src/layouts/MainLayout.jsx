import React from 'react';
import Header from '../components/common/Header.jsx';
import Footer from '../components/common/Footer.jsx';
export default function MainLayout({children}){return (<><Header /><main className='mx-auto max-w-7xl px-4 py-8'>{children}</main><Footer /></>);}
