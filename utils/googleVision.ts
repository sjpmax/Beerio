import vision from '@google-cloud/vision';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export default client;
