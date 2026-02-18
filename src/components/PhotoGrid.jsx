import React from 'react';
import PhotoCard from './PhotoCard';

const PhotoGrid = ({ photos, onRemove, onOpenViewer }) => {
  return (
    <div className="photo-grid">
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          onRemove={onRemove}
          onOpenViewer={onOpenViewer}
        />
      ))}
    </div>
  );
};

export default PhotoGrid;