import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from 'react'
import './App.css'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import IconButton from '@mui/material/IconButton'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PaletteIcon from '@mui/icons-material/Palette'
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined'
import Typography from '@mui/material/Typography'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import { UNSAFE_DataRouterContext, useSearchParams } from 'react-router-dom'
import { createPindouDraft } from './pindouDraft'
import useKeyboardViewport from './useKeyboardViewport'
import PWAUpdatePrompt from './offline/PWAUpdatePrompt'

const Calendar = React.lazy(() => import('./Calendar'))
const Inventory = React.lazy(() => import('./Inventory'))
const PindouConsume = React.lazy(() => import('./PindouConsume'))
const History = React.lazy(() => import('./History'))
const Garden = React.lazy(() => import('./Garden'))
const views = ['日历', '拼豆', '历史', '补豆', '消耗', '花园']
const createAppTheme = (mode, garden) => createTheme({
  palette: {
    mode,
    primary: { main: garden ? '#347c52' : '#1976d2' },
    success: { main: '#347c52' },
    background: mode === 'dark' ? { default: '#101914', paper: '#1b2921' } : { default: '#f7faf7', paper: '#ffffff' },
  },
  shape: { borderRadius: 14 },
  typography: { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' },
  components: {
    MuiButton: { styleOverrides: { root: { minHeight: 44, textTransform: 'none', borderRadius: 12 } } },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiToggleButton: { styleOverrides: { root: { minHeight: 44 } } },
    MuiCheckbox: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiInputBase: { styleOverrides: { root: { minHeight: 44 }, input: { fontSize: 16 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
  },
})
function systemPrefersDark() {
  return Boolean(typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

function DeferredPageFallback() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 180)
    return () => clearTimeout(timer)
  }, [])
  return <div className="page-loading" role={show ? 'status' : undefined} aria-live="polite">
    {show && <Typography variant="caption" color="text.secondary">正在打开页面…</Typography>}
  </div>
}

function Page({ name, active, positions, children }) {
  const element = useRef(null)
  useLayoutEffect(() => {
    if (active && element.current) element.current.scrollTop = positions.current[name] || 0
  }, [active, name, positions])
  return (
    <section ref={element} className="app-page" data-view={name} aria-label={name} hidden={!active}
      onScroll={event => { if (active) positions.current[name] = event.currentTarget.scrollTop }}>
      <Suspense fallback={<DeferredPageFallback />}>{children}</Suspense>
    </section>
  )
}

function App() {
  const [searchParams, setSearchParams] = useSearchParams()
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  const [dark, setDark] = useState(systemPrefersDark)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const update = event => setDark(Boolean(event.matches))
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  const requestedView = searchParams.get('view') || '日历'
  const view = views.includes(requestedView) ? requestedView : '日历'
  // Calendar and Garden follow system appearance; Pindou keeps its established look.
  const gardenMode = view === '花园'
  const appearance = (gardenMode || view === '日历') && dark ? 'dark' : 'light'
  const theme = useMemo(() => createAppTheme(appearance, gardenMode), [appearance, gardenMode])
  useEffect(() => {
    document.documentElement.dataset.theme = appearance
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', appearance === 'dark' ? '#101914' : '#f7faf7')
  }, [appearance])
  const [visited, setVisited] = useState(() => new Set([view]))
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0)
  const [drafts, setDrafts] = useState(() => ({ 补豆: createPindouDraft(), 消耗: createPindouDraft() }))
  const [formBusy, setFormBusy] = useState(false)
  const lastPindouView = useRef(['拼豆', '历史', '补豆', '消耗'].includes(view) ? view : '拼豆')
  const currentView = useRef(view)
  const positions = useRef({})
  const { keyboardOpen, height } = useKeyboardViewport()
  const primaryView = view === '日历' ? '日历' : view === '花园' ? '花园' : '拼豆'
  const isForm = view === '补豆' || view === '消耗'
  const isModulePage = view === '日历' || view === '拼豆' || view === '花园'

  useEffect(() => {
    currentView.current = view
    if (['拼豆', '历史', '补豆', '消耗'].includes(view)) lastPindouView.current = view
    setVisited(previous => previous.has(view) ? previous : new Set([...previous, view]))
  }, [view])

  const navigateToView = useCallback(nextView => {
    if (nextView === view) return
    const commit = () => {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('view', nextView)
      setSearchParams(nextParams)
    }
    // Editors may veto in-app navigation and continue it only after the user
    // explicitly discards a dirty form. Leave browser unload protection intact.
    // Production routes have native navigation blockers, including Safari
    // history POPs. MemoryRouter tests retain the original narrow event guard.
    if (dataRouter) { commit(); return }
    const intent = new CustomEvent('yl:navigation-intent', { cancelable: true,
      detail: { proceed: commit, target: nextView } })
    if (window.dispatchEvent(intent)) commit()
  }, [searchParams, setSearchParams, view, dataRouter])

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
      <div className="app-shell" data-module-page={isModulePage} data-module={primaryView} data-theme={appearance} data-keyboard-open={keyboardOpen} style={keyboardOpen ? { '--keyboard-height': `${height}px` } : undefined}>
        {!isModulePage && <header className="app-header">
          <IconButton aria-label="返回库存" disabled={formBusy} onClick={() => navigateToView('拼豆')}><ArrowBackIcon /></IconButton>
          <Typography component="h1" className="app-title">{view}</Typography>
        </header>}
        <main className="app-content">
          {(visited.has('日历') || view === '日历') && <Page name="日历" active={view === '日历'} positions={positions}><Calendar active={view === '日历'} /></Page>}
          {(visited.has('拼豆') || view === '拼豆') && <Page name="拼豆" active={view === '拼豆'} positions={positions}><Inventory active={view === '拼豆'} onAction={openPindouWith} refreshKey={inventoryRefreshKey} onNavigate={navigateToView} /></Page>}
          {(visited.has('历史') || view === '历史') && <Page name="历史" active={view === '历史'} positions={positions}><History active={view === '历史'} refreshKey={inventoryRefreshKey} /></Page>}
          {(visited.has('花园') || view === '花园') && <Page name="花园" active={view === '花园'} positions={positions}><Garden active={view === '花园'} /></Page>}
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
            onChange={(_, value) => navigateToView(value === '拼豆' ? lastPindouView.current : value)}>
            <BottomNavigationAction label="日历" value="日历" aria-current={primaryView === '日历' ? 'page' : undefined} icon={<CalendarMonthIcon />} disabled={formBusy} />
            <BottomNavigationAction label="拼豆" value="拼豆" aria-current={primaryView === '拼豆' ? 'page' : undefined} icon={<PaletteIcon />} disabled={formBusy} />
            <BottomNavigationAction label="花园" value="花园" aria-current={primaryView === '花园' ? 'page' : undefined} icon={<LocalFloristOutlinedIcon />} disabled={formBusy} />
          </BottomNavigation>
        </footer>
        <PWAUpdatePrompt currentView={view} />
      </div>
    </ThemeProvider>
  )
}

export default App
