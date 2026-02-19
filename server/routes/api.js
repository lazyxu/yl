import { Router } from 'express';
import { readPhotos, writePhotos, normalizeMedia } from '../utils/helpers.js';
import { createHash } from 'node:crypto';
import logger from '../utils/logger.js';

const router = Router();

router.get('/photos', async (req, res) => {
  logger.info('Fetching all photos');
  const photos = await readPhotos();
  logger.info(`Fetched ${photos.length} photos`);
  res.json(photos);
});

router.post('/photos', async (req, res) => {
  logger.info('Adding a new photo');
  const photos = await readPhotos();
  const hash = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
  const newPhoto = normalizeMedia({
    id: hash,
    ...req.body,
  });
  photos.push(newPhoto);
  await writePhotos(photos);
  logger.info(`New photo added with ID: ${hash}`);
  res.status(201).json(newPhoto);
});

router.delete('/photos/:id', async (req, res) => {
  const { id } = req.params;
  logger.info(`Deleting photo with ID: ${id}`);
  const photos = await readPhotos();
  const updatedPhotos = photos.filter((photo) => photo.id !== id);
  if (photos.length === updatedPhotos.length) {
    logger.warn(`Photo with ID: ${id} not found`);
    return res.status(404).json({ message: 'Photo not found' });
  }
  await writePhotos(updatedPhotos);
  logger.info(`Photo with ID: ${id} deleted`);
  res.status(204).end();
});

export default router;