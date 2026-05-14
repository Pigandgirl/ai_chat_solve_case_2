import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/law_case_system',
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key',
  jwtExpiresIn: '7d',
  minimaxApiKey: process.env.MINIMAX_API_KEY || '',
  uploadPath: process.env.UPLOAD_PATH || './uploads'
};