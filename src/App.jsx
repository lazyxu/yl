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
    // open as modal when called from inventory
    setPindouModalOpen(true)
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
          <Toolbar variant="dense" sx={{gap:0,py:0,minHeight:40}}>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontSize: { xs: '0.95rem', sm: '1rem' }, lineHeight: 1.1, py:0 }}>
              {view}
            </Typography>
            <Button color="inherit" size="small" onClick={() => setView('日历')} sx={{minWidth:40,px:1,py:0,ml:0}}>日历</Button>
            <Button color="inherit" size="small" onClick={() => setView('拼豆')} sx={{minWidth:40,px:1,py:0,ml:0}}>拼豆</Button>
          </Toolbar>
        </AppBar>

        {/* spacer to offset fixed AppBar */}
        <Toolbar variant="dense" sx={{minHeight:40}} />

        <Box component="main" sx={{ p: 0, maxWidth: '100%', mx: 0, width: '100%' }}>
          {view === '日历' && <Calendar />}
          {view === '拼豆' && (
            <Inventory onAction={(op, rows)=>openPindouWith(op, rows)} refreshKey={inventoryRefreshKey} />
          )}

          {pindouModalOpen && (
            <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,background:'rgba(0,0,0,0.3)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
              <div style={{width:'96%',maxWidth:900,background:'#fff',borderRadius:6,padding:16,boxShadow:'0 6px 24px rgba(0,0,0,0.2)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <Typography variant="h6" sx={{fontSize:{xs:'1.05rem', sm:'1.25rem'}}}>添加提醒</Typography>
                  <IconButton onClick={()=>setPindouModalOpen(false)}><span style={{fontSize:18}}>✖</span></IconButton>
                </div>
                <PindouReminder initialOperation={operationForForm} initialRows={initialRowsForForm} onClose={() => setPindouModalOpen(false)} onAdded={onPindouAdded} />
              </div>
            </div>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
