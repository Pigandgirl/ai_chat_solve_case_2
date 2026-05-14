import express from 'express';
import cors from 'cors';
import { config } from './config';
import routes from './routes';
import { initJSONData } from './services/jsonDB';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

app.use('/api', routes);

initJSONData();

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});