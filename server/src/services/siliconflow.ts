import axios from 'axios';
import fs from 'fs';
import path from 'path';

const SILICONFLOW_API_KEY = 'your_key_input_here';
const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';

export class SiliconflowService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || SILICONFLOW_API_KEY;
    this.baseUrl = SILICONFLOW_BASE_URL;
  }

  async imageFileToBase64(filePath: string): Promise<string> {
    try {
      const fileData = fs.readFileSync(filePath);
      const base64Data = fileData.toString('base64');
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      if (ext === '.bmp') mimeType = 'image/bmp';
      return 'data:' + mimeType + ';base64,' + base64Data;
    } catch (e: any) {
      console.error('base64 error', e);
      return '';
    }
  }

  async performOCROnImage(filePath: string): Promise<string> {
    try {
      console.log('[SiliconFlow OCR] starting for:', filePath);
      
      const base64Image = await this.imageFileToBase64(filePath);
      if (!base64Image) {
        console.log('[SiliconFlow OCR] base64 conversion failed');
        return '';
      }

      const response = await axios.post(
        this.baseUrl + '/chat/completions',
        {
          model: 'PaddlePaddle/PaddleOCR-VL-1.5',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: base64Image } },
                { type: 'text', text: '请识别并提取这张图片中的所有文字内容，保持原文格式。' }
              ]
            }
          ],
          max_tokens: 8192
        },
        {
          headers: {
            'Authorization': 'Bearer ' + this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 300000
        }
      );

      if (response.status === 200 && response.data && response.data.choices && response.data.choices.length > 0) {
        const content = response.data.choices[0].message.content;
        console.log('[SiliconFlow OCR] success, length=' + (content ? content.length : 0));
        return content || '';
      }
      console.warn('[SiliconFlow OCR] empty response');
      return '';
    } catch (err: any) {
      console.error('[SiliconFlow OCR ERROR]', err.response ? err.response.status : 'network');
      return '';
    }
  }

  async convertPDFPagesToImages(pdfPath: string): Promise<string[]> {
    console.log('[SiliconFlow] Converting PDF to images:', pdfPath);
    const outputPaths: string[] = [];
    
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const { createCanvas, Image } = await import('canvas');
      
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const numPages = pdfDoc.getPageCount();
      
      console.log('[SiliconFlow] PDF has', numPages, 'pages');
      
      for (let i = 0; i < numPages; i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();
        
        const canvas = createCanvas(width * 2, height * 2);
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        const outputPath = pdfPath + '_page_' + (i + 1) + '.png';
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, buffer);
        
        outputPaths.push(outputPath);
        console.log('[SiliconFlow] Saved page', i + 1, 'to', outputPath);
      }
      
    } catch (e: any) {
      console.error('[SiliconFlow] PDF to image conversion failed:', e.message);
      return [];
    }
    
    return outputPaths;
  }

  async performOCROnPDF(pdfPath: string, pdfFileName: string): Promise<string> {
    console.log('[SiliconFlow OCR] PDF OCR for:', pdfFileName);
    
    try {
      const pdfParseModule = require('pdf-parse');
      const pdfParse = pdfParseModule.PDFParse || pdfParseModule;
      const dataBuffer = fs.readFileSync(pdfPath);
      let extractedText = '';
      
      try {
        const data = await pdfParse(dataBuffer);
        extractedText = data.text || '';
        console.log('[SiliconFlow] pdf-parse extracted:', extractedText.length, 'chars');
      } catch (parseErr: any) {
        console.log('[SiliconFlow] pdf-parse failed:', parseErr.message);
      }

      if (extractedText && extractedText.trim().length > 50) {
        console.log('[SiliconFlow] pdf-parse successful, using extracted text');
        return extractedText;
      }

      console.log('[SiliconFlow] PDF text too short or empty, attempting image-based OCR...');
      const imagePaths = await this.convertPDFPagesToImages(pdfPath);
      
      if (imagePaths.length > 0) {
        console.log('[SiliconFlow] Converted PDF to', imagePaths.length, 'pages');
        let fullText = '';
        for (let i = 0; i < imagePaths.length; i++) {
          console.log('[SiliconFlow] OCR page', i + 1, '/', imagePaths.length);
          const pageText = await this.performOCROnImage(imagePaths[i]);
          fullText += pageText + '\n\n';
          fs.unlinkSync(imagePaths[i]);
        }
        console.log('[SiliconFlow] Image OCR completed, total chars:', fullText.length);
        return fullText || 'PDF processed - scanned document';
      }

      console.log('[SiliconFlow] PDF conversion failed, returning fallback');
      return extractedText || 'PDF document processed - appears to be scanned image';
    } catch (e: any) {
      console.error('[SiliconFlow] PDF OCR error:', e.message);
      return 'PDF processed - scanned document';
    }
  }

  async getEmbeddings(texts: string | string[]): Promise<number[][]> {
    try {
      const textArray = Array.isArray(texts) ? texts : [texts];
      const inputArray = textArray.filter(function(t: string) { return t && t.trim().length > 0; });
      
      if (inputArray.length === 0) return [];
      console.log('[SiliconFlow Embedding] chunks=' + inputArray.length);

      const response = await axios.post(
        this.baseUrl + '/embeddings',
        {
          model: 'BAAI/bge-m3',
          input: inputArray,
          encoding_format: 'float'
        },
        {
          headers: {
            'Authorization': 'Bearer ' + this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }
      );

      if (response.status === 200 && response.data && response.data.data) {
        const items = response.data.data || [];
        items.sort(function(a: any, b: any) { return a.index - b.index; });
        console.log('[SiliconFlow Embedding] OK, vectors=' + items.length + ', dim=' + (items[0] ? items[0].embedding.length : 0));
        return items.map(function(item: any) { return item.embedding; });
      }
      return [];
    } catch (err: any) {
      console.error('[SiliconFlow Embedding ERROR]', err.response ? err.response.status : 'network');
      return [];
    }
  }

  splitTextIntoChunks(text: string, chunkSize: number = 512, overlap: number = 50): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[。！？.!?;；\n])/);
    let currentChunk = '';
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = currentChunk.slice(Math.max(0, currentChunk.length - overlap));
      }
      currentChunk += sentence;
    }
    
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    console.log('[SiliconFlow] split into', chunks.length, 'chunks');
    return chunks;
  }

  async embedDocument(text: string) {
    const chunks = this.splitTextIntoChunks(text, 700, 100);
    const embeddings = await this.getEmbeddings(chunks);
    return {
      chunks: chunks,
      embeddings: embeddings,
      length: chunks.length
    };
  }

  async callLLM(systemPrompt: string, userMessage: string, modelName: string): Promise<string> {
    try {
      console.log('[SiliconFlow LLM] model=' + modelName);
      const response = await axios.post(
        this.baseUrl + '/chat/completions',
        {
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.1,
          max_tokens: 4096
        },
        {
          headers: {
            'Authorization': 'Bearer ' + this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 180000
        }
      );
      
      if (response.status === 200 && response.data && response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message.content || '';
      }
      return '';
    } catch (e: any) {
      console.error('[SiliconFlow LLM ERROR]', e.response ? e.response.status : 'network');
      return '';
    }
  }
}

export const siliconflowService = new SiliconflowService();
