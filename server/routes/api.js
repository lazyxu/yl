import { Router } from 'express';
import { readPhotos, normalizeMedia, deletePhoto, createPhoto } from '../utils/helpers.js';
import path from 'node:path';
import { unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import logger from '../utils/logger.js';

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

export default router;