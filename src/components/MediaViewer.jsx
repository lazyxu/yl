import React from 'react';

const MediaViewer = ({ media, onClose }) => {
  return (
    <div className="viewer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="viewer-content" onClick={(e) => e.stopPropagation()}>
        {media.mediaType === 'video' ? (
          <video src={media.url} controls autoPlay />
        ) : (
          <img src={media.url} alt={media.name} />
        )}
      </div>
      <button className="viewer-close" onClick={onClose}>关闭</button>
    </div>
  );
};

export default MediaViewer;