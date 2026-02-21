import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import './App.css'
import Calendar from './Calendar'
import AlbumPage from './pages/AlbumPage'
import AlbumDetailPage from './pages/AlbumDetailPage'
import SukiPage from './pages/SukiPage'

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="top-nav">
          <NavLink to="/album" className={({ isActive }) => `top-link ${isActive ? 'active' : ''}`}>
            相册
          </NavLink>
          {/* <NavLink to="/suki" className={({ isActive }) => `top-link ${isActive ? 'active' : ''}`}>
            Suki
          </NavLink> */}
          <NavLink to="/calendar" className={({ isActive }) => `top-link ${isActive ? 'active' : ''}`}>
            日历
          </NavLink>
        </nav>

        <main className="page-content">
          <Routes>
            <Route path="/" element={<Navigate to="/calendar" replace />} />
            <Route path="/album" element={<AlbumPage />} />
            <Route path="/album/:sha256" element={<AlbumDetailPage />} />
            {/* <Route path="/suki" element={<SukiPage />} /> */}
            <Route path="/calendar" element={<Calendar />} />
            <Route path="*" element={<Navigate to="/calendar" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
