import { useCallback, useEffect, useRef, useState } from 'react'
import { gardenRequest } from '../gardenApi'

// Shared, cancellable paging state for the garden listing and species selector.
export default function useGardenPlants(active, notify) {
  const [plants, setPlants] = useState([])
  const [species, setSpecies] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(false)
  const [plantCursor, setPlantCursor] = useState(null)
  const [plantHasMore, setPlantHasMore] = useState(false)
  const [plantTotal, setPlantTotal] = useState(0)
  const [plantLoadingMore, setPlantLoadingMore] = useState(false)
  const plantRequestGeneration = useRef(0)
  const fetchSpecies = useCallback(() =>
    gardenRequest('/species').then(setSpecies).catch(err => notify(err.message, true)), [notify])
  const loadPlants = useCallback(async (signal, cursor = null) => {
    const generation = cursor ? plantRequestGeneration.current : ++plantRequestGeneration.current
    if (!cursor) setLoading(true)
    try {
      const path = '/plants?status=' + status + '&q=' + encodeURIComponent(search) + '&limit=36' +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
      const page = await gardenRequest(path, { signal })
      if (!signal?.aborted && generation === plantRequestGeneration.current) {
        setPlants(previous => cursor ? [...previous, ...page.items] : page.items)
        setPlantTotal(page.total)
        setPlantHasMore(page.has_more)
        setPlantCursor(page.next_cursor)
      }
    } catch (err) { if (err.name !== 'AbortError') notify(err.message, true) }
    finally {
      if (!signal?.aborted && !cursor && generation === plantRequestGeneration.current) setLoading(false)
    }
  }, [search, status, notify])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    fetchSpecies()
    loadPlants(controller.signal)
    return () => { controller.abort(); plantRequestGeneration.current++ }
  }, [active, fetchSpecies, loadPlants])
  function refresh() { return loadPlants() }
  async function loadMorePlants() {
    if (!plantHasMore || !plantCursor || plantLoadingMore) return
    setPlantLoadingMore(true)
    try { await loadPlants(undefined, plantCursor) }
    finally { setPlantLoadingMore(false) }
  }
  return {
    plants, species, search, setSearch, status, setStatus, loading,
    plantHasMore, plantTotal, plantLoadingMore, fetchSpecies, refresh, loadMorePlants,
  }
}
