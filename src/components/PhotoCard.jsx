import React from 'react';
import { Link } from 'react-router-dom';

const PhotoCard = ({ photo, onRemove, onOpenViewer }) => {
  return (
    <article className="photo-card">
      {photo.mediaType === 'video' ? (
        <video
          className="photo-video"
          src={photo.url}
          controls
          preload="metadata"
          onClick={(e) => onOpenViewer(photo, e)}
        />
      ) : (
        <img
          className="photo-image"
          src={photo.url}
          alt={photo.name}
          onClick={(e) => onOpenViewer(photo, e)}
        />
      )}
      <div className="photo-footer">
        <span className="photo-name" title={photo.name}>{photo.name}</span>
        <Link className="detail-link" to={`/album/${photo.id}`}>详情</Link>
        <button type="button" className="remove-btn" onClick={() => onRemove(photo.id)}>
          移除
        </button>
      </div>
    </article>
  );
};

export default PhotoCard;