import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PhotoCard from '../components/PhotoCard'
import MediaViewer from '../components/MediaViewer'
import PhotoGrid from '../components/PhotoGrid'

function AlbumPage() {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [albumName, setAlbumName] = useState('未分类')
  const [viewMode, setViewMode] = useState('album')

  const totalSizeText = useMemo(() => {
    const totalSize = photos.reduce((sum, photo) => sum + (photo.size || 0), 0)
    if (totalSize < 1024 * 1024) {
      return `${(totalSize / 1024).toFixed(1)} KB`
    }
    return `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
  }, [photos])

  const mediaStatsText = useMemo(() => {
    const photoCount = photos.filter((item) => item.mediaType !== 'video').length
    const videoCount = photos.filter((item) => item.mediaType === 'video').length
    return `照片 ${photoCount} 张 · 视频 ${videoCount} 个`
  }, [photos])

  const photosByAlbum = useMemo(() => {
    const grouped = photos.reduce((accumulator, media) => {
      const key = media.album || '未分类'
      if (!accumulator[key]) {
        accumulator[key] = []
      }
      accumulator[key].push(media)
      return accumulator
    }, {})

    return Object.entries(grouped)
      .sort((left, right) => right[1].length - left[1].length)
      .map(([name, list]) => [
        name,
        [...list].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
      ])
  }, [photos])

  const photosByTime = useMemo(
    () => [...photos].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
    [photos],
  )

  const fetchPhotos = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/photos')
      if (!response.ok) {
        throw new Error('加载相册失败')
      }
      const data = await response.json()
      setPhotos(data || [])
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : '加载相册失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(file)
    })

  const onUpload = async (event) => {
    const fileList = Array.from(event.target.files || [])
    if (fileList.length === 0) {
      return
    }

    const mediaFiles = fileList.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'))

    if (mediaFiles.length === 0) {
      setError('仅支持图片和视频上传')
      event.target.value = ''
      return
    }

    setError('')
    try {
      await Promise.all(
        mediaFiles.map(async (file) => {
          const data = await fileToDataUrl(file)
          const response = await fetch('/api/photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file.name,
              type: file.type,
              album: albumName,
              data,
            }),
          })

          if (!response.ok) {
            const failed = await response.json().catch(() => ({}))
            throw new Error(failed.message || `上传失败：${file.name}`)
          }
        }),
      )
      await fetchPhotos()
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : '上传失败'
      setError(message)
    }
    event.target.value = ''
  }

  const removePhoto = async (id) => {
    setError('')
    try {
      const response = await fetch(`/api/photos/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const failed = await response.json().catch(() => ({}))
        throw new Error(failed.message || '删除失败')
      }
      setPhotos((prev) => prev.filter((photo) => photo.id !== id))
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : '删除失败'
      setError(message)
    }
  }

  const clearAll = async () => {
    setError('')
    try {
      const response = await fetch('/api/photos', { method: 'DELETE' })
      if (!response.ok) {
        const failed = await response.json().catch(() => ({}))
        throw new Error(failed.message || '清空失败')
      }
      setPhotos([])
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : '清空失败'
      setError(message)
    }
  }

  useEffect(() => {
    fetchPhotos()
  }, [])
  const [viewer, setViewer] = useState(null)

  const closeViewer = () => {
    setViewer(null)
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeViewer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const openViewer = (media, ev) => {
    setViewer(media)
    try {
      // try native fullscreen on the clicked element (user gesture)
      const el = ev?.currentTarget
      if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {})
    } catch {
      /* ignore */
    }
  }

  const renderCard = (photo) => (
    <PhotoCard
      key={photo.id}
      photo={photo}
      onRemove={removePhoto}
      onOpenViewer={openViewer}
    />
  )

  return (
    <section className="page-card">
      <h2 className="page-title">相册</h2>
      <p className="page-desc">支持照片/视频上传、按相册分组和按时间排序。</p>
      {error && <p className="upload-error">{error}</p>}
      <div className="upload-tools">
        <input
          className="album-input"
          value={albumName}
          onChange={(event) => setAlbumName(event.target.value)}
          placeholder="输入相册名，例如：旅行"
        />
        <label className="upload-btn">
          选择媒体上传
          <input type="file" accept="image/*,video/*" multiple onChange={onUpload} />
        </label>
        <span className="upload-meta">已上传 {photos.length} 个 · {mediaStatsText} · {totalSizeText}</span>
        <button type="button" className="clear-btn" onClick={clearAll} disabled={photos.length === 0}>
          清空
        </button>
      </div>

      <div className="view-switch">
        <button
          type="button"
          className={`switch-btn ${viewMode === 'album' ? 'active' : ''}`}
          onClick={() => setViewMode('album')}
        >
          按相册
        </button>
        <button
          type="button"
          className={`switch-btn ${viewMode === 'time' ? 'active' : ''}`}
          onClick={() => setViewMode('time')}
        >
          按时间
        </button>
      </div>

      {loading && <p className="upload-meta">加载中...</p>}

      {!loading && photos.length === 0 && <p className="upload-meta">还没有媒体，先上传一张照片或一个视频吧。</p>}

      {!loading && photos.length > 0 && viewMode === 'time' && (
        <PhotoGrid photos={photosByTime} onRenderCard={renderCard} />
      )}

      {!loading && photos.length > 0 && viewMode === 'album' && (
        <div className="album-section-list">
          {photosByAlbum.map(([name, list]) => (
            <section key={name} className="album-section">
              <div className="album-section-head">
                <h3 className="album-section-title">{name}</h3>
                <span className="upload-meta">{list.length} 个</span>
              </div>
              <PhotoGrid photos={list} onRenderCard={renderCard} />
            </section>
          ))}
        </div>
      )}

      {viewer && (
        <MediaViewer
          media={viewer}
          onClose={closeViewer}
        />
      )}
    </section>
  )
}

export default AlbumPage
