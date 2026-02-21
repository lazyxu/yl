import { Router } from 'express';
import { readPhotos, normalizeMedia, deletePhoto, createPhoto } from '../utils/helpers.js';
import path from 'node:path';
import { unlink, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import logger from '../utils/logger.js';
import ffmpeg from 'fluent-ffmpeg';

const router = Router();

router.get('/photos', async (req, res) => {
  logger.info('Fetching all photos');
  try {
    const photos = await readPhotos();
    logger.info(`Fetched ${photos.length} photos`);
    res.json(photos);
  } catch (err) {
    logger.error(`Failed to fetch photos: ${err.message}`);
    res.status(500).json({ message: 'Failed to fetch photos' });
  }
});

router.post('/photos', async (req, res) => {
  logger.info('Adding a new photo');
  try {
    const sha256 = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    const newPhoto = normalizeMedia({
      sha256,
      ...req.body,
    });
    await createPhoto(newPhoto);
    logger.info(`New photo added with sha256: ${sha256}`);
    res.status(201).json(newPhoto);
  } catch (err) {
    logger.error(`Failed to add photo: ${err.message}`);
    res.status(500).json({ message: 'Failed to add photo' });
  }
});

router.delete('/photos/:id', async (req, res) => {
  const { id } = req.params;
  logger.info(`Deleting photo with ID: ${id}`);
  try {
    const photo = await deletePhoto(id);
    logger.info(`Photo with ID: ${id} deleted`);
    res.status(204).end();
  } catch (err) {
    logger.error(`Failed to delete photo: ${err.message}`);
    res.status(500).json({ message: 'Failed to delete photo' });
  }
});

router.delete('/photos', async (req, res) => {
  logger.info('Deleting all photos');
  try {
    await deletePhoto();
    logger.info('All photos deleted');
    res.status(204).end();
  } catch (err) {
    logger.error(`Failed to delete all photos: ${err.message}`);
    res.status(500).json({ message: 'Failed to delete all photos' });
  }
});

router.delete('/photos/sha256/:sha256', async (req, res) => {
  const { sha256 } = req.params;
  logger.info(`Deleting photo with sha256: ${sha256}`);
  try {
    const photo = await deletePhoto(sha256);
    logger.info(`Photo with sha256: ${sha256} deleted`);
    res.status(204).end();
  } catch (err) {
    logger.error(`Failed to delete photo: ${err.message}`);
    res.status(500).json({ message: 'Failed to delete photo' });
  }
});

router.get('/photos/sha256/:sha256', async (req, res) => {
  const { sha256 } = req.params;
  logger.info(`Fetching metadata for sha256: ${sha256}`);

  try {
    const photo = await readPhotos().then((photos) => photos.find((p) => p.sha256 === sha256));
    if (!photo) {
      logger.warn(`Metadata not found for sha256: ${sha256}`);
      return res.status(404).json({ message: 'Metadata not found' });
    }
    res.json(photo);
  } catch (err) {
    logger.error(`Failed to fetch metadata for sha256 ${sha256}: ${err.message}`);
    res.status(500).json({ message: 'Failed to fetch metadata' });
  }
});

router.get('/photos/sha256/:sha256/file', async (req, res) => {
  const { sha256 } = req.params;
  logger.info(`Fetching file directly from uploads for sha256: ${sha256}`);

  const filePath = path.join(process.cwd(), 'uploads', sha256);
  try {
    await stat(filePath); // Ensure file exists
    res.sendFile(filePath);
  } catch (err) {
    logger.error(`Failed to fetch file for sha256 ${sha256}: ${err.message}`);
    res.status(404).json({ message: 'File not found' });
  }
});

router.get('/photos/sha256/:sha256/thumbnail', async (req, res) => {
  const { sha256 } = req.params;
  logger.info(`Fetching thumbnail for sha256: ${sha256}`);

  const thumbnailDir = path.join(process.cwd(), 'uploads', 'thumbnails');
  const thumbnailPath = path.join(thumbnailDir, `${sha256}.jpg`);
  const originalFilePath = path.join(process.cwd(), 'uploads', sha256);

  try {
    // Check if thumbnail exists
    await stat(thumbnailPath);
    res.sendFile(thumbnailPath);
  } catch {
    logger.info(`Thumbnail not found for sha256: ${sha256}, generating...`);

    try {
      // Ensure the original file exists
      await stat(originalFilePath);

      // Ensure the thumbnails directory exists
      await mkdir(thumbnailDir, { recursive: true });

      // Fetch mimeType from the database
      const photo = await readPhotos().then((photos) => photos.find((p) => p.sha256 === sha256));
      if (!photo) {
        logger.warn(`Metadata not found for sha256: ${sha256}`);
        return res.status(404).json({ message: 'Metadata not found' });
      }
      const mediaType = photo.mediaType;

      if (mediaType === 'video') {
        await new Promise((resolve, reject) => {
          ffmpeg(originalFilePath)
            .screenshots({
              timestamps: ['50%'],
              filename: `${sha256}.jpg`,
              folder: thumbnailDir,
              size: '200x?'
            })
            .on('end', resolve)
            .on('error', reject);
        });
      } else {
        // Generate thumbnail for images (including animated formats) using sharp
        const sharp = await import('sharp');
        await sharp.default(originalFilePath)
          .resize(200) // Resize to 200px width, adjust as needed
          .toFile(thumbnailPath);
      }

      logger.info(`Thumbnail generated for sha256: ${sha256}`);
      res.sendFile(thumbnailPath);
    } catch (err) {
      logger.error(`Failed to generate thumbnail for sha256 ${sha256}: ${err.message}`);
      res.status(500).json({ message: 'Failed to generate thumbnail' });
    }
  }
});

export default router;