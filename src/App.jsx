import { useState } from 'react'
import './App.css'
import Calendar from './Calendar'
import PindouReminder from './PindouReminder'
import Inventory from './Inventory'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import IconButton from '@mui/material/IconButton'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'

function App() {
  const [view, setView] = useState('日历')
  const [operationForForm, setOperationForForm] = useState('补豆')
  const [pindouModalOpen, setPindouModalOpen] = useState(false)
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0)
  const [initialRowsForForm, setInitialRowsForForm] = useState(null)

  const theme = createTheme({
    palette: { mode: 'light' }
  })

  function openPindouWith(op, initialRows = null) {
    setOperationForForm(op)
    setInitialRowsForForm(initialRows)
    // navigate to 补豆 page when requested
    setView('补豆')
  }

  function onPindouAdded() {
    // bump key so Inventory refetches
    setInventoryRefreshKey(k => k + 1)
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, height: '100vh', overflowY: 'auto' }}>
        <AppBar position="fixed" sx={{py:0}}>
          <Toolbar variant="dense" sx={{gap:0,py:0,height:40}}>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontSize: { xs: '0.95rem', sm: '1rem' }, lineHeight: 1.1, py:0 }}>
              {view === '补豆' ? operationForForm : view}
            </Typography>
            {view === '补豆' && (
              <IconButton color="inherit" size="small" onClick={() => setView('拼豆')} sx={{ mr: 1 }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            )}
            <Button color="inherit" size="small" onClick={() => setView('日历')} sx={{minWidth:40,px:1,py:0,ml:0}}>日历</Button>
            <Button color="inherit" size="small" onClick={() => setView('拼豆')} sx={{minWidth:40,px:1,py:0,ml:0}}>拼豆</Button>
          </Toolbar>
        </AppBar>

        {/* spacer to offset fixed AppBar */}
        <Toolbar variant="dense" sx={{height:40}} />

        <Box component="main" sx={{ p: 0, maxWidth: '100%', mx: 0, width: '100%' }}>
          {view === '日历' && <Calendar />}
          {view === '拼豆' && (
            <Inventory onAction={(op, rows)=>openPindouWith(op, rows)} refreshKey={inventoryRefreshKey} />
          )}

          {view === '补豆' && (
            <Box sx={{ p: 1 }}>
              <PindouReminder initialOperation={operationForForm} initialRows={initialRowsForForm} onClose={() => setView('拼豆')} onAdded={() => { onPindouAdded(); setView('拼豆') }} />
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
