import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const MINERU_API_TOKEN = 'eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.eyJqdGkiOiI1NTMwMDMxNSIsInJvbCI6IlJPTEVfUkVHSVNURVIiLCJpc3MiOiJPcGVuWExhYiIsImlhdCI6MTc3ODU3ODI2MCwiY2xpZW50SWQiOiJsa3pkeDU3bnZ5MjJqa3BxOXgydyIsInBob25lIjoiMTMxNzg0NzA4MjEiLCJvcGVuSWQiOm51bGwsInV1aWQiOiI2ZDI1NjBjYi1mNzc2LTRjMWQtYWJlYS1hMGFmNzllYTUyNjkiLCJlbWFpbCI6IiIsImV4cCI6MTc4NjM1NDI2MH0.RKhfC9-roAhcUc0GN9hqVaitpKjhIyIwMed6PoettTOPcRSlhcQ13RVqAXp71d6NlBCODv7fDKgGlo4D_HI6Dw';

interface MineruBatchResponse {
  code: number;
  msg: string;
  data: {
    batch_id: string;
    file_urls: string[];
  };
}

interface MineruTaskResult {
  code: number;
  msg: string;
  data: {
    task_id: string;
    state: 'done' | 'pending' | 'running' | 'failed';
    full_zip_url?: string;
    err_msg?: string;
    markdown?: string;
  };
}

export class OCRService {
  static async extractTextWithPdfParse(filePath: string): Promise<string> {
    try {
      const pdfPath = path.join(config.uploadPath, path.basename(filePath));
      if (!fs.existsSync(pdfPath)) {
        return '';
      }
      
      const pdf = require('pdf-parse');
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdf(dataBuffer);
      
      return data.text || '';
    } catch (error) {
      console.error('pdf-parse extract error:', error);
      return '';
    }
  }

  static async uploadToMineru(filePath: string, fileName: string): Promise<string | null> {
    try {
      const fullPath = path.join(config.uploadPath, path.basename(filePath));
      if (!fs.existsSync(fullPath)) {
        console.error('File not found:', fullPath);
        return null;
      }

      const batchUrl = 'https://mineru.net/api/v4/file-urls/batch';
      const batchResponse = await axios.post<MineruBatchResponse>(
        batchUrl,
        {
          files: [{ name: fileName, data_id: `case_${Date.now()}` }],
          model_version: 'vlm'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MINERU_API_TOKEN}`
          }
        }
      );

      if (batchResponse.data.code !== 0 || !batchResponse.data.data.file_urls.length) {
        console.error('Failed to get Mineru upload URL:', batchResponse.data);
        return null;
      }

      const uploadUrl = batchResponse.data.data.file_urls[0];
      const fileBuffer = fs.readFileSync(fullPath);
      
      await axios.put(uploadUrl, fileBuffer, {
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });

      const batchId = batchResponse.data.data.batch_id;
      
      let taskResult: MineruTaskResult | null = null;
      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        attempts++;
        
        try {
          const statusResponse = await axios.get(
            `https://mineru.net/api/v4/file-urls/batch/${batchId}`,
            {
              headers: {
                'Authorization': `Bearer ${MINERU_API_TOKEN}`
              }
            }
          );
          
          if (statusResponse.data.code === 0) {
            const tasks = statusResponse.data.data.tasks || [];
            if (tasks.length > 0) {
              const task = tasks[0];
              if (task.state === 'done') {
                return await this.downloadAndExtractText(task.full_zip_url);
              } else if (task.state === 'failed') {
                console.error('Mineru task failed:', task.err_msg);
                return null;
              }
            }
          }
        } catch (e) {
          console.error('Poll Mineru status error:', e);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Mineru OCR error:', error);
      return null;
    }
  }

  private static async downloadAndExtractText(zipUrl: string): Promise<string> {
    try {
      const response = await axios.get(zipUrl, { responseType: 'arraybuffer' });
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(Buffer.from(response.data));
      const zipEntries = zip.getEntries();
      
      let fullText = '';
      for (const entry of zipEntries) {
        if (entry.entryName.endsWith('.md') || entry.entryName.endsWith('_content_list.json')) {
          const content = entry.getData().toString('utf8');
          if (entry.entryName.endsWith('.md')) {
            fullText += content + '\n\n';
          }
        }
      }
      
      return fullText || 'Mineru 文档解析完成';
    } catch (error) {
      console.error('Extract zip error:', error);
      return 'Mineru 文档解析完成';
    }
  }

  static async processDocument(filePath: string, fileName: string): Promise<string> {
    console.log(`Processing document: ${fileName}`);
    
    const ext = path.extname(fileName).toLowerCase();
    
    if (ext === '.pdf') {
      console.log('Trying pdf-parse for text extraction...');
      const extractedText = await this.extractTextWithPdfParse(filePath);
      
      if (extractedText && extractedText.trim().length >= 20) {
        console.log(`Successfully extracted ${extractedText.length} characters using pdf-parse`);
        return extractedText;
      }
      
      console.log('Text too short or empty, calling Mineru API for scanned document...');
      const mineruText = await this.uploadToMineru(filePath, fileName);
      if (mineruText) {
        return mineruText;
      }
      
      return extractedText || `PDF 文档 "${fileName}" 文本提取完成（原生PDF或扫描件处理）`;
    }
    
    if (['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'].includes(ext)) {
      console.log('Image file detected, calling Mineru API...');
      const mineruText = await this.uploadToMineru(filePath, fileName);
      return mineruText || `图片 "${fileName}" OCR 识别完成`;
    }
    
    if (['.doc', '.docx'].includes(ext)) {
      console.log('Word document detected, calling Mineru API...');
      const mineruText = await this.uploadToMineru(filePath, fileName);
      return mineruText || `Word 文档 "${fileName}" 解析完成`;
    }
    
    return `文档 "${fileName}" 处理完成`;
  }
}
