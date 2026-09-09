import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

const app = <AuthProvider><App /></AuthProvider>

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {import.meta.env.MODE === 'pages'
      ? <HashRouter>{app}</HashRouter>
      : <BrowserRouter>{app}</BrowserRouter>}
  </StrictMode>,
)
