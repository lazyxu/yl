import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import MediaViewer from './MediaViewer';

const PhotoCard = ({ photo, onRemove }) => {
  const [isViewerOpen, setViewerOpen] = useState(false);
  const [currentMedia, setCurrentMedia] = useState(null);

  const handleOpenViewer = (media, event) => {
    event.stopPropagation();
    setCurrentMedia(media);
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setCurrentMedia(null);
  };

  const photoUrl = `/api/photos/sha256/${photo.sha256}/file`;

  return (
    <>
      <article className="photo-card">
        {photo.mediaType === 'video' ? (
          <video
            className="photo-video"
            src={`${photo.url}`}
            controls
            preload="metadata"
            onClick={(e) => handleOpenViewer(photo, e)}
          />
        ) : (
          <img
            className="photo-image"
            src={photoUrl}
            alt={photo.name}
            onClick={(e) => handleOpenViewer(photo, e)}
          />
        )}
        <div className="photo-footer">
          <span className="photo-name" title={photo.name}>{photo.name}</span>
          <Link className="detail-link" to={`/album/${photo.sha256}`}>详情</Link>
          <button type="button" className="remove-btn" onClick={() => onRemove(photo.sha256)}>
            移除
          </button>
        </div>
      </article>
      {isViewerOpen && currentMedia && (
        <MediaViewer media={currentMedia} onClose={handleCloseViewer} />
      )}
    </>
  );
};

export default PhotoCard;