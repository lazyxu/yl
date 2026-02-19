import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

const MediaViewer = ({ media, onClose }) => {
  const videoRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let hls;

    // const showError = (message) => {
    //   setErrorMessage(message);
    //   setTimeout(() => setErrorMessage(''), 5000); // Clear error after 5 seconds
    // };
    const showError = console.error;
    showError("test");
    if (media.mediaType === 'video' && media.url.endsWith('.mov')) {
      if (Hls.isSupported()) {
        showError('HLS.js is supported. Attempting to load the video.');
        hls = new Hls();
        hls.loadSource(media.url);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          showError('HLS manifest successfully loaded.');
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                showError('网络错误：加载视频时发生问题。');
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                showError('媒体错误：播放视频时发生问题。');
                break;
              default:
                showError('发生了不可恢复的错误，请稍后再试。');
                hls.destroy();
                break;
            }
          }
        });
      } else if (videoRef.current.canPlayType('video/mp4')) {
        showError('HLS.js is not supported. Falling back to native playback.');
        videoRef.current.src = media.url;
      } else {
        showError('您的浏览器不支持播放此视频。');
      }
    } else {
      showError('This is not a .mov video file.');
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [media]);

  return (
    <div className="viewer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="viewer-content" onClick={(e) => e.stopPropagation()}>
        { <div className="error-banner">232546</div>}
        {media.mediaType === 'video' ? (
          <video ref={videoRef} controls autoPlay className="video-js" />
        ) : (
          <img src={media.url} alt={media.name} />
        )}
      </div>
      <button className="viewer-close" onClick={onClose}>关闭</button>
    </div>
  );
};

export default MediaViewer;