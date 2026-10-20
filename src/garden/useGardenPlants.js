
import { useCallback, useEffect, useRef, useState } from 'react'
import { gardenRequest } from '../gardenApi'

export default function useGardenPlants(active, notify) {
  const [plants, setPlants] = useState([])
  const [species, setSpecies] = useState([])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(Boolean(active))
  const [error, setError] = useState('')
  const [plantCursor, setPlantCursor] = useState(null)
  const [plantHasMore, setPlantHasMore] = useState(false)
  const [plantTotal, setPlantTotal] = useState(0)
  const [plantLoadingMore, setPlantLoadingMore] = useState(false)
  const generation = useRef(0)
  const activeController = useRef(null)
  const pageController = useRef(null)
  const paging = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 260)
    return () => clearTimeout(timer)
  }, [search])

  const fetchSpecies = useCallback(async () => {
    try { setSpecies(await gardenRequest('/species')) }
    catch (err) { notify(err.message, true) }
  }, [notify])

  const loadPlants = useCallback(async (cursor = null) => {
    const version = cursor ? generation.current : ++generation.current
    const controller = new AbortController()
    if (!cursor) {
      activeController.current?.abort()
      pageController.current?.abort()
      activeController.current = controller
      setLoading(true)
      setError('')
      setPlantLoadingMore(false)
      paging.current = false
    } else {
      pageController.current = controller
    }
    try {
      const path = '/plants?status=all&q=' + encodeURIComponent(query) + '&limit=36' +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
      const page = await gardenRequest(path, { signal: controller.signal })
      if (version !== generation.current || controller.signal.aborted) return
      setPlants(previous => cursor
        ? [...previous, ...page.items.filter(item => !previous.some(loaded => loaded.id === item.id))]
        : page.items)
      setPlantTotal(page.total)
      setPlantHasMore(page.has_more)
      setPlantCursor(page.next_cursor)
    } catch (err) {
      if (err.name !== 'AbortError' && version === generation.current) {
        setError(err.message)
      }
    } finally {
      if (version === generation.current) {
        if (cursor) { setPlantLoadingMore(false); paging.current = false }
        else setLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    if (!active) return
    fetchSpecies()
    loadPlants()
    return () => {
      generation.current++
      activeController.current?.abort()
      pageController.current?.abort()
    }
  }, [active, fetchSpecies, loadPlants])

  const refresh = useCallback(() => loadPlants(), [loadPlants])
  const loadMorePlants = useCallback(async () => {
    if (!plantHasMore || !plantCursor || paging.current) return
    paging.current = true
    setPlantLoadingMore(true)
    await loadPlants(plantCursor)
  }, [plantHasMore, plantCursor, loadPlants])

  return {
    plants, species, search, query, setSearch, loading, error,
    plantHasMore, plantTotal, plantLoadingMore, fetchSpecies, refresh, loadMorePlants,
  }
}
