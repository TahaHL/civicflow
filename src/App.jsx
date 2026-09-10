import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'
import AuthPage from './pages/AuthPage'
import CalendarPage from './pages/CalendarPage'
import Dashboard from './pages/Dashboard'
import DocumentsPage from './pages/DocumentsPage'
import NotificationsPage from './pages/NotificationsPage'
import MoneyPage from './pages/MoneyPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/signin" element={<AuthPage />} />
        <Route path="/reset-password" element={<AuthPage resetMode />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
        <Route path="/money" element={<ProtectedRoute><MoneyPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
