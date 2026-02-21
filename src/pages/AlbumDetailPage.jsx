import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

function AlbumDetailPage() {
  const { sha256 } = useParams()
  const [media, setMedia] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/photos/sha256/${sha256}`)
        if (!response.ok) {
          const failed = await response.json().catch(() => ({}))
          throw new Error(failed.message || '加载详情失败')
        }
        const data = await response.json()
        setMedia(data)
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : '加载详情失败'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchDetail()
  }, [sha256])

  return (
    <section className="page-card">
      <div className="detail-top">
        <h2 className="page-title">媒体详情</h2>
        <Link className="back-link" to="/album">返回相册</Link>
      </div>

      {loading && <p className="upload-meta">加载中...</p>}
      {error && <p className="upload-error">{error}</p>}

      {!loading && media && (
        <>
          <div className="detail-preview" onClick={() => {
            const el = document.querySelector('.detail-image') || document.querySelector('.detail-video')
            if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {})
          }}>
            {media.mediaType === 'video' ? (
              <video className="detail-video" src={`/api/photos/sha256/${media.sha256}/file`} controls preload="metadata" />
            ) : (
              <img className="detail-image" src={`/api/photos/sha256/${media.sha256}/file`} alt={media.name} />
            )}
          </div>

          <div className="detail-meta">
            <p><strong>名称：</strong>{media.name}</p>
            <p><strong>类型：</strong>{media.mediaType === 'video' ? '视频' : '照片'}</p>
            <p><strong>相册：</strong>{media.album || '未分类'}</p>
            <p><strong>大小：</strong>{Math.max((media.size || 0) / 1024, 0.1).toFixed(1)} KB</p>
            <p><strong>上传时间：</strong>{new Date(media.createdAt).toLocaleString()}</p>
          </div>
        </>
      )}
    </section>
  )
}

export default AlbumDetailPage
