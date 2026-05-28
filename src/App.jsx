import React, { useState, lazy, Suspense } from 'react'
import './App.css'
import Calendar from './Calendar'
const PindouConsume = lazy(() => import('./PindouConsume'))
const History = lazy(() => import('./History'))
import Inventory from './Inventory'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
// use a simple Box as header instead of MUI AppBar/Toolbar
import IconButton from '@mui/material/IconButton'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import Box from '@mui/material/Box'
import { useSearchParams } from 'react-router-dom'

function App() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') || '日历'
  const [operationForForm, setOperationForForm] = React.useState('补豆')
  const [pindouModalOpen, setPindouModalOpen] = useState(false)
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0)
  const [initialRowsForForm, setInitialRowsForForm] = useState(null)

  function navigateToView(v) {
    setSearchParams({ view: v })
  }

  const theme = createTheme({
    palette: { mode: 'light' }
  })

  

  function openPindouWith(op, initialRows = null) {
    setOperationForForm(op)
    setInitialRowsForForm(initialRows)
    // navigate to corresponding page
    if (op === '补豆') navigateToView('补豆')
    else if (op === '消耗') navigateToView('消耗')
  }

  function onPindouAdded() {
    // bump key so Inventory refetches
    setInventoryRefreshKey(k => k + 1)
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', '--appbar-h': '40px' }}>
        <Box
          component="header"
          role="banner"
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            // include safe-area inset in height and padding to avoid notch/status-bar overlap
            paddingTop: 'env(safe-area-inset-top)',
            minHeight: 'calc(var(--appbar-h) + env(safe-area-inset-top))',
            height: 'calc(var(--appbar-h) + env(safe-area-inset-top))',
            gap: 0,
            py: 0,
            zIndex: (t) => t.zIndex.appBar,
            // 临时背景色，便于在真机上验证（部署前移除）
            bgcolor: 'rgba(0,0,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            px: 1
          }}
        >
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontSize: { xs: '0.95rem', sm: '1rem' }, lineHeight: 1.1, py: 0 }}>
              {view === '补豆' ? operationForForm : view}
            </Typography>
            <ButtonGroup
              color="inherit"
              variant="text"
              size="small"
              sx={{
                ml: 0,
                gap: 1,
                borderRadius: 1,
                bgcolor: 'action.hover',
                '& .MuiButton-root': {
                  borderRadius: 1,
                  px: 1.2,
                  py: 0.4,
                  minWidth: 72,
                  fontWeight: 500,
                },
              }}
            >
              <Button
                variant={'text'}
                color={'inherit'}
                onClick={() => navigateToView('日历')}
                sx={{ fontSize: '0.95rem' }}
                disableElevation
              >
                日历
              </Button>
              <Button
                variant={'text'}
                color={'inherit'}
                onClick={() => navigateToView('拼豆')}
                sx={{ fontSize: '0.95rem' }}
                disableElevation
              >
                拼豆
              </Button>
            </ButtonGroup>
        </Box>

        <Box component="main" sx={{ p: 0, pt: 'calc(var(--appbar-h) + env(safe-area-inset-top))', maxWidth: '100vw', mx: 0, width: '100vw', boxSizing: 'border-box', flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
          {view === '日历' && <Calendar />}
          {view === '拼豆' && (
            <Inventory onAction={(op, rows) => openPindouWith(op, rows)} refreshKey={inventoryRefreshKey} onNavigate={(v) => navigateToView(v)} />
          )}

          {view === '历史' && (
            <Box sx={{ p: 1 }}>
              <Suspense fallback={<div>加载中...</div>}>
                <History onNavigate={(v) => navigateToView(v)} refreshKey={inventoryRefreshKey} />
              </Suspense>
            </Box>
          )}

          {view === '补豆' && (
            <Box sx={{ p: 1 }}>
              <Suspense fallback={<div>加载中...</div>}>
                <PindouConsume initialOperation={operationForForm} initialRows={initialRowsForForm} onClose={() => navigateToView('拼豆')} onAdded={() => { onPindouAdded(); navigateToView('拼豆') }} />
              </Suspense>
            </Box>
          )}

          {view === '消耗' && (
            <Box sx={{ p: 1 }}>
              <Suspense fallback={<div>加载中...</div>}>
                <PindouConsume initialRows={initialRowsForForm} onClose={() => navigateToView('拼豆')} onAdded={() => { onPindouAdded(); navigateToView('拼豆') }} />
              </Suspense>
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
