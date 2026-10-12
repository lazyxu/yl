import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, Suspense } from 'react'
import './App.css'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import IconButton from '@mui/material/IconButton'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PaletteIcon from '@mui/icons-material/Palette'
import Typography from '@mui/material/Typography'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import { useSearchParams } from 'react-router-dom'
import { createPindouDraft } from './pindouDraft'
import useKeyboardViewport from './useKeyboardViewport'

const Calendar = React.lazy(() => import('./Calendar'))
const Inventory = React.lazy(() => import('./Inventory'))
const PindouConsume = React.lazy(() => import('./PindouConsume'))
const History = React.lazy(() => import('./History'))
const views = ['日历', '拼豆', '历史', '补豆', '消耗']
const theme = createTheme({
  palette: { mode: 'light' },
  components: {
    MuiButton: { styleOverrides: { root: { minHeight: 44 } } },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiToggleButton: { styleOverrides: { root: { minHeight: 44 } } },
    MuiCheckbox: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiInputBase: { styleOverrides: { root: { minHeight: 44 }, input: { fontSize: 16 } } },
  },
})

function Page({ name, active, positions, children }) {
  const element = useRef(null)
  useLayoutEffect(() => {
    if (active && element.current) element.current.scrollTop = positions.current[name] || 0
  }, [active, name, positions])
  return (
    <section ref={element} className="app-page" data-view={name} aria-label={name} hidden={!active}
      onScroll={event => { if (active) positions.current[name] = event.currentTarget.scrollTop }}>
      <Suspense fallback={<div className="page-loading" role="status">正在加载…</div>}>{children}</Suspense>
    </section>
  )
}

function App() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view') || '日历'
  const view = views.includes(requestedView) ? requestedView : '日历'
  const [visited, setVisited] = useState(() => new Set([view]))
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0)
  const [drafts, setDrafts] = useState(() => ({ 补豆: createPindouDraft(), 消耗: createPindouDraft() }))
  const [formBusy, setFormBusy] = useState(false)
  const lastPindouView = useRef(view === '日历' ? '拼豆' : view)
  const currentView = useRef(view)
  const positions = useRef({})
  const { keyboardOpen, height } = useKeyboardViewport()
  const primaryView = view === '日历' ? '日历' : '拼豆'
  const isForm = view === '补豆' || view === '消耗'

  useEffect(() => {
    currentView.current = view
    if (view !== '日历') lastPindouView.current = view
    setVisited(previous => previous.has(view) ? previous : new Set([...previous, view]))
  }, [view])

  const navigateToView = useCallback(nextView => {
    if (nextView === view) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', nextView)
    setSearchParams(nextParams)
  }, [searchParams, setSearchParams, view])

  function openPindouWith(operation, initialRows = null) {
    if (initialRows?.length) setDrafts(previous => ({ ...previous, [operation]: createPindouDraft(initialRows) }))
    navigateToView(operation)
  }

  function clearDraft(operation) {
    setDrafts(previous => ({ ...previous, [operation]: createPindouDraft() }))
    positions.current[operation] = 0
  }

  function onPindouAdded(operation) {
    clearDraft(operation)
    setInventoryRefreshKey(key => key + 1)
    if (currentView.current === operation) navigateToView('拼豆')
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="app-shell" data-keyboard-open={keyboardOpen} style={keyboardOpen ? { '--keyboard-height': `${height}px` } : undefined}>
        <header className="app-header">
          {view !== '日历' && view !== '拼豆' && <IconButton aria-label="返回库存" disabled={formBusy} onClick={() => navigateToView('拼豆')}><ArrowBackIcon /></IconButton>}
          <Typography component="h1" className="app-title">{view}</Typography>
        </header>
        <main className="app-content">
          {(visited.has('日历') || view === '日历') && <Page name="日历" active={view === '日历'} positions={positions}><Calendar active={view === '日历'} /></Page>}
          {(visited.has('拼豆') || view === '拼豆') && <Page name="拼豆" active={view === '拼豆'} positions={positions}><Inventory active={view === '拼豆'} onAction={openPindouWith} refreshKey={inventoryRefreshKey} onNavigate={navigateToView} /></Page>}
          {(visited.has('历史') || view === '历史') && <Page name="历史" active={view === '历史'} positions={positions}><History active={view === '历史'} onNavigate={navigateToView} refreshKey={inventoryRefreshKey} /></Page>}
          {isForm && <Page key={view} name={view} active positions={positions}>
            <PindouConsume initialOperation={view} draft={drafts[view]}
              loading={formBusy}
              onDraftChange={update => setDrafts(previous => ({ ...previous, [view]: update(previous[view]) }))}
              onBusyChange={setFormBusy}
              onClose={() => { clearDraft(view); navigateToView('拼豆') }}
              onAdded={() => onPindouAdded(view)} />
          </Page>}
        </main>
        <footer className="app-footer" hidden={keyboardOpen}>
          <BottomNavigation component="nav" aria-label="主导航" showLabels value={primaryView}
            onChange={(_, value) => navigateToView(value === '拼豆' ? lastPindouView.current : '日历')}>
            <BottomNavigationAction label="日历" value="日历" aria-current={primaryView === '日历' ? 'page' : undefined} icon={<CalendarMonthIcon />} disabled={formBusy} />
            <BottomNavigationAction label="拼豆" value="拼豆" aria-current={primaryView === '拼豆' ? 'page' : undefined} icon={<PaletteIcon />} disabled={formBusy} />
          </BottomNavigation>
        </footer>
      </div>
    </ThemeProvider>
  )
}

export default App
